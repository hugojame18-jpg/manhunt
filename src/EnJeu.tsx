import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import {
  Biohazard,
  Check,
  Flag,
  Flame,
  Hand,
  Hourglass,
  LocateFixed,
  MapPinOff,
  Maximize2,
  Moon,
  Navigation,
  Radar,
  Signal,
  Timer,
  TriangleAlert,
  UserCheck,
  VenetianMask,
  X,
  Zap,
} from 'lucide-react'
import { attraper, envoyerPosition, jokerFaux, jokerPing, positionsAvant, terminerPartie } from './api'
import { Carte, type Hotspot, type Marqueur } from './Carte'
import { useGeoloc, useWakeLock, type Geoloc } from './hooks'
import type { Evenement, Joueur, LatLng, Partie, Ping, PositionDatee } from './jeu'
import {
  centrePartie,
  debutChasse,
  derniersPings,
  distanceM,
  enAvance,
  estRunnerEnJeu,
  finPartie,
  formatDistance,
  formatDuree,
  heurePing,
  horsZone,
  hotspotA,
  hotspotsOccupes,
  ilYa,
  jokersDispo,
  parseTs,
  pingActuel,
  prochainPing,
  runnersEnDirect,
} from './jeu'
import type { PropsEcran } from './Lobby'
import { Avatar, COULEUR_ROLE, MessageErreur, PastilleRole, Spinner, lienPlans, useAction, useConfirm } from './ui'

const ROUGE = '#dc2626'
const VIOLET = '#7c3aed'

type Confirmer = ReturnType<typeof useConfirm>[1]

/** Dernière position de chaque joueur reçue avant l'heure du ping n (mise en cache : elle ne change plus). */
const cachePings = new Map<string, PositionDatee[]>()

function usePositionsAuPing(p: Partie, n: number, actif: boolean): PositionDatee[] | null {
  const cle = `${p.id}:${p.chasse_at}:${n}`
  const [positions, setPositions] = useState<PositionDatee[] | null>(() => cachePings.get(cle) ?? null)
  const heure = heurePing(p, n)
  useEffect(() => {
    if (!actif || n < 1) return
    const enCache = cachePings.get(cle)
    if (enCache) {
      setPositions(enCache)
      return
    }
    setPositions(null)
    let annule = false
    const charger = () =>
      positionsAvant(p.id, heure)
        .then((res) => {
          cachePings.set(cle, res)
          if (!annule) setPositions(res)
        })
        .catch(() => {
          if (!annule) window.setTimeout(charger, 3000)
        })
    const t = window.setTimeout(charger, 1500)
    return () => {
      annule = true
      window.clearTimeout(t)
    }
  }, [cle, actif, n, heure, p.id])
  return n >= 1 ? positions : null
}

/** Envoie ma position toutes les 5 s (si précise à 50 m), avec l'info hors zone / hotspot. */
function usePartagePosition(moi: Joueur, partie: Partie, geo: Geoloc): number | null {
  const ref = useRef({ geo, partie, moi })
  ref.current = { geo, partie, moi }
  const [dernierEnvoi, setDernierEnvoi] = useState<number | null>(null)
  useEffect(() => {
    const envoyer = () => {
      const { geo: g, partie: p, moi: m } = ref.current
      if (!g.position || !g.precise) return
      const runner = estRunnerEnJeu(m)
      envoyerPosition(m.id, g.position, horsZone(g.position, p), runner ? hotspotA(g.position, p.hotspots) : null)
        .then(() => setDernierEnvoi(Date.now()))
        .catch(() => undefined)
    }
    const id = window.setInterval(envoyer, 5000)
    const t = window.setTimeout(envoyer, 1500)
    return () => {
      window.clearInterval(id)
      window.clearTimeout(t)
    }
  }, [])
  return dernierEnvoi
}

interface Contexte {
  props: PropsEcran
  geo: Geoloc
  n: number
  pings: Map<string, Ping>
  direct: Joueur[]
  centrerSur: (pos: LatLng) => void
  confirmer: Confirmer
  dernierEnvoi: number | null
  ouvrirFauxPing: () => void
}

export function Jeu(props: PropsEcran) {
  const { partie, joueurs, evenements, moi, now, recharger } = props
  const geo = useGeoloc(true)
  useWakeLock(true)
  const dernierEnvoi = usePartagePosition(moi, partie, geo)
  const [recadrer, setRecadrer] = useState(0)
  const [centrer, setCentrer] = useState<{ pos: LatLng; n: number } | null>(null)
  const [poche, setPoche] = useState(false)
  const [choixFaux, setChoixFaux] = useState(false)
  const [modal, confirmer] = useConfirm()
  const admin = partie.admin_id === moi.id
  const vueChasseur = moi.role === 'chasseur' || moi.statut === 'attrape'
  const runnerEnJeu = estRunnerEnJeu(moi)

  const centrerSur = (pos: LatLng) => setCentrer((c) => ({ pos, n: (c?.n ?? 0) + 1 }))

  const avance = enAvance(partie, now)
  const chasse = debutChasse(partie) ?? now
  const fin = finPartie(partie) ?? now
  const n = pingActuel(partie, now)
  const prochain = prochainPing(partie, now)
  const debutCycle = n >= 1 ? heurePing(partie, n) : avance ? parseTs(partie.started_at ?? '') : chasse
  const cible = avance ? chasse : prochain
  const progression = cible ? Math.min(1, Math.max(0, (now - debutCycle) / (cible - debutCycle))) : 1

  const positionsAuPing = usePositionsAuPing(partie, n, vueChasseur)
  const pings = useMemo(() => derniersPings(partie, joueurs, evenements, positionsAuPing, n), [partie, joueurs, evenements, positionsAuPing, n])
  const direct = useMemo(() => runnersEnDirect(partie, joueurs, now), [partie, joueurs, now])
  const occupes = useMemo(() => hotspotsOccupes(partie, joueurs, now), [partie, joueurs, now])

  // Fausse position déjà choisie pour le prochain ping (affichée au runner pour qu'il s'en souvienne).
  const fauxPrevu = runnerEnJeu
    ? evenements.find((e) => e.type === 'faux' && e.joueur_id === moi.id && e.tick !== null && e.tick > n && e.lat !== null && e.lng !== null)
    : undefined

  const dehors = geo.position !== null && horsZone(geo.position, partie)
  const monHotspot = geo.position && runnerEnJeu ? hotspotA(geo.position, partie.hotspots) : null

  const minuteCle = Math.floor(now / 30_000)
  const marqueurs = useMemo<Marqueur[]>(() => {
    const m: Marqueur[] = []
    if (vueChasseur) {
      const enDirect = new Set(direct.map((d) => d.id))
      for (const [id, ping] of pings) {
        if (enDirect.has(id)) continue
        const pseudo = joueurs.find((j) => j.id === id)?.pseudo ?? '?'
        const age = Math.floor((Date.now() - ping.at) / 60_000)
        const quand = age < 1 ? 'à l’instant' : `${age} min`
        m.push({ id: `ping-${id}`, pos: ping, type: 'joueur', nom: pseudo, detail: ping.source === 'ping' ? quand : `${ping.source === 'joker' ? 'joker' : 'hotspot'} · ${quand}`, couleur: COULEUR_ROLE.runner })
      }
      for (const d of direct) {
        if (d.derniere_lat === null || d.derniere_lng === null) continue
        m.push({ id: `direct-${d.id}`, pos: { lat: d.derniere_lat, lng: d.derniere_lng }, type: 'direct', nom: d.pseudo, detail: 'en direct', couleur: ROUGE })
      }
    }
    if (fauxPrevu && fauxPrevu.lat !== null && fauxPrevu.lng !== null) {
      m.push({ id: 'faux', pos: { lat: fauxPrevu.lat, lng: fauxPrevu.lng }, type: 'joueur', nom: moi.pseudo, detail: 'faux ping', couleur: VIOLET })
    }
    if (geo.position) m.push({ id: 'moi', pos: { lat: geo.position.lat, lng: geo.position.lng }, type: 'moi' })
    return m
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vueChasseur, pings, direct, geo.position?.lat, geo.position?.lng, minuteCle, joueurs, fauxPrevu?.id])

  const hotspots = useMemo<Hotspot[]>(
    () =>
      partie.hotspots
        .map(([lat, lng], i) => ({ pos: { lat, lng }, occupe: occupes.has(i) || monHotspot === i, i }))
        .filter((h) => !vueChasseur || occupes.has(h.i)),
    [partie.hotspots, occupes, monHotspot, vueChasseur],
  )

  const terminer = async () => {
    const ok = await confirmer({
      titre: 'Terminer la partie ?',
      message: 'La partie s’arrête tout de suite pour tout le monde et le récap s’affiche.',
      confirmer: 'Terminer',
      ton: 'danger',
      icone: Flag,
    })
    if (ok) void terminerPartie(partie.id).then(recharger)
  }

  const ctx: Contexte = { props, geo, n, pings, direct, centrerSur, confirmer, dernierEnvoi, ouvrirFauxPing: () => setChoixFaux(true) }
  const infecte = moi.role_initial === 'runner' && moi.role === 'chasseur'

  if (choixFaux && runnerEnJeu) {
    return <ChoixFaussePosition partie={partie} moi={moi} geo={geo} recharger={recharger} onFermer={() => setChoixFaux(false)} />
  }

  return (
    <div className="ecran">
      {modal}
      {poche && <ModePoche actif={dernierEnvoi !== null && Date.now() - dernierEnvoi < 20_000} onSortir={() => setPoche(false)} />}
      <Carte zone={partie.zone_poly} centreDefaut={centrePartie(partie)} hotspots={hotspots} marqueurs={marqueurs} recadrer={recadrer} centrer={centrer} margeHaut={130}>
        <div className="flottant-haut">
          <div className="hud">
            <div className="hud-ligne">
              <div className="compteur">
                <small>
                  <Timer size={13} aria-hidden /> Fin
                </small>
                <strong>{formatDuree(fin - now)}</strong>
              </div>
              <PastilleRole role={moi.role} />
              <div className="compteur droite">
                <small>
                  {avance ? <Hourglass size={13} aria-hidden /> : <Radar size={13} aria-hidden />} {avance ? 'Chasse' : 'Ping'}
                </small>
                <strong>{avance ? formatDuree(chasse - now) : prochain ? formatDuree(prochain - now) : '—'}</strong>
              </div>
            </div>
            <div className="progression" aria-hidden>
              <div style={{ width: `${progression * 100}%` }} />
            </div>
          </div>
          {avance && (
            <div className={`alerte ${moi.role === 'chasseur' ? 'ambre' : ''}`}>
              <Hourglass size={20} aria-hidden />
              {moi.role === 'chasseur' ? `Les runners prennent leur avance. Ne bouge pas avant ${formatDuree(chasse - now)} !` : `C'est ton avance : fuis ! La chasse commence dans ${formatDuree(chasse - now)}.`}
            </div>
          )}
          {moi.statut === 'attrape' && (
            <div className="alerte">
              <UserCheck size={20} aria-hidden /> Tu as été attrapé. Tu suis la partie en spectateur.
            </div>
          )}
          {infecte && (
            <div className="alerte">
              <Biohazard size={20} aria-hidden /> Tu as été infecté : tu chasses maintenant les runners !
            </div>
          )}
          {dehors && (
            <div className="alerte rouge forte" role="alert">
              <TriangleAlert size={22} aria-hidden />
              {runnerEnJeu && partie.limite_dehors
                ? `Hors zone : visible en direct ! ${formatDuree(Math.max(0, partie.dehors_max_min * 60 - moi.dehors_s) * 1000)} restantes`
                : 'Tu es hors de la zone ! Reviens dedans.'}
            </div>
          )}
          {geo.erreur && (
            <div className="alerte rouge" role="alert">
              <MapPinOff size={20} aria-hidden /> {geo.erreur}
            </div>
          )}
          {!geo.erreur && !geo.position && (
            <div className="alerte">
              <Spinner /> Recherche du GPS…
            </div>
          )}
          {geo.position && !geo.precise && (
            <div className="alerte ambre">
              <Signal size={20} aria-hidden /> Position imprécise (± {Math.round(geo.position.accuracy)} m) : pas envoyée tant qu'elle dépasse 50 m.
            </div>
          )}
        </div>
        <div className="actions-carte">
          {geo.position && (
            <button className="btn-icone rond" aria-label="Centrer sur moi" onClick={() => geo.position && centrerSur({ lat: geo.position.lat, lng: geo.position.lng })}>
              <LocateFixed size={22} aria-hidden />
            </button>
          )}
          <button className="btn-icone rond" aria-label="Voir toute la zone" onClick={() => setRecadrer((r) => r + 1)}>
            <Maximize2 size={20} aria-hidden />
          </button>
        </div>
      </Carte>

      <div className="feuille">
        {runnerEnJeu ? (
          <VueRunner ctx={ctx} monHotspot={monHotspot} />
        ) : (
          <VueChasseur ctx={ctx} spectateur={moi.statut === 'attrape'} />
        )}
        <button className="btn btn-secondaire" onClick={() => setPoche(true)}>
          <Moon size={20} aria-hidden />
          Mode poche (écran noir)
        </button>
        {admin && (
          <button className="btn btn-fantome danger" onClick={() => void terminer()}>
            <Flag size={18} aria-hidden />
            Terminer la partie
          </button>
        )}
      </div>
    </div>
  )
}

function CarteJoker({ couleur, icone, titre, texte, children, actif }: { couleur: string; icone: ReactNode; titre: string; texte: string; children?: ReactNode; actif?: boolean }) {
  return (
    <div className={`bonus${actif ? ' actif' : ''}`} style={{ ['--c' as string]: couleur }}>
      <div className="bonus-tete">
        <span className="bonus-icone">{icone}</span>
        <div style={{ flex: 1 }}>
          <strong>{titre}</strong>
          <p>{texte}</p>
        </div>
      </div>
      {children}
    </div>
  )
}

function VueRunner({ ctx, monHotspot }: { ctx: Contexte; monHotspot: number | null }) {
  const { props, n, confirmer, dernierEnvoi, ouvrirFauxPing, centrerSur } = ctx
  const { partie, moi, now, evenements, recharger } = props
  const { occupe, erreur, lancer } = useAction()
  const jokers = jokersDispo(moi, partie)
  const faux = evenements.find((e: Evenement) => e.type === 'faux' && e.joueur_id === moi.id && e.tick !== null && e.tick > n)
  const fauxEnAttente = faux !== undefined
  const resteUnPing = prochainPing(partie, now) !== null || enAvance(partie, now)
  const partageActif = dernierEnvoi !== null && Date.now() - dernierEnvoi < 20_000

  const meDeclarer = async () => {
    const ok = await confirmer({
      titre: 'Tu as été attrapé ?',
      message: partie.mode === 'infection' ? 'Tu deviendras chasseur.' : 'Tu seras éliminé et suivras la partie en spectateur.',
      confirmer: 'Oui, attrapé',
      ton: 'danger',
      icone: UserCheck,
    })
    if (ok) void lancer(async () => {
      await attraper(moi.id)
      await recharger()
    })
  }

  return (
    <>
      <div className="statut">
        <span className={`voyant${partageActif ? ' actif' : ''}`} aria-hidden />
        {dernierEnvoi ? `Position partagée ${ilYa(Date.now() - dernierEnvoi)}` : 'Position pas encore partagée'}
      </div>

      {monHotspot !== null && (
        <div className="alerte ambre" style={{ boxShadow: 'none' }}>
          <Flame size={20} aria-hidden /> Tu es dans un hotspot : +1 joker toutes les 2 min, mais les chasseurs te pingent.
        </div>
      )}

      {partie.limite_dehors && moi.dehors_s > 0 && (
        <div className="statut">
          <Timer size={18} aria-hidden /> Temps hors zone : {formatDuree(moi.dehors_s * 1000)} / {partie.dehors_max_min}:00
        </div>
      )}

      <CarteJoker
        couleur={VIOLET}
        icone={<VenetianMask size={22} aria-hidden />}
        titre={`Jokers : ${jokers}`}
        texte={
          fauxEnAttente
            ? 'Faux ping prêt : au prochain ping, les chasseurs te verront à l’endroit choisi (en violet sur ta carte).'
            : jokers < 1
              ? 'Plus de joker disponible.'
              : !resteUnPing
                ? 'Plus aucun ping avant la fin de la partie.'
                : 'Choisis sur la carte où les chasseurs te verront au prochain ping.'
        }
        actif={fauxEnAttente}
      >
        {fauxEnAttente && faux?.lat != null && faux.lng != null && (
          <button className="btn btn-secondaire btn-petit" onClick={() => centrerSur({ lat: faux.lat as number, lng: faux.lng as number })}>
            <LocateFixed size={18} aria-hidden /> Voir ma fausse position
          </button>
        )}
        {!fauxEnAttente && jokers > 0 && (
          <button className="btn btn-violet" disabled={occupe || !resteUnPing} onClick={ouvrirFauxPing}>
            <VenetianMask size={18} aria-hidden /> Placer une fausse position
          </button>
        )}
      </CarteJoker>
      <MessageErreur>{erreur}</MessageErreur>

      <button className="btn btn-fantome danger" onClick={() => void meDeclarer()}>
        <UserCheck size={18} aria-hidden /> J'ai été attrapé
      </button>
    </>
  )
}

function VueChasseur({ ctx, spectateur }: { ctx: Contexte; spectateur: boolean }) {
  const { props, geo, n, pings, direct, centrerSur, confirmer } = ctx
  const { partie, joueurs, moi, now, recharger } = props
  const { occupe, erreur, lancer } = useAction()
  const runners = joueurs.filter((j) => j.role_initial === 'runner' || j.role === 'runner')
  const enJeu = runners.filter(estRunnerEnJeu)
  const jokers = jokersDispo(moi, partie)
  const avance = enAvance(partie, now)

  const [cible, setCible] = useState<string | null>(null)

  const pingForce = async () => {
    const r = enJeu.find((j) => j.id === cible)
    if (!r) return
    const ok = await confirmer({
      titre: `Pinger ${r.pseudo} ?`,
      message: 'Sa position réelle actuelle s’affiche pour tous les chasseurs. Utilise 1 joker.',
      confirmer: 'Pinger',
      ton: 'rouge',
      icone: Zap,
    })
    if (ok)
      void lancer(async () => {
        await jokerPing(moi.id, r.id)
        await recharger()
        setCible(null)
      })
  }

  const marquerAttrape = async (r: Joueur) => {
    const ok = await confirmer({
      titre: `${r.pseudo} est attrapé ?`,
      message: partie.mode === 'infection' ? `${r.pseudo} deviendra chasseur.` : `${r.pseudo} sera éliminé.`,
      confirmer: 'Attrapé !',
      ton: 'danger',
      icone: UserCheck,
    })
    if (ok)
      void lancer(async () => {
        await attraper(r.id)
        await recharger()
      })
  }

  const sousTitre = avance ? 'Les pings commencent au départ de la chasse' : n < 1 ? `1er ping dans ${formatDuree(heurePing(partie, 1) - now)}` : `Ping n°${n} · ${ilYa(now - heurePing(partie, n))}`

  return (
    <>
      <div className="feuille-titre">
        <h2>Runners</h2>
        <span>{enJeu.length} en jeu</span>
      </div>
      <p className="aide" style={{ textAlign: 'left', marginTop: -8 }}>
        {sousTitre}
      </p>

      <ul className="liste">
        {runners.map((r) => {
          const actifR = estRunnerEnJeu(r)
          const enDirect = direct.find((d) => d.id === r.id)
          const ping = pings.get(r.id)
          const pos: LatLng | null = enDirect && enDirect.derniere_lat !== null && enDirect.derniere_lng !== null ? { lat: enDirect.derniere_lat, lng: enDirect.derniere_lng } : ping ?? null
          let sous = 'Pas encore pingé'
          if (!actifR) sous = r.role === 'chasseur' ? 'Infecté · chasseur' : 'Attrapé'
          else if (enDirect) sous = 'Hors zone · en direct'
          else if (ping) sous = `${ping.source === 'joker' ? 'Joker' : ping.source === 'hotspot' ? 'Hotspot' : 'Ping'} ${ilYa(now - ping.at)}`
          if (actifR && pos && geo.position) sous += ` · ${formatDistance(distanceM(geo.position, pos))}`
          return (
            <li key={r.id} className={actifR ? '' : 'inactif'}>
              <button className="ligne-cliquable" onClick={() => pos && centrerSur(pos)} disabled={!pos || !actifR} aria-label={`Voir ${r.pseudo} sur la carte`}>
                <Avatar nom={r.pseudo} couleur={!actifR ? '#94a3b8' : enDirect ? ROUGE : COULEUR_ROLE.runner} />
                <span className="corps">
                  <span className="nom">{r.pseudo}</span>
                  <span className="sous" style={enDirect ? { color: ROUGE, fontWeight: 700 } : undefined}>
                    {sous}
                  </span>
                </span>
              </button>
              {actifR && (
                <div className="droite">
                  {pos && (
                    <a className="btn-icone discret" href={lienPlans(pos.lat, pos.lng)} target="_blank" rel="noreferrer" aria-label={`Itinéraire vers ${r.pseudo} dans Plans`}>
                      <Navigation size={18} aria-hidden />
                    </a>
                  )}
                  {!spectateur && (
                    <button className="btn-icone discret" onClick={() => void marquerAttrape(r)} aria-label={`Marquer ${r.pseudo} comme attrapé`}>
                      <Hand size={18} aria-hidden />
                    </button>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>

      {!spectateur && (
        <CarteJoker couleur={ROUGE} icone={<Zap size={22} aria-hidden />} titre={`Jokers : ${jokers}`} texte={jokers > 0 ? 'Choisis un runner : sa position réelle s’affiche tout de suite pour tous les chasseurs.' : 'Plus de joker disponible.'}>
          {jokers > 0 && !avance && enJeu.length > 0 && (
            <>
              <div className="chips" role="radiogroup" aria-label="Runner à pinger">
                {enJeu.map((r) => (
                  <button key={r.id} role="radio" aria-checked={cible === r.id} className={`chip${cible === r.id ? ' actif' : ''}`} onClick={() => setCible(r.id)}>
                    {r.pseudo}
                  </button>
                ))}
              </div>
              <button className="btn btn-rouge" disabled={!cible || occupe} onClick={() => void pingForce()}>
                {occupe ? <Spinner /> : <Zap size={18} aria-hidden />}
                {cible ? `Pinger ${enJeu.find((r) => r.id === cible)?.pseudo ?? ''}` : 'Choisis un runner'}
              </button>
            </>
          )}
          {avance && jokers > 0 && <p className="aide" style={{ textAlign: 'left' }}>Utilisable après le départ de la chasse.</p>}
        </CarteJoker>
      )}
      <MessageErreur>{erreur}</MessageErreur>
    </>
  )
}

/** Carte plein écran : le runner touche l'endroit où les chasseurs le verront au prochain ping, puis valide. */
function ChoixFaussePosition({
  partie,
  moi,
  geo,
  recharger,
  onFermer,
}: {
  partie: Partie
  moi: Joueur
  geo: Geoloc
  recharger: () => Promise<void>
  onFermer: () => void
}) {
  const [point, setPoint] = useState<LatLng | null>(null)
  const { occupe, erreur, setErreur, lancer } = useAction()
  const hotspots = useMemo<Hotspot[]>(() => partie.hotspots.map(([lat, lng]) => ({ pos: { lat, lng } })), [partie.hotspots])
  const marqueurs = useMemo<Marqueur[]>(() => {
    const m: Marqueur[] = []
    if (point) m.push({ id: 'faux', pos: point, type: 'joueur', nom: moi.pseudo, detail: 'faux ping', couleur: VIOLET })
    if (geo.position) m.push({ id: 'moi', pos: { lat: geo.position.lat, lng: geo.position.lng }, type: 'moi' })
    return m
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [point, geo.position?.lat, geo.position?.lng, moi.pseudo])

  const clic = (pos: LatLng) => {
    if (horsZone(pos, partie)) {
      setErreur('Choisis un endroit dans la zone de jeu.')
      return
    }
    setErreur(null)
    setPoint(pos)
  }

  const valider = () => {
    if (!point) return
    void lancer(async () => {
      await jokerFaux(moi.id, point)
      await recharger()
      onFermer()
    })
  }

  return (
    <div className="ecran">
      <Carte zone={partie.zone_poly} centreDefaut={geo.position ?? centrePartie(partie)} hotspots={hotspots} marqueurs={marqueurs} onClic={clic} recadrer={1} margeHaut={90}>
        <div className="flottant-haut">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button className="btn-icone rond" onClick={onFermer} aria-label="Annuler">
              <X size={22} aria-hidden />
            </button>
            <span className="indice">
              <VenetianMask size={16} aria-hidden />
              {point ? 'Touche ailleurs pour la déplacer' : 'Touche la carte pour placer ta fausse position'}
            </span>
          </div>
        </div>
      </Carte>
      <div className="feuille">
        <div className="feuille-titre">
          <h2>Fausse position</h2>
          {point && geo.position && <span>à {formatDistance(distanceM(geo.position, point))} de toi</span>}
        </div>
        <p className="aide" style={{ textAlign: 'left', marginTop: -8 }}>
          Au prochain ping, les chasseurs te verront à cet endroit au lieu de ta vraie position. Utilise 1 joker.
        </p>
        <MessageErreur>{erreur}</MessageErreur>
        <button className="btn btn-violet" disabled={!point || occupe} onClick={valider}>
          {occupe ? <Spinner /> : <Check size={20} aria-hidden />}
          {point ? 'Valider la fausse position' : 'Touche la carte pour choisir'}
        </button>
        <button className="btn btn-fantome" onClick={onFermer}>
          Annuler
        </button>
      </div>
    </div>
  )
}

/** Écran noir : l'app reste active (position envoyée), le téléphone semble éteint. Appui long pour sortir. */
function ModePoche({ actif, onSortir }: { actif: boolean; onSortir: () => void }) {
  const [progression, setProgression] = useState(0)
  const anim = useRef<number | null>(null)

  useEffect(() => {
    const metas = Array.from(document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]'))
    const avant = metas.map((m) => m.content)
    metas.forEach((m) => (m.content = '#000000'))
    document.body.style.background = '#000'
    return () => {
      metas.forEach((m, i) => (m.content = avant[i]))
      document.body.style.background = ''
      if (anim.current) cancelAnimationFrame(anim.current)
    }
  }, [])

  const commencer = (e: ReactPointerEvent) => {
    e.preventDefault()
    const debut = performance.now()
    const boucle = () => {
      const p = Math.min(1, (performance.now() - debut) / 1500)
      setProgression(p)
      if (p >= 1) onSortir()
      else anim.current = requestAnimationFrame(boucle)
    }
    anim.current = requestAnimationFrame(boucle)
  }
  const arreter = () => {
    if (anim.current) cancelAnimationFrame(anim.current)
    anim.current = null
    setProgression(0)
  }

  const circonference = 2 * Math.PI * 36
  return (
    <div className="poche" onContextMenu={(e) => e.preventDefault()}>
      <p>Mode poche · {actif ? 'position partagée' : 'GPS en attente'}</p>
      <button
        className="anneau-sortie"
        style={{ background: 'none' }}
        onPointerDown={commencer}
        onPointerUp={arreter}
        onPointerCancel={arreter}
        onPointerLeave={arreter}
        aria-label="Maintenir pour quitter le mode poche"
      >
        <svg className="jauge" width="76" height="76" viewBox="0 0 76 76" aria-hidden>
          <circle cx="38" cy="38" r="36" stroke="#a1a1aa" strokeWidth="3" fill="none" strokeDasharray={circonference} strokeDashoffset={circonference * (1 - progression)} strokeLinecap="round" />
        </svg>
        <Hand size={26} aria-hidden />
      </button>
      <p>Maintiens le rond appuyé pour rallumer</p>
    </div>
  )
}
