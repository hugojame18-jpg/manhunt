import { useMemo, useRef, useState } from 'react'
import {
  ArrowLeftRight,
  Biohazard,
  BookOpen,
  Check,
  Copy,
  Crown,
  Ellipsis,
  Flame,
  Hourglass,
  Map as IconeCarte,
  Minus,
  Play,
  Plus,
  Radar,
  Share,
  ShieldX,
  Timer,
  Trash2,
  TriangleAlert,
  Undo2,
  UserMinus,
  VenetianMask,
  X,
  Zap,
} from 'lucide-react'
import { changerRole, lancerPartie, modifierPartie, retirerJoueur, type ReglagesPartie } from './api'
import { Carte } from './Carte'
import { useGeoloc } from './hooks'
import type { Evenement, Joueur, LatLng, Partie, Point, Role } from './jeu'
import { MAX_JOUEURS, aUneZone, centrePartie, distanceM, peutLancer } from './jeu'
import {
  Avatar,
  COULEUR_ROLE,
  Feuille,
  FeuilleRegles,
  ICONE_ROLE,
  Interrupteur,
  Ligne,
  MessageErreur,
  NOM_ROLE,
  Section,
  Segmente,
  Spinner,
  useAction,
  useConfirm,
  useMenu,
} from './ui'

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
  runner: 'Tu te caches. Frôle les chasseurs sans te faire prendre pour marquer des points.',
  chasseur: 'Tu traques les runners grâce aux pings et à tes jokers.',
}

const DESCRIPTION_MODE = {
  classique: 'Un runner attrapé est éliminé. La partie se termine quand tous les runners sont attrapés.',
  infection: 'Un runner attrapé devient chasseur. La partie se termine quand tous les runners sont attrapés.',
}

type CleNombre = 'duree_min' | 'intervalle_min' | 'avance_min' | 'jokers_chasseur' | 'jokers_runner'
type CleReglage = CleNombre | 'mode' | 'dehors'

const NOMBRES: Record<CleNombre, { titre: string; unite?: string; min: number; max: (p: Partie) => number; pas: number; aide: string }> = {
  duree_min: { titre: 'Durée de la partie', unite: 'min', min: 5, max: () => 180, pas: 5, aide: 'Temps de chasse, sans compter l’avance des runners.' },
  intervalle_min: { titre: 'Intervalle des pings', unite: 'min', min: 1, max: (p) => Math.min(30, p.duree_min - 1), pas: 1, aide: 'Toutes les combien de minutes les chasseurs voient la position des runners.' },
  avance_min: { titre: 'Avance des runners', unite: 'min', min: 0, max: () => 15, pas: 1, aide: 'Au lancement, les runners ont ce temps pour s’enfuir avant que la chasse commence. Les pings démarrent après.' },
  jokers_chasseur: { titre: 'Jokers par chasseur', min: 0, max: () => 10, pas: 1, aide: 'Un joker révèle tout de suite la vraie position du runner choisi, à tous les chasseurs.' },
  jokers_runner: { titre: 'Jokers par runner', min: 0, max: () => 10, pas: 1, aide: 'Un joker permet de choisir sur la carte une fausse position : au prochain ping, les chasseurs le verront là.' },
}

export function Lobby({ partie, joueurs, moi, recharger, onQuitter }: PropsEcran) {
  const { occupe, erreur, setErreur, lancer } = useAction()
  const [confirmation, confirmer] = useConfirm()
  const [menu, ouvrirMenu] = useMenu()
  const [copie, setCopie] = useState(false)
  const [regles, setRegles] = useState(false)
  const [reglage, setReglage] = useState<CleReglage | null>(null)
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
      danger: true,
    })
    if (!ok) return
    if (!admin) void retirerJoueur(moi.id).catch(() => undefined)
    onQuitter()
  }

  const menuJoueur = (j: Joueur) => {
    const autre: Role = j.role === 'runner' ? 'chasseur' : 'runner'
    ouvrirMenu({
      titre: j.pseudo,
      actions: [
        { label: `Passer en ${NOM_ROLE[autre].toLowerCase()}`, icone: ArrowLeftRight, onClick: () => void agir(() => changerRole(j.id, autre)) },
        { label: 'Retirer de la partie', icone: UserMinus, danger: true, onClick: () => void agir(() => retirerJoueur(j.id)) },
      ],
    })
  }

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

  const ouvrir = (cle: CleReglage) => (admin ? () => setReglage(cle) : undefined)
  const zone = aUneZone(r)

  return (
    <div className="page">
      {confirmation}
      {menu}
      {regles && <FeuilleRegles onFermer={() => setRegles(false)} />}
      {reglage && <FeuilleReglage cle={reglage} partie={r} regler={regler} onFermer={() => setReglage(null)} />}

      <header className="entete">
        <h1>Salon</h1>
        <button className="btn-lien rouge" onClick={() => void quitter()}>
          Quitter
        </button>
      </header>

      <section className="carte-code" aria-label="Code de la partie">
        <small>Code de la partie</small>
        <div className="cases" aria-label={partie.code}>
          {Array.from(partie.code).map((c, i) => (
            <span key={i}>{c}</span>
          ))}
        </div>
        <div className="rangee">
          {'share' in navigator && (
            <button className="btn btn-blanc btn-petit" onClick={() => void partager()}>
              <Share size={17} aria-hidden /> Inviter
            </button>
          )}
          <button className="btn btn-blanc btn-petit" onClick={() => void copier()}>
            {copie ? <Check size={17} aria-hidden /> : <Copy size={17} aria-hidden />}
            {copie ? 'Copié' : 'Copier'}
          </button>
        </div>
      </section>

      <Section titre="Ton rôle" pied={DESCRIPTION_ROLE[moi.role]}>
        <div className="ligne">
          <div style={{ flex: 1 }}>
            <Segmente<Role>
              label="Ton rôle"
              valeur={moi.role}
              onChange={(role) => role !== moi.role && void agir(() => changerRole(moi.id, role))}
              options={[
                { valeur: 'runner', label: 'Runner', icone: ICONE_ROLE.runner },
                { valeur: 'chasseur', label: 'Chasseur', icone: ICONE_ROLE.chasseur },
              ]}
            />
          </div>
        </div>
      </Section>

      <Section
        titre="Joueurs"
        droite={`${joueurs.length}/${MAX_JOUEURS}`}
        pied={joueurs.length < 2 ? 'Tu es seul : touche « Inviter » pour envoyer le lien à tes potes.' : `${nbChasseurs} chasseur${nbChasseurs > 1 ? 's' : ''} · ${nbRunners} runner${nbRunners > 1 ? 's' : ''}`}
      >
        {joueurs.map((j) => {
          const Icone = ICONE_ROLE[j.role]
          return (
            <div className="ligne avec-avatar" key={j.id}>
              <Avatar nom={j.pseudo} couleur={COULEUR_ROLE[j.role]} />
              <div className="ligne-corps">
                <span className="ligne-titre">
                  {j.pseudo}
                  {j.id === partie.admin_id && (
                    <span className="badge jaune">
                      <Crown size={11} aria-hidden /> Hôte
                    </span>
                  )}
                  {j.id === moi.id && <span className="badge">Toi</span>}
                </span>
                <span className="ligne-sous" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: COULEUR_ROLE[j.role] }}>
                  <Icone size={13} aria-hidden /> {NOM_ROLE[j.role]}
                </span>
              </div>
              {admin && j.id !== moi.id && (
                <button className="btn-icone" onClick={() => menuJoueur(j)} aria-label={`Options pour ${j.pseudo}`}>
                  <Ellipsis size={20} aria-hidden />
                </button>
              )}
            </div>
          )
        })}
      </Section>

      <Section titre="Partie" pied={admin ? 'Touche un réglage pour le modifier.' : `Réglages choisis par ${nomAdmin}.`}>
        <Ligne icone={r.mode === 'classique' ? ShieldX : Biohazard} couleur="var(--indigo)" titre="Mode" valeur={r.mode === 'classique' ? 'Classique' : 'Infection'} onClick={ouvrir('mode')} />
        <Ligne icone={Timer} couleur="var(--bleu)" titre="Durée" valeur={`${r.duree_min} min`} onClick={ouvrir('duree_min')} />
        <Ligne icone={Radar} couleur="var(--bleu)" titre="Pings" valeur={`toutes les ${r.intervalle_min} min`} onClick={ouvrir('intervalle_min')} />
        <Ligne icone={Hourglass} couleur="var(--vert)" titre="Avance des runners" valeur={r.avance_min ? `${r.avance_min} min` : 'Aucune'} onClick={ouvrir('avance_min')} />
        <Ligne icone={Zap} couleur="var(--rouge)" titre="Jokers chasseur" valeur={r.jokers_chasseur} onClick={ouvrir('jokers_chasseur')} />
        <Ligne icone={VenetianMask} couleur="var(--violet)" titre="Jokers runner" valeur={r.jokers_runner} onClick={ouvrir('jokers_runner')} />
      </Section>

      <Section titre="Terrain" pied={zone ? undefined : 'Sans zone, on joue partout : la limite hors zone est alors désactivée.'}>
        <Ligne icone={IconeCarte} couleur="var(--vert)" titre="Zone de jeu" valeur={zone ? 'Dessinée' : 'Aucune'} onClick={admin ? () => setEditeur('zone') : undefined} />
        <Ligne
          icone={TriangleAlert}
          couleur="var(--rouge)"
          titre="Limite hors zone"
          valeur={r.limite_dehors && zone ? `${r.dehors_max_min} min` : 'Désactivée'}
          onClick={admin && zone ? () => setReglage('dehors') : undefined}
        />
        <Ligne icone={Flame} couleur="var(--orange)" titre="Hotspots" valeur={r.hotspots.length || 'Aucun'} onClick={admin ? () => setEditeur('hotspots') : undefined} />
      </Section>

      <button className="btn-lien" style={{ alignSelf: 'center' }} onClick={() => setRegles(true)}>
        <BookOpen size={18} aria-hidden /> Comment jouer ?
      </button>

      <MessageErreur>{erreur}</MessageErreur>

      <div className="barre-bas">
        {admin ? (
          <>
            <button className="btn btn-plein" disabled={!peutLancer(joueurs) || occupe} onClick={() => void agir(() => lancerPartie(partie.id))}>
              {occupe ? <Spinner /> : <Play size={18} fill="currentColor" aria-hidden />}
              Lancer la partie
            </button>
            {!peutLancer(joueurs) && <p className="aide" style={{ textAlign: 'center', fontSize: 13 }}>Il faut au moins 1 chasseur et 1 runner.</p>}
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

/** Feuille de modification d'un réglage (hôte uniquement). */
function FeuilleReglage({ cle, partie, regler, onFermer }: { cle: CleReglage; partie: Partie; regler: (c: ReglagesPartie) => void; onFermer: () => void }) {
  if (cle === 'mode') {
    return (
      <Feuille titre="Mode de jeu" onFermer={onFermer}>
        <Segmente
          label="Mode de jeu"
          valeur={partie.mode}
          onChange={(mode) => regler({ mode })}
          options={[
            { valeur: 'classique', label: 'Classique', icone: ShieldX },
            { valeur: 'infection', label: 'Infection', icone: Biohazard },
          ]}
        />
        <p className="aide">{DESCRIPTION_MODE[partie.mode]}</p>
      </Feuille>
    )
  }
  if (cle === 'dehors') {
    return (
      <Feuille titre="Limite hors zone" onFermer={onFermer}>
        <div className="groupe">
          <div className="ligne">
            <span className="ligne-corps">Activer la limite</span>
            <Interrupteur actif={partie.limite_dehors} onChange={(v) => regler({ limite_dehors: v })} label="Activer la limite hors zone" />
          </div>
        </div>
        {partie.limite_dehors && (
          <CompteurReglage valeur={partie.dehors_max_min} min={1} max={30} pas={1} unite="min" onChange={(v) => regler({ dehors_max_min: v })} />
        )}
        <p className="aide">Un runner hors de la zone est visible en direct par les chasseurs. Quand son temps dehors (cumulé) dépasse la limite, il est attrapé.</p>
      </Feuille>
    )
  }
  const n = NOMBRES[cle]
  return (
    <Feuille titre={n.titre} onFermer={onFermer}>
      <CompteurReglage
        valeur={partie[cle]}
        min={n.min}
        max={n.max(partie)}
        pas={n.pas}
        unite={n.unite}
        onChange={(v) => regler(cle === 'duree_min' && partie.intervalle_min >= v ? { duree_min: v, intervalle_min: Math.max(1, v - 5) } : { [cle]: v })}
      />
      <p className="aide">{n.aide}</p>
    </Feuille>
  )
}

function CompteurReglage({ valeur, min, max, pas, unite, onChange }: { valeur: number; min: number; max: number; pas: number; unite?: string; onChange: (v: number) => void }) {
  return (
    <div className="compteur-reglage">
      <button aria-label="Moins" disabled={valeur <= min} onClick={() => onChange(Math.max(min, valeur - pas))}>
        <Minus size={26} aria-hidden />
      </button>
      <strong>
        {valeur}
        {unite && <small>{unite}</small>}
      </strong>
      <button aria-label="Plus" disabled={valeur >= max} onClick={() => onChange(Math.min(max, valeur + pas))}>
        <Plus size={26} aria-hidden />
      </button>
    </div>
  )
}

/** Éditeur plein écran : dessin de la zone (polygone) ou placement des hotspots. */
function EditeurCarte({ type, partie, onFermer, onValider }: { type: 'zone' | 'hotspots'; partie: Partie; onFermer: () => void; onValider: (points: Point[]) => void }) {
  const [points, setPoints] = useState<Point[]>(() => (type === 'zone' ? partie.zone_poly ?? [] : partie.hotspots))
  const geo = useGeoloc(true)
  const zone = type === 'zone' ? points : partie.zone_poly
  const hotspots = useMemo(
    () => (type === 'hotspots' ? points : partie.hotspots).map(([lat, lng]) => ({ pos: { lat, lng }, occupe: type === 'hotspots' })),
    [type, points, partie.hotspots],
  )

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
        hotspots={hotspots}
        marqueurs={geo.position ? [{ id: 'moi', pos: geo.position, type: 'moi' }] : []}
        onClic={clic}
        recadrer={1}
        margeHaut={80}
      >
        <div className="flottant-haut">
          <div className="barre-outils">
            <button className="btn-rond" onClick={onFermer} aria-label="Annuler">
              <X size={22} aria-hidden />
            </button>
            <span className="indice">
              {type === 'zone' ? <IconeCarte size={17} aria-hidden /> : <Flame size={17} aria-hidden />}
              {type === 'zone' ? 'Touche la carte pour tracer la zone' : 'Touche pour ajouter ou enlever'}
            </span>
          </div>
        </div>
      </Carte>
      <div className="panneau">
        <div className="poignee" aria-hidden>
          <span />
        </div>
        <div className="resume">
          <div className="resume-corps">
            <div className="resume-titre">{type === 'zone' ? 'Zone de jeu' : 'Hotspots'}</div>
            <div className="resume-sous">
              {type === 'zone'
                ? points.length === 0
                  ? 'Aucun point : on jouera sans zone.'
                  : points.length < 3
                    ? `Encore ${3 - points.length} point${3 - points.length > 1 ? 's' : ''} minimum.`
                    : `${points.length} points`
                : `${points.length} hotspot${points.length > 1 ? 's' : ''} · rayon 30 m`}
            </div>
          </div>
        </div>
        <div className="rangee">
          {type === 'zone' && (
            <button className="btn btn-gris" disabled={!points.length} onClick={() => setPoints((p) => p.slice(0, -1))}>
              <Undo2 size={18} aria-hidden /> Retour
            </button>
          )}
          <button className="btn btn-gris" disabled={!points.length} onClick={() => setPoints([])}>
            <Trash2 size={18} aria-hidden /> Effacer
          </button>
        </div>
        <button className="btn btn-plein" disabled={!valide} onClick={() => onValider(points)}>
          {type === 'zone' && points.length === 0 ? 'Jouer sans zone' : 'Valider'}
        </button>
      </div>
    </div>
  )
}
