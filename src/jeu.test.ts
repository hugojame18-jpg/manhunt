import { describe, expect, it } from 'vitest'
import type { Evenement, Joueur, Partie, Point, PositionDatee } from './jeu'
import {
  dansPolygone,
  derniersPings,
  enAvance,
  estTerminee,
  horsZone,
  hotspotA,
  jokersDispo,
  nombrePings,
  parseTs,
  pingActuel,
  positionFausse,
  prochainPing,
  runnersEnDirect,
} from './jeu'

const min = 60_000
const debut = Date.parse('2026-11-06T10:00:00Z')
// Carré d'environ 450 m de côté autour de (48.85, 2.35)
const zone: Point[] = [
  [48.848, 2.347],
  [48.848, 2.353],
  [48.852, 2.353],
  [48.852, 2.347],
]
const partie: Partie = {
  id: 'p',
  code: 'ABC123',
  statut: 'en_cours',
  admin_id: 'a',
  mode: 'classique',
  zone_lat: 48.85,
  zone_lng: 2.35,
  zone_poly: zone,
  hotspots: [[48.85, 2.35]],
  duree_min: 25,
  intervalle_min: 5,
  avance_min: 3,
  jokers_chasseur: 1,
  jokers_runner: 2,
  limite_dehors: true,
  dehors_max_min: 5,
  rayon_faux_m: 300,
  duree_instant_s: 60,
  started_at: '2026-11-06T10:00:00.000000+00:00',
  chasse_at: '2026-11-06T10:03:00.000000+00:00',
  ends_at: '2026-11-06T10:28:00.000000+00:00',
  vainqueur: null,
  created_at: '2026-11-06T09:50:00+00:00',
}

function joueur(id: string, role: Joueur['role'], extra: Partial<Joueur> = {}): Joueur {
  return {
    id,
    partie_id: 'p',
    pseudo: id,
    role,
    role_initial: role,
    statut: 'actif',
    attrape_at: null,
    jokers_utilises: 0,
    jokers_bonus: 0,
    dehors_s: 0,
    derniere_lat: null,
    derniere_lng: null,
    derniere_at: null,
    dernier_dehors: false,
    hotspot_courant: null,
    created_at: '',
    ...extra,
  }
}

describe('temps', () => {
  it('parse les horodatages Postgres à microsecondes', () => {
    expect(parseTs('2026-11-06T10:00:00.123456+00:00')).toBe(debut + 123)
  })
  it("avance des runners : pas de ping avant le départ de la chasse", () => {
    expect(enAvance(partie, debut + 2 * min)).toBe(true)
    expect(pingActuel(partie, debut + 2 * min)).toBe(0)
    expect(prochainPing(partie, debut + 2 * min)).toBe(debut + 8 * min)
  })
  it('un ping toutes les 5 min après le départ, aucun à la fin', () => {
    expect(pingActuel(partie, debut + 8 * min + 100)).toBe(1)
    expect(pingActuel(partie, debut + 19 * min)).toBe(3)
    expect(nombrePings(partie)).toBe(4)
    expect(prochainPing(partie, debut + 24 * min)).toBeNull()
  })
  it('fin de partie', () => {
    expect(estTerminee(partie, debut + 27 * min)).toBe(false)
    expect(estTerminee(partie, debut + 28 * min)).toBe(true)
  })
})

describe('zone et hotspots', () => {
  it('point dans le polygone', () => {
    expect(dansPolygone({ lat: 48.85, lng: 2.35 }, zone)).toBe(true)
    expect(dansPolygone({ lat: 48.86, lng: 2.35 }, zone)).toBe(false)
    expect(horsZone({ lat: 48.86, lng: 2.35 }, { ...partie, zone_poly: null })).toBe(false)
  })
  it('détecte le hotspot à 30 m près', () => {
    expect(hotspotA({ lat: 48.8501, lng: 2.35 }, partie.hotspots)).toBe(0)
    expect(hotspotA({ lat: 48.851, lng: 2.35 }, partie.hotspots)).toBeNull()
  })
  it('la fausse position reste dans la zone', () => {
    for (let i = 0; i < 500; i++) {
      const vraie = { lat: 48.848 + Math.random() * 0.004, lng: 2.347 + Math.random() * 0.006 }
      const a = Math.random() * 2 * Math.PI
      const d = 300 * Math.sqrt(Math.random())
      expect(horsZone(positionFausse(vraie, d * Math.cos(a), d * Math.sin(a), partie), partie)).toBe(false)
    }
  })
})

describe('jokers et pings', () => {
  it('jokers disponibles = base du rôle + gagnés − utilisés', () => {
    expect(jokersDispo(joueur('c', 'chasseur'), partie)).toBe(1)
    expect(jokersDispo(joueur('r', 'runner', { jokers_bonus: 1, jokers_utilises: 2 }), partie)).toBe(1)
  })

  const leo = joueur('leo', 'runner')
  const au1: PositionDatee[] = [{ joueur_id: 'leo', lat: 48.85, lng: 2.35, created_at: '' }]
  const evt = (e: Partial<Evenement>): Evenement => ({
    id: 1,
    partie_id: 'p',
    type: 'joker_ping',
    joueur_id: null,
    cible_id: null,
    tick: null,
    lat: null,
    lng: null,
    dx: null,
    dy: null,
    donnees: null,
    created_at: '2026-11-06T10:10:00+00:00',
    ...e,
  })

  it('le ping régulier montre la position au moment du ping', () => {
    const p = derniersPings(partie, [leo], [], au1, 1).get('leo')
    expect(p?.source).toBe('ping')
    expect(p?.lat).toBe(48.85)
  })
  it('un faux ping décale la position du ping visé seulement', () => {
    const faux = [evt({ type: 'faux', joueur_id: 'leo', tick: 1, dx: 200, dy: 0 })]
    expect(derniersPings(partie, [leo], faux, au1, 1).get('leo')?.lng).not.toBe(2.35)
    expect(derniersPings(partie, [leo], faux, au1, 2).get('leo')?.lng).toBe(2.35)
  })
  it('la fausse position choisie par le runner remplace le ping visé, et seulement lui', () => {
    const faux = [evt({ type: 'faux', joueur_id: 'leo', tick: 1, lat: 48.8515, lng: 2.3485 })]
    const p1 = derniersPings(partie, [leo], faux, au1, 1).get('leo')
    expect([p1?.lat, p1?.lng]).toEqual([48.8515, 2.3485])
    expect(derniersPings(partie, [leo], faux, au1, 2).get('leo')?.lat).toBe(48.85)
  })
  it('le faux ping fonctionne même si le runner n’a pas encore envoyé de position', () => {
    const faux = [evt({ type: 'faux', joueur_id: 'leo', tick: 1, lat: 48.8515, lng: 2.3485 })]
    expect(derniersPings(partie, [leo], faux, [], 1).get('leo')?.lat).toBe(48.8515)
  })
  it('un joker de chasseur plus récent remplace le ping régulier', () => {
    const joker = [evt({ cible_id: 'leo', lat: 48.851, lng: 2.351, created_at: '2026-11-06T10:10:00+00:00' })]
    expect(derniersPings(partie, [leo], joker, au1, 1).get('leo')?.source).toBe('joker')
  })
  it('les runners attrapés ne sont plus pingés', () => {
    expect(derniersPings(partie, [{ ...leo, statut: 'attrape' }], [], au1, 1).size).toBe(0)
  })
  it('runner hors zone visible en direct (si la limite est active)', () => {
    const dehors = { ...leo, dernier_dehors: true, derniere_lat: 48.86, derniere_lng: 2.35, derniere_at: new Date(debut + 10 * min).toISOString() }
    expect(runnersEnDirect(partie, [dehors], debut + 10 * min + 5000)).toHaveLength(1)
    expect(runnersEnDirect({ ...partie, limite_dehors: false }, [dehors], debut + 10 * min + 5000)).toHaveLength(0)
  })
})
