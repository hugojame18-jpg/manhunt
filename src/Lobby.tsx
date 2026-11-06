import { useMemo, useRef, useState, type ReactNode } from 'react'
import {
  ArrowLeftRight,
  Biohazard,
  Check,
  Copy,
  Crown,
  Flame,
  Info,
  LogOut,
  Map as IconeCarte,
  Minus,
  Play,
  Plus,
  Share,
  ShieldX,
  Trash2,
  Undo2,
  X,
} from 'lucide-react'
import { changerRole, lancerPartie, modifierPartie, retirerJoueur, type ReglagesPartie } from './api'
import { Carte, type Hotspot } from './Carte'
import { useGeoloc } from './hooks'
import type { Evenement, Joueur, LatLng, Partie, Point, Role } from './jeu'
import { MAX_JOUEURS, aUneZone, centrePartie, distanceM, peutLancer } from './jeu'
import { Avatar, COULEUR_ROLE, ICONE_ROLE, MessageErreur, NOM_ROLE, Spinner, useAction, useConfirm, type OptionsConfirm } from './ui'

export interface PropsEcran {
  partie: Partie
  joueurs: Joueur[]
  evenements: Evenement[]
  moi: Joueur
  now: number
  recharger: () => Promise<void>
  onQuitter: () => void
}

const DESCRIPTION_ROLE: Record<Role, string> = {
  runner: 'Fuis et reste caché',
  chasseur: 'Traque les runners',
}

const DESCRIPTION_MODE = {
  classique: 'Les runners attrapés sont éliminés. La partie se termine quand tous les runners sont attrapés.',
  infection: 'Les runners attrapés deviennent chasseurs. La partie se termine quand tous les runners sont attrapés.',
}

export const INFOS: Record<string, Omit<OptionsConfirm, 'confirmer'>> = {
  jokerChasseur: {
    titre: 'Joker chasseur',
    message:
      "Un joker force immédiatement un ping réel du runner choisi, sans attendre l'intervalle normal. Tous les chasseurs voient ce ping.",
  },
  jokerRunner: {
    titre: 'Joker runner',
    message:
      'Un joker permet au runner de choisir sur la carte une fausse position (dans la zone) : au prochain ping, les chasseurs le verront là au lieu de sa vraie position.',
  },
  avance: {
    titre: 'Avance des runners',
    message: 'Au lancement, les runners ont ce temps pour s’enfuir avant que la chasse commence. Les pings démarrent après.',
  },
  hotspots: {
    titre: 'Hotspots',
    message:
      'Tant qu’un runner reste dans un hotspot, les chasseurs reçoivent un ping de lui toutes les 2 minutes et le runner gagne un joker. Les chasseurs ne voient un hotspot que lorsqu’un runner est dedans.',
  },
  dehors: {
    titre: 'Temps limite hors zone',
    message:
      'Les runners hors de la zone sont visibles en direct par les chasseurs. Une fois le temps autorisé (cumulé) écoulé, le runner est considéré comme attrapé.',
  },
}

export function Lobby({ partie, joueurs, moi, recharger, onQuitter }: PropsEcran) {
  const { occupe, erreur, setErreur, lancer } = useAction()
  const [modal, confirmer] = useConfirm()
  const [copie, setCopie] = useState(false)
  const [editeur, setEditeur] = useState<'zone' | 'hotspots' | null>(null)
  const [brouillon, setBrouillon] = useState<ReglagesPartie>({})
  const versions = useRef(new Map<string, number>())
  const r: Partie = { ...partie, ...brouillon }
  const admin = partie.admin_id === moi.id
  const lienPartage = `${location.origin}${location.pathname}?code=${partie.code}`
  const nomAdmin = joueurs.find((j) => j.id === partie.admin_id)?.pseudo ?? "l'hôte"
  const nbRunners = joueurs.filter((j) => j.role === 'runner').length
  const nbChasseurs = joueurs.length - nbRunners

  /** Modification optimiste d'un réglage : affichée tout de suite, enregistrée en arrière-plan. */
  const regler = (champs: ReglagesPartie) => {
    setBrouillon((b) => ({ ...b, ...champs }))
    const v = new Map(Object.keys(champs).map((k) => [k, (versions.current.get(k) ?? 0) + 1]))
    v.forEach((n, k) => versions.current.set(k, n))
    void modifierPartie(partie.id, champs)
      .then(recharger)
      .catch((e: unknown) => setErreur(e instanceof Error ? e.message : 'Réglage non enregistré'))
      .finally(() =>
        setBrouillon((b) => {
          const suite = { ...b }
          v.forEach((n, k) => {
            if (versions.current.get(k) === n) delete suite[k as keyof ReglagesPartie]
          })
          return suite
        }),
      )
  }

  const info = (cle: keyof typeof INFOS) => void confirmer({ ...INFOS[cle], confirmer: 'OK', info: true, icone: Info })

  const agir = (action: () => Promise<void>) =>
    lancer(async () => {
      await action()
      await recharger()
    })

  const copier = async () => {
    try {
      await navigator.clipboard.writeText(partie.code)
      setCopie(true)
      window.setTimeout(() => setCopie(false), 1500)
    } catch {
      setErreur('Copie impossible : note le code à la main.')
    }
  }

  const partager = async () => {
    try {
      await navigator.share({ title: 'Manhunt', text: `Rejoins ma partie de Manhunt ! Code : ${partie.code}`, url: lienPartage })
    } catch {
      // partage annulé
    }
  }

  const quitter = async () => {
    const ok = await confirmer({
      titre: 'Quitter la partie ?',
      message: admin ? 'Tu es l’hôte : la partie restera en attente sans toi.' : 'Tu pourras revenir avec le même code et le même pseudo.',
      confirmer: 'Quitter',
      ton: 'danger',
      icone: LogOut,
    })
    if (!ok) return
    if (!admin) void retirerJoueur(moi.id).catch(() => undefined)
    onQuitter()
  }

  const retirer = async (j: Joueur) => {
    const ok = await confirmer({ titre: `Retirer ${j.pseudo} ?`, message: 'Il pourra revenir avec le code.', confirmer: 'Retirer', ton: 'danger', icone: X })
    if (ok) void agir(() => retirerJoueur(j.id))
  }

  const hotspotsCarte = useMemo<Hotspot[]>(() => r.hotspots.map(([lat, lng]) => ({ pos: { lat, lng } })), [r.hotspots])

  if (editeur) {
    return (
      <EditeurCarte
        type={editeur}
        partie={r}
        onFermer={() => setEditeur(null)}
        onValider={(points) => {
          regler(editeur === 'zone' ? { zone_poly: points.length >= 3 ? points : null } : { hotspots: points })
          setEditeur(null)
        }}
      />
    )
  }

  return (
    <div className="page">
      {modal}
      <div className="barre-haut">
        <h1>Salon</h1>
        <button className="btn-icone discret" onClick={() => void quitter()} aria-label="Quitter la partie">
          <LogOut size={20} aria-hidden />
        </button>
      </div>

      <section className="carte-code" aria-label="Code de la partie">
        <span className="surtitre">Code de la partie</span>
        <div className="cases" aria-label={partie.code}>
          {Array.from(partie.code).map((c, i) => (
            <span key={i}>{c}</span>
          ))}
        </div>
        <div className="rangee">
          <button className="btn btn-clair btn-petit" style={{ flex: 1 }} onClick={() => void copier()}>
            {copie ? <Check size={18} aria-hidden /> : <Copy size={18} aria-hidden />}
            {copie ? 'Copié' : 'Copier'}
          </button>
          {'share' in navigator && (
            <button className="btn btn-clair btn-petit" style={{ flex: 1 }} onClick={() => void partager()}>
              <Share size={18} aria-hidden />
              Inviter
            </button>
          )}
        </div>
      </section>

      {joueurs.length < 2 && (
        <p className="note">
          <Info size={18} aria-hidden />
          Tu es seul dans le salon. Partage le code pour que tes potes rejoignent. Il faut au moins un chasseur et un runner.
        </p>
      )}

      <section className="bloc">
        <div className="bloc-titre">
          <h2>Ton rôle</h2>
        </div>
        <div className="tuiles" role="radiogroup" aria-label="Ton rôle">
          {(['runner', 'chasseur'] as const).map((role) => {
            const Icone = ICONE_ROLE[role]
            const actif = moi.role === role
            return (
              <button
                key={role}
                role="radio"
                aria-checked={actif}
                className={`tuile${actif ? ' actif' : ''}`}
                style={{ ['--c' as string]: COULEUR_ROLE[role] }}
                onClick={() => !actif && void agir(() => changerRole(moi.id, role))}
              >
                <span className="tuile-icone">
                  <Icone size={22} aria-hidden />
                </span>
                <strong>{NOM_ROLE[role]}</strong>
                <small>{DESCRIPTION_ROLE[role]}</small>
                {actif && (
                  <span className="coche">
                    <Check size={15} strokeWidth={3} aria-hidden />
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </section>

      <section className="bloc">
        <div className="bloc-titre">
          <h2>Joueurs</h2>
          <span>
            {nbChasseurs} chasseur{nbChasseurs > 1 ? 's' : ''} · {nbRunners} runner{nbRunners > 1 ? 's' : ''} · {joueurs.length}/{MAX_JOUEURS}
          </span>
        </div>
        <ul className="liste">
          {joueurs.map((j) => {
            const Icone = ICONE_ROLE[j.role]
            return (
              <li key={j.id}>
                <Avatar nom={j.pseudo} couleur={COULEUR_ROLE[j.role]} />
                <div className="corps">
                  <span className="nom">
                    {j.pseudo}
                    {j.id === partie.admin_id && (
                      <span className="badge or">
                        <Crown size={12} aria-hidden /> Hôte
                      </span>
                    )}
                    {j.id === moi.id && <span className="badge">Toi</span>}
                  </span>
                  <span className="sous" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: COULEUR_ROLE[j.role] }}>
                    <Icone size={14} aria-hidden /> {NOM_ROLE[j.role]}
                  </span>
                </div>
                {admin && j.id !== moi.id && (
                  <div className="droite">
                    <button
                      className="btn-icone discret"
                      aria-label={`Passer ${j.pseudo} en ${j.role === 'runner' ? 'chasseur' : 'runner'}`}
                      onClick={() => void agir(() => changerRole(j.id, j.role === 'runner' ? 'chasseur' : 'runner'))}
                    >
                      <ArrowLeftRight size={18} aria-hidden />
                    </button>
                    <button className="btn-icone discret danger" aria-label={`Retirer ${j.pseudo}`} onClick={() => void retirer(j)}>
                      <X size={18} aria-hidden />
                    </button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </section>

      <section className="bloc">
        <div className="bloc-titre">
          <h2>Réglages</h2>
          {!admin && <span>Définis par {nomAdmin}</span>}
        </div>

        <div className="segmente" role="radiogroup" aria-label="Mode de jeu">
          {(['classique', 'infection'] as const).map((m) => (
            <button key={m} role="radio" aria-checked={r.mode === m} className={r.mode === m ? 'actif' : ''} disabled={!admin} onClick={() => regler({ mode: m })}>
              {m === 'classique' ? <ShieldX size={17} aria-hidden /> : <Biohazard size={17} aria-hidden />}
              {m === 'classique' ? 'Classique' : 'Infection'}
            </button>
          ))}
        </div>
        <p className="aide" style={{ textAlign: 'left' }}>
          {DESCRIPTION_MODE[r.mode]}
        </p>

        <Reglage titre="Durée de la partie">
          <Stepper valeur={r.duree_min} min={5} max={180} pas={5} unite="min" actif={admin} onChange={(v) => regler({ duree_min: v, ...(r.intervalle_min >= v ? { intervalle_min: Math.max(1, v - 5) } : {}) })} />
        </Reglage>
        <Reglage titre="Intervalle des pings">
          <Stepper valeur={r.intervalle_min} min={1} max={Math.min(30, r.duree_min - 1)} pas={1} unite="min" actif={admin} onChange={(v) => regler({ intervalle_min: v })} />
        </Reglage>
        <Reglage titre="Avance des runners" onInfo={() => info('avance')}>
          <Stepper valeur={r.avance_min} min={0} max={15} pas={1} unite="min" actif={admin} onChange={(v) => regler({ avance_min: v })} />
        </Reglage>
        <Reglage titre="Jokers par chasseur" onInfo={() => info('jokerChasseur')}>
          <Stepper valeur={r.jokers_chasseur} min={0} max={10} pas={1} actif={admin} onChange={(v) => regler({ jokers_chasseur: v })} />
        </Reglage>
        <Reglage titre="Jokers par runner" onInfo={() => info('jokerRunner')}>
          <Stepper valeur={r.jokers_runner} min={0} max={10} pas={1} actif={admin} onChange={(v) => regler({ jokers_runner: v })} />
        </Reglage>
      </section>

      <section className="bloc">
        <div className="bloc-titre">
          <h2>Avancé</h2>
        </div>

        <div className="apercu-carte">
          <Carte zone={r.zone_poly} centreDefaut={centrePartie(r)} hotspots={hotspotsCarte} recadrer={(r.zone_poly?.length ?? 0) + r.hotspots.length} />
        </div>

        <Reglage titre="Zone de jeu" sous={aUneZone(r) ? `${r.zone_poly?.length} points` : 'Facultative · aucune zone'}>
          {admin && (
            <button className="btn btn-secondaire btn-petit" onClick={() => setEditeur('zone')}>
              <IconeCarte size={18} aria-hidden /> {aUneZone(r) ? 'Modifier' : 'Dessiner'}
            </button>
          )}
        </Reglage>

        <Reglage titre="Temps limite hors zone" onInfo={() => info('dehors')} sous={!aUneZone(r) ? 'Nécessite une zone de jeu' : undefined}>
          <Interrupteur actif={r.limite_dehors && aUneZone(r)} desactive={!admin || !aUneZone(r)} onChange={(v) => regler({ limite_dehors: v })} label="Temps limite hors zone" />
        </Reglage>
        {r.limite_dehors && aUneZone(r) && (
          <Reglage titre="Temps autorisé dehors (cumulé)">
            <Stepper valeur={r.dehors_max_min} min={1} max={30} pas={1} unite="min" actif={admin} onChange={(v) => regler({ dehors_max_min: v })} />
          </Reglage>
        )}

        <Reglage titre="Hotspots" onInfo={() => info('hotspots')} sous={r.hotspots.length ? `${r.hotspots.length} placé${r.hotspots.length > 1 ? 's' : ''}` : 'Facultatifs'}>
          {admin && (
            <button className="btn btn-secondaire btn-petit" onClick={() => setEditeur('hotspots')}>
              <Flame size={18} aria-hidden /> Placer
            </button>
          )}
        </Reglage>
      </section>

      <MessageErreur>{erreur}</MessageErreur>

      <div className="barre-bas">
        {admin ? (
          <>
            <button className="btn btn-primaire" disabled={!peutLancer(joueurs) || occupe} onClick={() => void agir(() => lancerPartie(partie.id))}>
              {occupe ? <Spinner /> : <Play size={20} fill="currentColor" aria-hidden />}
              Lancer la partie
            </button>
            {!peutLancer(joueurs) && <p className="aide">Il faut au moins 1 chasseur et 1 runner.</p>}
          </>
        ) : (
          <div className="attente">
            <Spinner />
            En attente du lancement par {nomAdmin}
          </div>
        )}
      </div>
    </div>
  )
}

function Reglage({ titre, sous, onInfo, children }: { titre: string; sous?: string; onInfo?: () => void; children: ReactNode }) {
  return (
    <div className="reglage">
      <div className="reglage-texte">
        <span>
          {titre}
          {onInfo && (
            <button className="bouton-info" onClick={onInfo} aria-label={`Explication : ${titre}`}>
              <Info size={16} aria-hidden />
            </button>
          )}
        </span>
        {sous && <small>{sous}</small>}
      </div>
      {children}
    </div>
  )
}

function Stepper({
  valeur,
  min,
  max,
  pas,
  unite,
  actif,
  onChange,
}: {
  valeur: number
  min: number
  max: number
  pas: number
  unite?: string
  actif: boolean
  onChange: (v: number) => void
}) {
  if (!actif) return <strong className="valeur-fixe">{valeur}{unite ? ` ${unite}` : ''}</strong>
  return (
    <div className="stepper">
      <button aria-label="Moins" disabled={valeur <= min} onClick={() => onChange(Math.max(min, valeur - pas))}>
        <Minus size={18} aria-hidden />
      </button>
      <span>
        {valeur}
        {unite && <small> {unite}</small>}
      </span>
      <button aria-label="Plus" disabled={valeur >= max} onClick={() => onChange(Math.min(max, valeur + pas))}>
        <Plus size={18} aria-hidden />
      </button>
    </div>
  )
}

function Interrupteur({ actif, desactive, onChange, label }: { actif: boolean; desactive: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button role="switch" aria-checked={actif} aria-label={label} className={`interrupteur${actif ? ' actif' : ''}`} disabled={desactive} onClick={() => onChange(!actif)}>
      <span />
    </button>
  )
}

/** Éditeur plein écran : dessin de la zone (polygone) ou placement des hotspots. */
function EditeurCarte({
  type,
  partie,
  onFermer,
  onValider,
}: {
  type: 'zone' | 'hotspots'
  partie: Partie
  onFermer: () => void
  onValider: (points: Point[]) => void
}) {
  const [points, setPoints] = useState<Point[]>(() => (type === 'zone' ? partie.zone_poly ?? [] : partie.hotspots))
  const [recadrer] = useState(1)
  const geo = useGeoloc(true)
  const zone = type === 'zone' ? points : partie.zone_poly

  const clic = (pos: LatLng) => {
    if (type === 'zone') return setPoints((p) => [...p, [pos.lat, pos.lng]])
    setPoints((p) => {
      const proche = p.findIndex(([lat, lng]) => distanceM(pos, { lat, lng }) < 40)
      return proche >= 0 ? p.filter((_, i) => i !== proche) : [...p, [pos.lat, pos.lng]]
    })
  }

  const valide = type === 'hotspots' || points.length === 0 || points.length >= 3

  return (
    <div className="ecran">
      <Carte
        zone={zone}
        edition={type === 'zone'}
        centreDefaut={geo.position ?? centrePartie(partie)}
        hotspots={(type === 'hotspots' ? points : partie.hotspots).map(([lat, lng]) => ({ pos: { lat, lng }, occupe: type === 'hotspots' }))}
        marqueurs={geo.position ? [{ id: 'moi', pos: geo.position, type: 'moi' }] : []}
        onClic={clic}
        recadrer={recadrer}
        margeHaut={90}
      >
        <div className="flottant-haut">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button className="btn-icone rond" onClick={onFermer} aria-label="Annuler">
              <X size={22} aria-hidden />
            </button>
            <span className="indice">
              {type === 'zone' ? <IconeCarte size={16} aria-hidden /> : <Flame size={16} aria-hidden />}
              {type === 'zone' ? 'Touche la carte pour tracer la zone' : 'Touche pour ajouter ou enlever'}
            </span>
          </div>
        </div>
      </Carte>
      <div className="feuille">
        <div className="feuille-titre">
          <h2>{type === 'zone' ? 'Zone de jeu' : 'Hotspots'}</h2>
          <span>
            {points.length} {type === 'zone' ? 'point' : 'hotspot'}
            {points.length > 1 ? 's' : ''}
          </span>
        </div>
        {type === 'zone' && points.length > 0 && points.length < 3 && <p className="aide" style={{ textAlign: 'left' }}>Encore {3 - points.length} point{3 - points.length > 1 ? 's' : ''} minimum.</p>}
        <div className="rangee">
          {type === 'zone' && (
            <button className="btn btn-secondaire btn-petit" style={{ flex: 1 }} disabled={!points.length} onClick={() => setPoints((p) => p.slice(0, -1))}>
              <Undo2 size={18} aria-hidden /> Retour
            </button>
          )}
          <button className="btn btn-secondaire btn-petit" style={{ flex: 1 }} disabled={!points.length} onClick={() => setPoints([])}>
            <Trash2 size={18} aria-hidden /> Tout effacer
          </button>
        </div>
        <button className="btn btn-primaire" disabled={!valide} onClick={() => onValider(points)}>
          <Check size={20} aria-hidden />
          {type === 'zone' && points.length === 0 ? 'Jouer sans zone' : 'Valider'}
        </button>
      </div>
    </div>
  )
}
