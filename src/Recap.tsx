import { useEffect, useMemo, useState } from 'react'
import { Biohazard, Crosshair, Footprints, Maximize2, RotateCcw, Trophy, UserCheck, VenetianMask, Zap } from 'lucide-react'
import { toutesPositions } from './api'
import { Carte, type Marqueur, type Trace } from './Carte'
import type { Joueur, LatLng, PositionDatee } from './jeu'
import { centrePartie, distanceM, formatDistance, formatDuree, nombrePings, parseTs } from './jeu'
import type { PropsEcran } from './Lobby'
import { Avatar, COULEUR_ROLE, MessageErreur, Spinner } from './ui'

const COULEURS = ['#059669', '#7c3aed', '#0891b2', '#db2777', '#ca8a04', '#2563eb', '#65a30d', '#0d9488']

function longueur(points: LatLng[]): number {
  return points.reduce((total, p, i) => (i === 0 ? 0 : total + distanceM(points[i - 1], p)), 0)
}

export function Recap({ partie, joueurs, evenements, onQuitter }: PropsEcran) {
  const [positions, setPositions] = useState<PositionDatee[] | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [recadrer, setRecadrer] = useState(0)

  useEffect(() => {
    toutesPositions(partie.id)
      .then(setPositions)
      .catch((e: unknown) => setErreur(e instanceof Error ? e.message : 'Erreur'))
  }, [partie.id])

  const debut = partie.started_at ? parseTs(partie.started_at) : 0
  const runners = useMemo(() => joueurs.filter((j) => (j.role_initial ?? j.role) === 'runner'), [joueurs])
  const chasseurs = useMemo(() => joueurs.filter((j) => (j.role_initial ?? j.role) === 'chasseur'), [joueurs])
  const couleur = (j: Joueur) => {
    const i = runners.findIndex((r) => r.id === j.id)
    return i >= 0 ? COULEURS[i % COULEURS.length] : COULEUR_ROLE.chasseur
  }

  const traces = useMemo<Trace[]>(
    () =>
      [...runners, ...chasseurs].map((j) => ({
        id: j.id,
        couleur: couleur(j),
        pointille: (j.role_initial ?? j.role) === 'chasseur',
        points: (positions ?? []).filter((p) => p.joueur_id === j.id),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [runners, chasseurs, positions],
  )

  const marqueurs = useMemo<Marqueur[]>(
    () =>
      traces
        .filter((t) => t.points.length > 0 && !t.pointille)
        .map((t) => ({ id: t.id, pos: t.points[t.points.length - 1], type: 'joueur', nom: joueurs.find((j) => j.id === t.id)?.pseudo, couleur: t.couleur })),
    [traces, joueurs],
  )

  const duree = partie.started_at && partie.ends_at ? parseTs(partie.ends_at) - debut : 0
  const pings = nombrePings(partie)
  const victoireRunners = partie.vainqueur === 'runners'
  const jokers = (j: Joueur) => evenements.filter((e) => e.joueur_id === j.id && (e.type === 'faux' || e.type === 'localiser' || e.type === 'joker_ping')).length

  return (
    <div className="ecran">
      <Carte zone={partie.zone_poly} centreDefaut={centrePartie(partie)} traces={traces} marqueurs={marqueurs} recadrer={recadrer} margeHaut={120}>
        <div className="flottant-haut">
          <div className="hud">
            <div className="hud-ligne">
              <div className="compteur">
                <small>Durée</small>
                <strong>{formatDuree(duree)}</strong>
              </div>
              <span className="pastille-role" style={{ ['--c' as string]: victoireRunners ? COULEUR_ROLE.runner : COULEUR_ROLE.chasseur }}>
                <Trophy size={16} aria-hidden /> {victoireRunners ? 'Runners' : 'Chasseurs'}
              </span>
              <div className="compteur droite">
                <small>Pings</small>
                <strong>{pings}</strong>
              </div>
            </div>
          </div>
        </div>
        <div className="actions-carte">
          <button className="btn-icone rond" aria-label="Voir toute la zone" onClick={() => setRecadrer((r) => r + 1)}>
            <Maximize2 size={20} aria-hidden />
          </button>
        </div>
      </Carte>

      <div className="feuille">
        <div className="feuille-titre">
          <h2>{victoireRunners ? 'Victoire des runners' : 'Victoire des chasseurs'}</h2>
          {!positions && !erreur && <Spinner />}
        </div>
        <p className="aide" style={{ textAlign: 'left', marginTop: -8 }}>
          {victoireRunners ? 'Au moins un runner a tenu jusqu’à la fin.' : 'Tous les runners ont été attrapés.'}
        </p>
        <MessageErreur>{erreur}</MessageErreur>

        <ul className="liste">
          {runners.map((r) => {
            const t = traces.find((x) => x.id === r.id)
            const infecte = r.role === 'chasseur'
            const attrape = r.statut === 'attrape' || infecte
            const quand = r.attrape_at ? formatDuree(parseTs(r.attrape_at) - debut) : ''
            return (
              <li key={r.id}>
                <Avatar nom={r.pseudo} couleur={couleur(r)} />
                <div className="corps">
                  <span className="nom">{r.pseudo}</span>
                  <span className="sous" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    {attrape ? infecte ? <Biohazard size={14} aria-hidden /> : <UserCheck size={14} aria-hidden /> : <Footprints size={14} aria-hidden />}
                    {attrape ? `${infecte ? 'Infecté' : 'Attrapé'} à ${quand}` : 'A survécu'}
                    {t && t.points.length > 1 ? ` · ${formatDistance(longueur(t.points))}` : ''}
                  </span>
                </div>
                {jokers(r) > 0 && (
                  <span className="badge violet">
                    <VenetianMask size={13} aria-hidden /> {jokers(r)}
                  </span>
                )}
              </li>
            )
          })}
          {chasseurs.map((c) => {
            const t = traces.find((x) => x.id === c.id)
            return (
              <li key={c.id}>
                <Avatar nom={c.pseudo} couleur={COULEUR_ROLE.chasseur} />
                <div className="corps">
                  <span className="nom">{c.pseudo}</span>
                  <span className="sous" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <Crosshair size={14} aria-hidden /> Chasseur{t && t.points.length > 1 ? ` · ${formatDistance(longueur(t.points))}` : ''}
                  </span>
                </div>
                {jokers(c) > 0 && (
                  <span className="badge rouge">
                    <Zap size={13} aria-hidden /> {jokers(c)}
                  </span>
                )}
              </li>
            )
          })}
        </ul>

        <button className="btn btn-primaire" onClick={onQuitter}>
          <RotateCcw size={18} aria-hidden />
          Nouvelle partie
        </button>
      </div>
    </div>
  )
}
