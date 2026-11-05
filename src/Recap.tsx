import { useEffect, useMemo, useState } from 'react'
import { toutesPositions } from './api'
import { Carte, type Marqueur, type Trace } from './Carte'
import type { PositionDatee } from './jeu'
import { centreZone, formatDuree, nombreTicks, parseTs } from './jeu'
import type { PropsEcran } from './Lobby'

const COULEURS = ['#ea580c', '#7c3aed', '#0891b2', '#db2777', '#65a30d', '#ca8a04', '#dc2626', '#2563eb']

export function Recap({ partie, joueurs, onQuitter }: PropsEcran) {
  const [positions, setPositions] = useState<PositionDatee[] | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)

  useEffect(() => {
    toutesPositions(partie.id)
      .then(setPositions)
      .catch((e: unknown) => setErreur(e instanceof Error ? e.message : 'Erreur'))
  }, [partie.id])

  const runners = useMemo(() => joueurs.filter((j) => j.role === 'runner'), [joueurs])
  const chasseurs = joueurs.filter((j) => j.role === 'chasseur')
  const couleur = (id: string) => COULEURS[Math.max(0, runners.findIndex((r) => r.id === id)) % COULEURS.length]

  const traces = useMemo<Trace[]>(
    () =>
      runners.map((r) => ({
        id: r.id,
        couleur: couleur(r.id),
        points: (positions ?? []).filter((p) => p.joueur_id === r.id),
      })),
    [runners, positions],
  )

  const marqueurs = useMemo<Marqueur[]>(
    () =>
      traces
        .filter((t) => t.points.length > 0)
        .map((t) => ({
          id: t.id,
          pos: t.points[t.points.length - 1],
          couleur: t.couleur,
          label: runners.find((r) => r.id === t.id)?.pseudo,
        })),
    [traces, runners],
  )

  const zone = useMemo(() => ({ centre: centreZone(partie), rayon: partie.zone_rayon_m }), [partie])
  const duree = partie.started_at && partie.ends_at ? parseTs(partie.ends_at) - parseTs(partie.started_at) : 0
  const ticks = nombreTicks(partie)

  return (
    <div className="page jeu">
      <div className="entete">
        <strong>🏁 Partie terminée</strong>
        <span className="petit">
          {formatDuree(duree)} · {ticks} révélation{ticks > 1 ? 's' : ''}
        </span>
      </div>
      <Carte zone={zone} traces={traces} marqueurs={marqueurs} />
      <div className="panneau">
        {!positions && !erreur && <p className="aide">Chargement des trajets…</p>}
        {erreur && <p className="erreur">{erreur}</p>}
        <h2>Runners</h2>
        <ul className="liste">
          {runners.map((r) => (
            <li key={r.id}>
              <span>
                <span className="pastille" style={{ background: couleur(r.id) }} /> <strong>{r.pseudo}</strong>
              </span>
              <span className="petit">
                {r.faux_tick === null
                  ? 'pas de fausse position'
                  : r.faux_tick <= ticks
                    ? `🎭 a faussé la révélation n°${r.faux_tick}`
                    : '🎭 bonus activé trop tard'}
              </span>
            </li>
          ))}
        </ul>
        <h2>Chasseurs</h2>
        <ul className="liste">
          {chasseurs.map((c) => (
            <li key={c.id}>
              <span>
                🔎 <strong>{c.pseudo}</strong>
              </span>
              <span className="petit">
                {c.instant_cible_id
                  ? `⚡ a ciblé ${joueurs.find((j) => j.id === c.instant_cible_id)?.pseudo ?? '?'}`
                  : 'bonus non utilisé'}
              </span>
            </li>
          ))}
        </ul>
        <button onClick={onQuitter}>Nouvelle partie</button>
      </div>
    </div>
  )
}
