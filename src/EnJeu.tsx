import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import {
  Biohazard,
  BookOpen,
  Check,
  Ellipsis,
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
  Star,
  Timer,
  TriangleAlert,
  UserCheck,
  VenetianMask,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { attraper, envoyerPosition, jokerFaux, jokerPing, positionsAvant, terminerPartie } from './api'
import { Carte, type Hotspot, type Marqueur } from './Carte'
import { useGeoloc, useWakeLock, type Geoloc } from './hooks'
import type { Joueur, LatLng, Partie, Ping, PositionDatee } from './jeu'
import {
  centrePartie,
  classementRunners,
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
import { Avatar, COULEUR_ROLE, FeuilleRegles, MessageErreur, PastilleRole, Spinner, lienPlans, useAction, useConfirm, useMenu } from './ui'

const ROUGE = 'var(--rouge)'
const VIOLET = 'var(--violet)'

type Confirmer = ReturnType<typeof useConfirm>[1]
type OuvrirMenu = ReturnType<typeof useMenu>[1]

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

interface Banniere {
  id: number
  titre: string
  texte: string
  icone: LucideIcon
  couleur: string
}

/** Bannière façon notification iOS : nouveau ping, début de la chasse, joker d'un coéquipier. */
function useBanniere(props: PropsEcran, n: number, avance: boolean): Banniere | null {
  const { evenements, moi, joueurs } = props
  const [banniere, setBanniere] = useState<Banniere | null>(null)
  const prec = useRef({ n, avance, dernierEvt: evenements.at(-1)?.id ?? 0 })
  const runner = estRunnerEnJeu(moi)

  useEffect(() => {
    const p = prec.current
    let nouvelle: Omit<Banniere, 'id'> | null = null
    if (p.avance && !avance) {
      nouvelle = { titre: 'La chasse commence !', texte: runner ? 'Les chasseurs sont lâchés. Cache-toi bien.' : 'Les runners ont pris leur avance. À vous de jouer.', icone: Hourglass, couleur: 'var(--orange)' }
    } else if (n > p.n && n >= 1) {
      const faux = runner && evenements.some((e) => e.type === 'faux' && e.joueur_id === moi.id && e.tick === n)
      nouvelle = {
        titre: `Ping n°${n}`,
        texte: runner ? (faux ? 'Les chasseurs voient ta fausse position.' : 'Les chasseurs viennent de voir ta position.') : 'La position des runners est à jour.',
        icone: Radar,
        couleur: 'var(--bleu)',
      }
    } else if (!runner) {
      const joker = evenements.find((e) => e.id > p.dernierEvt && e.type === 'joker_ping' && e.joueur_id !== moi.id)
      if (joker) {
        const qui = joueurs.find((j) => j.id === joker.joueur_id)?.pseudo ?? 'Un chasseur'
        const cible = joueurs.find((j) => j.id === joker.cible_id)?.pseudo ?? 'un runner'
        nouvelle = { titre: 'Joker utilisé', texte: `${qui} a révélé ${cible}.`, icone: Zap, couleur: ROUGE }
      }
    }
    prec.current = { n, avance, dernierEvt: Math.max(p.dernierEvt, evenements.at(-1)?.id ?? 0) }
    if (!nouvelle) return
    const id = Date.now()
    setBanniere({ ...nouvelle, id })
    const t = window.setTimeout(() => setBanniere((b) => (b?.id === id ? null : b)), 4500)
    return () => window.clearTimeout(t)
  }, [n, avance, evenements, runner, moi.id, joueurs])

  return banniere
}

interface Contexte {
  props: PropsEcran
  geo: Geoloc
  n: number
  pings: Map<string, Ping>
  direct: Joueur[]
  centrerSur: (pos: LatLng) => void
  confirmer: Confirmer
  ouvrirMenu: OuvrirMenu
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
  const [regles, setRegles] = useState(false)
  const [replie, setReplie] = useState(false)
  const [choixFaux, setChoixFaux] = useState(false)
  const [confirmation, confirmer] = useConfirm()
  const [menu, ouvrirMenu] = useMenu()
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
  const restant = cible ? cible - now : 0

  const positionsAuPing = usePositionsAuPing(partie, n, vueChasseur)
  const pings = useMemo(() => derniersPings(partie, joueurs, evenements, positionsAuPing, n), [partie, joueurs, evenements, positionsAuPing, n])
  const direct = useMemo(() => runnersEnDirect(partie, joueurs, now), [partie, joueurs, now])
  const occupes = useMemo(() => hotspotsOccupes(partie, joueurs, now), [partie, joueurs, now])
  const banniere = useBanniere(props, n, avance)

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
    const ok = await confirmer({ titre: 'Terminer la partie ?', message: 'La partie s’arrête pour tout le monde et le récap s’affiche.', confirmer: 'Terminer la partie', danger: true, icone: Flag, couleur: ROUGE })
    if (ok) void terminerPartie(partie.id).then(recharger)
  }

  const meDeclarer = async () => {
    const ok = await confirmer({
      titre: 'Tu as été attrapé ?',
      message: partie.mode === 'infection' ? 'Tu deviendras chasseur. Tu gardes tes points.' : 'Tu seras éliminé et suivras la partie en spectateur. Tu gardes tes points.',
      confirmer: 'Oui, j’ai été attrapé',
      danger: true,
      icone: UserCheck,
      couleur: ROUGE,
    })
    if (ok) void attraper(moi.id).then(recharger)
  }

  const ouvrirOptions = () =>
    ouvrirMenu({
      actions: [
        { label: 'Mode poche', icone: Moon, onClick: () => setPoche(true) },
        { label: 'Comment jouer', icone: BookOpen, onClick: () => setRegles(true) },
        ...(runnerEnJeu ? [{ label: 'J’ai été attrapé', icone: UserCheck, danger: true, onClick: () => void meDeclarer() }] : []),
        ...(admin ? [{ label: 'Terminer la partie', icone: Flag, danger: true, onClick: () => void terminer() }] : []),
      ],
    })

  const ctx: Contexte = { props, geo, n, pings, direct, centrerSur, confirmer, ouvrirMenu, dernierEnvoi, ouvrirFauxPing: () => setChoixFaux(true) }
  const infecte = moi.role_initial === 'runner' && moi.role === 'chasseur'

  if (choixFaux && runnerEnJeu) {
    return <ChoixFaussePosition partie={partie} moi={moi} geo={geo} recharger={recharger} onFermer={() => setChoixFaux(false)} />
  }

  return (
    <div className="ecran">
      {confirmation}
      {menu}
      {regles && <FeuilleRegles onFermer={() => setRegles(false)} />}
      {poche && <ModePoche actif={dernierEnvoi !== null && Date.now() - dernierEnvoi < 20_000} onSortir={() => setPoche(false)} />}
      {banniere && (
        <button className="banniere" style={{ ['--c' as string]: banniere.couleur, border: 'none', textAlign: 'left' }} onClick={() => setReplie(false)}>
          <span className="banniere-icone">
            <banniere.icone size={20} aria-hidden />
          </span>
          <span>
            <strong>{banniere.titre}</strong>
            <span>{banniere.texte}</span>
          </span>
        </button>
      )}

      <Carte zone={partie.zone_poly} centreDefaut={centrePartie(partie)} hotspots={hotspots} marqueurs={marqueurs} recadrer={recadrer} centrer={centrer} margeHaut={120}>
        <div className="flottant-haut">
          <div className="hud">
            <div className="hud-ligne">
              <div className="compteur">
                <small>
                  <Timer size={12} aria-hidden /> Fin
                </small>
                <strong>{formatDuree(fin - now)}</strong>
              </div>
              <PastilleRole role={moi.role} />
              <div className="compteur droite">
                <small>
                  {avance ? <Hourglass size={12} aria-hidden /> : <Radar size={12} aria-hidden />} {avance ? 'Chasse' : 'Ping'}
                </small>
                <strong className={cible && restant < 10_000 ? 'urgent' : ''}>{cible ? formatDuree(restant) : '—'}</strong>
              </div>
            </div>
            <div className="progression" aria-hidden>
              <div style={{ width: `${progression * 100}%` }} />
            </div>
          </div>

          {dehors && (
            <div className="alerte rouge pulse" role="alert">
              <TriangleAlert size={20} aria-hidden />
              {runnerEnJeu && partie.limite_dehors ? `Hors zone, visible en direct · ${formatDuree(Math.max(0, partie.dehors_max_min * 60 - moi.dehors_s) * 1000)}` : 'Tu es hors de la zone !'}
            </div>
          )}
          {avance && (
            <div className={`alerte ${moi.role === 'chasseur' ? 'orange' : ''}`}>
              <Hourglass size={18} aria-hidden />
              {moi.role === 'chasseur' ? `Ne bouge pas : la chasse commence dans ${formatDuree(chasse - now)}` : `Fuis ! La chasse commence dans ${formatDuree(chasse - now)}`}
            </div>
          )}
          {moi.statut === 'attrape' && (
            <div className="alerte">
              <UserCheck size={18} aria-hidden /> Attrapé : tu suis la partie en spectateur
            </div>
          )}
          {infecte && (
            <div className="alerte">
              <Biohazard size={18} aria-hidden /> Infecté : tu chasses maintenant les runners
            </div>
          )}
          {geo.erreur && (
            <div className="alerte rouge" role="alert" style={{ fontSize: 13, fontWeight: 500 }}>
              <MapPinOff size={18} aria-hidden /> {geo.erreur}
            </div>
          )}
          {!geo.erreur && !geo.position && (
            <div className="alerte">
              <Spinner /> Recherche du GPS…
            </div>
          )}
          {geo.position && !geo.precise && (
            <div className="alerte jaune">
              <Signal size={18} aria-hidden /> GPS imprécis (± {Math.round(geo.position.accuracy)} m), en attente
            </div>
          )}
        </div>

        <div className="actions-carte">
          {geo.position && (
            <button className="btn-rond" aria-label="Centrer sur moi" onClick={() => geo.position && centrerSur({ lat: geo.position.lat, lng: geo.position.lng })}>
              <LocateFixed size={21} aria-hidden />
            </button>
          )}
          <button className="btn-rond" aria-label="Voir toute la zone" onClick={() => setRecadrer((r) => r + 1)}>
            <Maximize2 size={19} aria-hidden />
          </button>
          <button className="btn-rond" aria-label="Mode poche" onClick={() => setPoche(true)}>
            <Moon size={19} aria-hidden />
          </button>
          <button className="btn-rond" aria-label="Plus d’options" onClick={ouvrirOptions}>
            <Ellipsis size={21} aria-hidden />
          </button>
        </div>
      </Carte>

      <div className={`panneau${replie ? ' replie' : ''}`}>
        <button className="poignee" onClick={() => setReplie((r) => !r)} aria-label={replie ? 'Agrandir le panneau' : 'Réduire le panneau'}>
          <span />
        </button>
        {runnerEnJeu ? <PanneauRunner ctx={ctx} monHotspot={monHotspot} /> : <PanneauChasseur ctx={ctx} spectateur={moi.statut === 'attrape' || moi.role !== 'chasseur'} />}
      </div>
    </div>
  )
}

function rangTexte(rang: number, total: number): string {
  return `${rang === 1 ? '1er' : `${rang}e`} sur ${total}`
}

function PanneauRunner({ ctx, monHotspot }: { ctx: Contexte; monHotspot: number | null }) {
  const { props, n, dernierEnvoi, ouvrirFauxPing, centrerSur } = ctx
  const { partie, moi, now, evenements, joueurs } = props
  const jokers = jokersDispo(moi, partie)
  const faux = evenements.find((e) => e.type === 'faux' && e.joueur_id === moi.id && e.tick !== null && e.tick > n)
  const resteUnPing = prochainPing(partie, now) !== null || enAvance(partie, now)
  const partageActif = dernierEnvoi !== null && Date.now() - dernierEnvoi < 20_000
  const classement = classementRunners(joueurs)
  const rang = classement.findIndex((j) => j.id === moi.id) + 1
  const palier = enAvance(partie, now) ? 0 : moi.points_palier

  return (
    <>
      <div className="resume">
        <div className="resume-corps">
          <div className="points">
            <strong>{Math.floor(moi.points)}</strong>
            <span>pts</span>
          </div>
          <div className="statut" style={{ marginTop: 6 }}>
            <span className={`voyant${partageActif ? ' actif' : ''}`} aria-hidden />
            {classement.length > 1 ? `${rangTexte(rang, classement.length)} · ` : ''}
            {partageActif ? 'position partagée' : 'position pas encore partagée'}
          </div>
        </div>
        <span className={`taux${palier >= 5 ? ' brulant' : palier > 0 ? ' chaud' : ''}`}>
          <Star size={14} aria-hidden fill={palier > 0 ? 'currentColor' : 'none'} />
          {enAvance(partie, now) ? 'Après l’avance' : palier > 0 ? `+${palier} / 10 s` : 'Aucun chasseur proche'}
        </span>
      </div>

      <div className="details">
        <div className={`joker${faux ? ' pret' : ''}${jokers < 1 && !faux ? ' inactif' : ''}`} style={{ ['--c' as string]: VIOLET }}>
          <span className="joker-icone">
            <VenetianMask size={22} aria-hidden />
          </span>
          <div className="joker-corps">
            <strong>Fausse position</strong>
            <span>
              {faux
                ? `Prête pour le ping n°${faux.tick}`
                : jokers < 1
                  ? 'Plus de joker'
                  : !resteUnPing
                    ? 'Plus de ping avant la fin'
                    : `${jokers} joker${jokers > 1 ? 's' : ''} · trompe le prochain ping`}
            </span>
          </div>
          {faux && faux.lat !== null && faux.lng !== null && (
            <button className="btn btn-violet-teinte btn-petit" onClick={() => centrerSur({ lat: faux.lat as number, lng: faux.lng as number })}>
              Voir
            </button>
          )}
          {!faux && jokers > 0 && resteUnPing && (
            <button className="btn btn-violet btn-petit" onClick={ouvrirFauxPing}>
              Placer
            </button>
          )}
        </div>

        {monHotspot !== null && (
          <div className="joker" style={{ ['--c' as string]: 'var(--orange)' }}>
            <span className="joker-icone">
              <Flame size={22} aria-hidden />
            </span>
            <div className="joker-corps">
              <strong>Dans un hotspot</strong>
              <span>+1 joker toutes les 2 min, mais les chasseurs te pingent.</span>
            </div>
          </div>
        )}

        {partie.limite_dehors && moi.dehors_s > 0 && (
          <div className="statut" style={{ fontSize: 15 }}>
            <Timer size={16} aria-hidden /> Temps hors zone : {formatDuree(moi.dehors_s * 1000)} sur {partie.dehors_max_min} min
          </div>
        )}
      </div>
    </>
  )
}

function PanneauChasseur({ ctx, spectateur }: { ctx: Contexte; spectateur: boolean }) {
  const { props, geo, n, pings, direct, centrerSur, confirmer, ouvrirMenu } = ctx
  const { partie, joueurs, moi, now, recharger } = props
  const { occupe, erreur, lancer } = useAction()
  const runners = joueurs.filter((j) => j.role_initial === 'runner' || j.role === 'runner')
  const enJeu = runners.filter(estRunnerEnJeu)
  const jokers = jokersDispo(moi, partie)
  const avance = enAvance(partie, now)
  const etaitRunner = moi.role_initial === 'runner'

  const choisirCible = () =>
    ouvrirMenu({
      titre: 'Joker : qui révéler ?',
      message: 'Sa vraie position s’affiche tout de suite pour tous les chasseurs.',
      icone: Zap,
      couleur: ROUGE,
      actions: enJeu.map((r) => ({
        label: r.pseudo,
        onClick: () =>
          void lancer(async () => {
            await jokerPing(moi.id, r.id)
            await recharger()
          }),
      })),
    })

  const marquerAttrape = async (r: Joueur) => {
    const ok = await confirmer({
      titre: `${r.pseudo} est attrapé ?`,
      message: partie.mode === 'infection' ? `${r.pseudo} deviendra chasseur.` : `${r.pseudo} sera éliminé.`,
      confirmer: 'Oui, attrapé',
      danger: true,
      icone: Hand,
      couleur: 'var(--orange)',
    })
    if (ok)
      void lancer(async () => {
        await attraper(r.id)
        await recharger()
      })
  }

  const sousTitre = avance
    ? 'Les pings commencent avec la chasse'
    : n < 1
      ? `1er ping dans ${formatDuree(heurePing(partie, 1) - now)}`
      : `Ping n°${n} · ${ilYa(now - heurePing(partie, n))}`

  return (
    <>
      <div className="resume">
        <div className="resume-corps">
          <div className="resume-titre">{spectateur && etaitRunner ? `${Math.floor(moi.points)} pts` : `Runners · ${enJeu.length}`}</div>
          <div className="resume-sous">{spectateur && etaitRunner ? 'Tes points sont gardés jusqu’à la fin.' : sousTitre}</div>
        </div>
        {!spectateur && (
          <button className="btn btn-rouge-teinte btn-petit" disabled={jokers < 1 || avance || enJeu.length === 0 || occupe} onClick={choisirCible}>
            {occupe ? <Spinner taille={16} /> : <Zap size={16} aria-hidden />} Joker · {jokers}
          </button>
        )}
      </div>

      <div className="details">
        <div className="groupe">
          {runners.map((r) => {
            const actif = estRunnerEnJeu(r)
            const enDirect = direct.find((d) => d.id === r.id)
            const ping = pings.get(r.id)
            const pos: LatLng | null = enDirect && enDirect.derniere_lat !== null && enDirect.derniere_lng !== null ? { lat: enDirect.derniere_lat, lng: enDirect.derniere_lng } : ping ?? null
            let sous = 'Pas encore pingé'
            if (!actif) sous = r.role === 'chasseur' ? 'Infecté' : 'Attrapé'
            else if (enDirect) sous = 'Hors zone · en direct'
            else if (ping) sous = `${ping.source === 'joker' ? 'Joker' : ping.source === 'hotspot' ? 'Hotspot' : 'Ping'} ${ilYa(now - ping.at)}`
            if (actif && pos && geo.position) sous += ` · ${formatDistance(distanceM(geo.position, pos))}`
            return (
              <div key={r.id} className={`ligne avec-avatar${actif ? '' : ' inactive'}`}>
                <button
                  style={{ all: 'unset', flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 12, cursor: pos && actif ? 'pointer' : 'default' }}
                  onClick={() => pos && actif && centrerSur(pos)}
                  aria-label={`Voir ${r.pseudo} sur la carte`}
                >
                  <Avatar nom={r.pseudo} couleur={!actif ? 'var(--gris)' : enDirect ? ROUGE : COULEUR_ROLE.runner} />
                  <span className="ligne-corps">
                    <span className="ligne-titre">{r.pseudo}</span>
                    <span className="ligne-sous" style={enDirect ? { color: 'var(--rouge)', fontWeight: 600 } : undefined}>
                      {sous}
                    </span>
                  </span>
                </button>
                {actif && (
                  <span className="ligne-actions">
                    {pos && (
                      <a className="btn-icone" href={lienPlans(pos.lat, pos.lng)} target="_blank" rel="noreferrer" aria-label={`Itinéraire vers ${r.pseudo} dans Plans`}>
                        <Navigation size={17} aria-hidden />
                      </a>
                    )}
                    {!spectateur && (
                      <button className="btn-icone orange" onClick={() => void marquerAttrape(r)} aria-label={`Marquer ${r.pseudo} comme attrapé`}>
                        <Hand size={17} aria-hidden />
                      </button>
                    )}
                  </span>
                )}
              </div>
            )
          })}
        </div>
        <MessageErreur>{erreur}</MessageErreur>
      </div>
    </>
  )
}

/** Carte plein écran : le runner touche l'endroit où les chasseurs le verront au prochain ping, puis valide. */
function ChoixFaussePosition({ partie, moi, geo, recharger, onFermer }: { partie: Partie; moi: Joueur; geo: Geoloc; recharger: () => Promise<void>; onFermer: () => void }) {
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
      <Carte zone={partie.zone_poly} centreDefaut={geo.position ?? centrePartie(partie)} hotspots={hotspots} marqueurs={marqueurs} onClic={clic} recadrer={1} margeHaut={80}>
        <div className="flottant-haut">
          <div className="barre-outils">
            <button className="btn-rond" onClick={onFermer} aria-label="Annuler">
              <X size={22} aria-hidden />
            </button>
            <span className="indice">
              <VenetianMask size={17} aria-hidden />
              {point ? 'Touche ailleurs pour la déplacer' : 'Touche la carte pour placer ta fausse position'}
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
            <div className="resume-titre">Fausse position</div>
            <div className="resume-sous">{point && geo.position ? `À ${formatDistance(distanceM(geo.position, point))} de toi` : 'Au prochain ping, les chasseurs te verront à cet endroit.'}</div>
          </div>
        </div>
        <MessageErreur>{erreur}</MessageErreur>
        <button className="btn btn-violet" disabled={!point || occupe} onClick={valider}>
          {occupe ? <Spinner /> : <Check size={20} aria-hidden />}
          {point ? 'Valider · utilise 1 joker' : 'Touche la carte pour choisir'}
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
      <button className="anneau-sortie" onPointerDown={commencer} onPointerUp={arreter} onPointerCancel={arreter} onPointerLeave={arreter} aria-label="Maintenir pour quitter le mode poche">
        <svg className="jauge" width="76" height="76" viewBox="0 0 76 76" aria-hidden>
          <circle cx="38" cy="38" r="36" stroke="#8e8e93" strokeWidth="3" fill="none" strokeDasharray={circonference} strokeDashoffset={circonference * (1 - progression)} strokeLinecap="round" />
        </svg>
        <Hand size={26} aria-hidden />
      </button>
      <p>Maintiens le rond appuyé pour rallumer</p>
    </div>
  )
}
