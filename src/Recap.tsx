import { useEffect, useMemo, useState } from 'react'
import { Maximize2, Medal, Trophy, VenetianMask, Zap } from 'lucide-react'
import { toutesPositions } from './api'
import { Carte, type Marqueur, type Trace } from './Carte'
import type { Joueur, LatLng, PositionDatee } from './jeu'
import { centrePartie, classementRunners, distanceM, formatDistance, formatDuree, nombrePings, parseTs } from './jeu'
import type { PropsEcran } from './Lobby'
import { Avatar, MessageErreur, Section, Spinner } from './ui'

// Couleurs des trajets (hexadécimal : utilisées aussi par la carte).
const COULEURS = ['#34c759', '#af52de', '#007aff', '#ff2d55', '#5ac8fa', '#ffcc00', '#5856d6', '#30b0c7']
const ORANGE = '#ff9500'
const MEDAILLES = ['#ffcc00', '#c7c7cc', '#d1915c']

function longueur(points: LatLng[]): number {
  return points.reduce((total, p, i) => (i === 0 ? 0 : total + distanceM(points[i - 1], p)), 0)
}

export function Recap({ partie, joueurs, evenements, moi, onQuitter }: PropsEcran) {
  const [positions, setPositions] = useState<PositionDatee[] | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [recadrer, setRecadrer] = useState(0)

  useEffect(() => {
    toutesPositions(partie.id)
      .then(setPositions)
      .catch((e: unknown) => setErreur(e instanceof Error ? e.message : 'Erreur'))
  }, [partie.id])

  const debut = partie.started_at ? parseTs(partie.started_at) : 0
  const classement = useMemo(() => classementRunners(joueurs), [joueurs])
  const chasseurs = useMemo(() => joueurs.filter((j) => (j.role_initial ?? j.role) === 'chasseur'), [joueurs])
  const couleur = (j: Joueur) => {
    const i = classement.findIndex((r) => r.id === j.id)
    return i >= 0 ? COULEURS[i % COULEURS.length] : ORANGE
  }

  const traces = useMemo<Trace[]>(
    () =>
      [...classement, ...chasseurs].map((j) => ({
        id: j.id,
        couleur: couleur(j),
        pointille: (j.role_initial ?? j.role) === 'chasseur',
        points: (positions ?? []).filter((p) => p.joueur_id === j.id),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [classement, chasseurs, positions],
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
  const jokers = (j: Joueur) => evenements.filter((e) => e.joueur_id === j.id && (e.type === 'faux' || e.type === 'joker_ping')).length
  const distance = (j: Joueur) => {
    const t = traces.find((x) => x.id === j.id)
    return t && t.points.length > 1 ? formatDistance(longueur(t.points)) : null
  }
  const meilleur = classement[0]

  return (
    <div className="ecran">
      <Carte zone={partie.zone_poly} centreDefaut={centrePartie(partie)} traces={traces} marqueurs={marqueurs} recadrer={recadrer} margeHaut={110}>
        <div className="flottant-haut">
          <div className="hud">
            <div className="hud-ligne">
              <div className="compteur">
                <small>Durée</small>
                <strong>{formatDuree(duree)}</strong>
              </div>
              <span className="pastille-role" style={{ ['--c' as string]: victoireRunners ? 'var(--vert)' : 'var(--orange)' }}>
                <Trophy size={15} aria-hidden /> {victoireRunners ? 'Runners' : 'Chasseurs'}
              </span>
              <div className="compteur droite">
                <small>Pings</small>
                <strong>{pings}</strong>
              </div>
            </div>
          </div>
        </div>
        <div className="actions-carte">
          <button className="btn-rond" aria-label="Voir toute la zone" onClick={() => setRecadrer((r) => r + 1)}>
            <Maximize2 size={19} aria-hidden />
          </button>
        </div>
      </Carte>

      <div className="panneau" style={{ maxHeight: '60dvh' }}>
        <div className="poignee" aria-hidden>
          <span />
        </div>
        <div className="resume">
          <div className="resume-corps">
            <div className="resume-titre">{victoireRunners ? 'Victoire des runners' : 'Victoire des chasseurs'}</div>
            <div className="resume-sous">
              {meilleur && meilleur.points >= 1 ? `Meilleur runner : ${meilleur.pseudo} avec ${Math.floor(meilleur.points)} pts` : victoireRunners ? 'Au moins un runner a tenu jusqu’au bout.' : 'Tous les runners ont été attrapés.'}
            </div>
          </div>
          {!positions && !erreur && <Spinner />}
        </div>
        <MessageErreur>{erreur}</MessageErreur>

        <Section titre="Classement des runners">
          {classement.map((r, i) => {
            const attrape = r.statut === 'attrape' || r.role === 'chasseur'
            const quand = r.attrape_at ? formatDuree(parseTs(r.attrape_at) - debut) : ''
            const d = distance(r)
            return (
              <div className="ligne avec-avatar" key={r.id}>
                <span style={{ position: 'relative', flex: 'none' }}>
                  <Avatar nom={r.pseudo} couleur={couleur(r)} />
                  {i < 3 && r.points >= 1 && (
                    <Medal size={18} aria-hidden style={{ position: 'absolute', right: -6, bottom: -4, color: MEDAILLES[i], filter: 'drop-shadow(0 1px 1px rgba(0,0,0,.3))' }} fill={MEDAILLES[i]} />
                  )}
                </span>
                <span className="ligne-corps">
                  <span className="ligne-titre">
                    {r.pseudo}
                    {r.id === moi.id && <span className="badge">Toi</span>}
                  </span>
                  <span className="ligne-sous">
                    {attrape ? `${r.role === 'chasseur' ? 'Infecté' : 'Attrapé'} à ${quand}` : 'A survécu'}
                    {d ? ` · ${d}` : ''}
                    {jokers(r) ? ` · ${jokers(r)} joker${jokers(r) > 1 ? 's' : ''}` : ''}
                  </span>
                </span>
                <strong style={{ fontSize: 20, fontVariantNumeric: 'tabular-nums' }}>
                  {Math.floor(r.points)}
                  <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--texte-2)' }}> pts</span>
                </strong>
              </div>
            )
          })}
        </Section>

        <Section titre="Chasseurs">
          {chasseurs.map((c) => {
            const d = distance(c)
            return (
              <div className="ligne avec-avatar" key={c.id}>
                <Avatar nom={c.pseudo} couleur="var(--orange)" />
                <span className="ligne-corps">
                  <span className="ligne-titre">
                    {c.pseudo}
                    {c.id === moi.id && <span className="badge">Toi</span>}
                  </span>
                  <span className="ligne-sous">{d ? `${d} parcourus` : 'Chasseur'}</span>
                </span>
                {jokers(c) > 0 && (
                  <span className="badge rouge">
                    <Zap size={12} aria-hidden /> {jokers(c)}
                  </span>
                )}
              </div>
            )
          })}
        </Section>

        {evenements.some((e) => e.type === 'faux') && (
          <p className="section-pied" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <VenetianMask size={14} aria-hidden /> Les fausses positions ne comptent pas dans les trajets.
          </p>
        )}

        <button className="btn btn-plein" onClick={onQuitter}>
          Nouvelle partie
        </button>
      </div>
    </div>
  )
}
