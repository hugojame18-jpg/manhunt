import { useEffect, useMemo, useRef, useState } from 'react'
import { activerFaussePosition, envoyerPosition, positionInstantanee, positionsAvant, terminerPartie } from './api'
import { Carte, type Marqueur } from './Carte'
import { useGeoloc, useWakeLock, type Geoloc } from './hooks'
import type { PositionDatee } from './jeu'
import {
  centreZone,
  distanceM,
  finPartie,
  formatDistance,
  formatDuree,
  heureTick,
  horsZone,
  ilYa,
  parseTs,
  positionRevelee,
  prochainTick,
  tickActuel,
} from './jeu'
import type { PropsEcran } from './Lobby'

const BLEU = '#2563eb'
const ORANGE = '#ea580c'
const ROUGE = '#dc2626'

export function Jeu(props: PropsEcran) {
  const geo = useGeoloc(true)
  useWakeLock(true)
  return (
    <div className="page jeu">
      <Entete {...props} />
      <Alertes {...props} geo={geo} />
      {props.moi.role === 'runner' ? <VueRunner {...props} geo={geo} /> : <VueChasseur {...props} geo={geo} />}
    </div>
  )
}

function Entete({ partie, moi, now, recharger }: PropsEcran) {
  const fin = finPartie(partie) ?? now
  const prochain = prochainTick(partie, now)
  const admin = partie.admin_id === moi.id
  return (
    <div className="entete">
      <div>
        <div className="petit">Fin dans</div>
        <div className="chrono">{formatDuree(fin - now)}</div>
      </div>
      <div className="role">{moi.role === 'runner' ? '🏃 Runner' : '🔎 Chasseur'}</div>
      <div className="droite">
        <div className="petit">Prochaine révélation</div>
        <div className="chrono">{prochain ? formatDuree(prochain - now) : '—'}</div>
        {admin && (
          <button
            className="mini danger"
            onClick={() => {
              if (confirm('Terminer la partie maintenant pour tout le monde ?')) {
                void terminerPartie(partie.id).then(recharger)
              }
            }}
          >
            Terminer
          </button>
        )}
      </div>
    </div>
  )
}

function Alertes({ partie, geo }: PropsEcran & { geo: Geoloc }) {
  const dehors = geo.position !== null && horsZone(geo.position, partie)
  return (
    <>
      {geo.erreur && <div className="bandeau rouge">{geo.erreur}</div>}
      {!geo.erreur && !geo.position && <div className="bandeau">Recherche du GPS…</div>}
      {geo.position && !geo.precise && (
        <div className="bandeau jaune">
          Position imprécise (± {Math.round(geo.position.accuracy)} m) : ignorée tant qu'elle dépasse 50 m.
        </div>
      )}
      {dehors && <div className="bandeau rouge gros">⚠️ Tu es HORS de la zone ! Reviens dedans.</div>}
    </>
  )
}

function VueRunner({ partie, moi, now, recharger, geo }: PropsEcran & { geo: Geoloc }) {
  const [erreur, setErreur] = useState<string | null>(null)
  const geoRef = useRef(geo)
  geoRef.current = geo
  const [dernierEnvoi, setDernierEnvoi] = useState<number | null>(null)

  // Envoi de la position toutes les 5 s (seulement si précise à 50 m près).
  useEffect(() => {
    const envoyer = () => {
      const g = geoRef.current
      if (!g.position || !g.precise) return
      envoyerPosition(partie.id, moi.id, g.position.lat, g.position.lng, g.position.accuracy)
        .then(() => setDernierEnvoi(Date.now()))
        .catch(() => undefined)
    }
    const id = window.setInterval(envoyer, 5000)
    const t = window.setTimeout(envoyer, 1500)
    return () => {
      window.clearInterval(id)
      window.clearTimeout(t)
    }
  }, [partie.id, moi.id])

  const n = tickActuel(partie, now)
  const bonusEnAttente = moi.faux_tick !== null && moi.faux_tick > n
  const bonusDispo = moi.faux_tick === null
  const resteTick = prochainTick(partie, now) !== null

  const activer = async () => {
    if (!confirm('Activer la fausse position ?\nLa prochaine révélation montrera une fausse position aux chasseurs. Une seule fois par partie.')) return
    setErreur(null)
    try {
      await activerFaussePosition(moi.id)
      await recharger()
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Erreur')
    }
  }

  const marqueurs = useMemo<Marqueur[]>(
    () => (geo.position ? [{ id: 'moi', pos: geo.position, couleur: BLEU, label: 'Moi' }] : []),
    [geo.position],
  )
  const zone = useMemo(() => ({ centre: centreZone(partie), rayon: partie.zone_rayon_m }), [partie])

  return (
    <>
      <Carte zone={zone} marqueurs={marqueurs} />
      <div className="panneau">
        {bonusEnAttente && <div className="bandeau violet">🎭 Bonus actif : la prochaine révélation sera faussée</div>}
        {bonusDispo && (
          <button className="violet" onClick={() => void activer()} disabled={!resteTick}>
            🎭 Activer la fausse position
          </button>
        )}
        {!bonusDispo && !bonusEnAttente && <p className="aide">Bonus fausse position déjà utilisé.</p>}
        {erreur && <p className="erreur">{erreur}</p>}
        <p className="aide">
          {dernierEnvoi ? `Position envoyée ${ilYa(Date.now() - dernierEnvoi)}` : 'Position pas encore envoyée'} · garde
          l'écran allumé et Safari ouvert.
        </p>
      </div>
    </>
  )
}

function VueChasseur({ partie, joueurs, moi, now, recharger, geo }: PropsEcran & { geo: Geoloc }) {
  const [erreur, setErreur] = useState<string | null>(null)
  const [cible, setCible] = useState('')
  const [revelees, setRevelees] = useState<{ tick: number; positions: PositionDatee[] } | null>(null)
  const n = tickActuel(partie, now)
  const runners = useMemo(() => joueurs.filter((j) => j.role === 'runner'), [joueurs])

  // À chaque nouveau tick : on récupère la dernière position de chaque runner reçue avant l'heure du tick.
  useEffect(() => {
    if (n < 1) return
    let annule = false
    const charger = () =>
      positionsAvant(partie.id, heureTick(partie, n))
        .then((positions) => {
          if (!annule) setRevelees({ tick: n, positions })
        })
        .catch(() => {
          if (!annule) window.setTimeout(charger, 3000)
        })
    const t = window.setTimeout(charger, 1500)
    return () => {
      annule = true
      window.clearTimeout(t)
    }
  }, [n, partie])

  const heureRevelation = n >= 1 ? heureTick(partie, n) : null
  const minutes = heureRevelation ? Math.floor((now - heureRevelation) / 60_000) : 0

  const lignes = useMemo(
    () =>
      runners.map((r) => {
        const vraie = revelees?.positions.find((p) => p.joueur_id === r.id)
        const pos = vraie && revelees ? positionRevelee(r, vraie, revelees.tick, partie) : null
        return { runner: r, pos }
      }),
    [runners, revelees, partie],
  )

  const finInstant = moi.instant_at ? parseTs(moi.instant_at) + partie.duree_instant_s * 1000 : 0
  const instantVisible = moi.instant_at !== null && now < finInstant && moi.instant_lat !== null && moi.instant_lng !== null
  const cibleInstant = runners.find((r) => r.id === moi.instant_cible_id)

  const marqueurs = useMemo<Marqueur[]>(() => {
    const m: Marqueur[] = []
    for (const l of lignes) {
      if (l.pos) m.push({ id: l.runner.id, pos: l.pos, couleur: ORANGE, label: `${l.runner.pseudo} · ${minutes < 1 ? 'maintenant' : `${minutes} min`}` })
    }
    if (instantVisible && moi.instant_lat !== null && moi.instant_lng !== null) {
      m.push({
        id: 'instant',
        pos: { lat: moi.instant_lat, lng: moi.instant_lng },
        couleur: ROUGE,
        label: `⚡ ${cibleInstant?.pseudo ?? 'cible'}`,
        rayon: 13,
      })
    }
    if (geo.position) m.push({ id: 'moi', pos: geo.position, couleur: BLEU, label: 'Moi', rayon: 8 })
    return m
  }, [lignes, minutes, instantVisible, moi.instant_lat, moi.instant_lng, cibleInstant, geo.position])

  const zone = useMemo(() => ({ centre: centreZone(partie), rayon: partie.zone_rayon_m }), [partie])

  const declencher = async () => {
    if (!cible) return
    const nom = runners.find((r) => r.id === cible)?.pseudo ?? ''
    if (!confirm(`Révéler la position actuelle de ${nom} ?\nUne seule fois par partie, visible ${partie.duree_instant_s} s.`)) return
    setErreur(null)
    try {
      await positionInstantanee(moi.id, cible)
      await recharger()
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Erreur')
    }
  }

  return (
    <>
      <Carte zone={zone} marqueurs={marqueurs} />
      <div className="panneau">
        {n < 1 && <p className="aide">Première révélation dans {formatDuree(heureTick(partie, 1) - now)}.</p>}
        {n >= 1 && heureRevelation && (
          <p className="aide">
            Révélation n°{n} · {ilYa(now - heureRevelation)}
          </p>
        )}
        <ul className="liste">
          {lignes.map(({ runner, pos }) => (
            <li key={runner.id}>
              <span>
                🏃 <strong>{runner.pseudo}</strong>
              </span>
              <span className="petit">
                {pos ? (geo.position ? formatDistance(distanceM(geo.position, pos)) : 'révélé') : n < 1 ? 'pas encore révélé' : 'position inconnue'}
              </span>
            </li>
          ))}
        </ul>

        {instantVisible && (
          <div className="bandeau rouge">
            ⚡ {cibleInstant?.pseudo} visible encore {formatDuree(finInstant - now)}
          </div>
        )}
        {moi.instant_at === null ? (
          <div className="ligne">
            <select value={cible} onChange={(e) => setCible(e.target.value)}>
              <option value="">Choisir un runner…</option>
              {runners.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.pseudo}
                </option>
              ))}
            </select>
            <button className="rouge" disabled={!cible} onClick={() => void declencher()}>
              ⚡ Position instantanée
            </button>
          </div>
        ) : (
          !instantVisible && <p className="aide">Bonus position instantanée déjà utilisé ({cibleInstant?.pseudo}).</p>
        )}
        {erreur && <p className="erreur">{erreur}</p>}
      </div>
    </>
  )
}
