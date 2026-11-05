import { describe, expect, it } from 'vitest'
import type { Joueur, Partie } from './jeu'
import { distanceM, estTerminee, horsZone, nombreTicks, parseTs, positionFausse, positionRevelee, prochainTick, tickActuel } from './jeu'

const debut = Date.parse('2026-11-06T10:00:00Z')
const partie: Partie = {
  id: 'p',
  code: 'ABC123',
  statut: 'en_cours',
  admin_id: 'a',
  zone_lat: 48.85,
  zone_lng: 2.35,
  zone_rayon_m: 500,
  duree_min: 30,
  intervalle_min: 5,
  rayon_faux_m: 300,
  duree_instant_s: 60,
  started_at: '2026-11-06T10:00:00.123456+00:00',
  ends_at: '2026-11-06T10:30:00.123456+00:00',
  created_at: '2026-11-06T09:50:00+00:00',
}
const min = 60_000

describe('ticks', () => {
  it('parse les horodatages Postgres à microsecondes', () => {
    expect(parseTs('2026-11-06T10:00:00.123456+00:00')).toBe(debut + 123)
  })
  it('pas de tick au lancement, puis un toutes les 5 min', () => {
    expect(tickActuel(partie, debut + 1000)).toBe(0)
    expect(tickActuel(partie, debut + 5 * min + 200)).toBe(1)
    expect(tickActuel(partie, debut + 12 * min)).toBe(2)
  })
  it("pas de tick à l'heure de fin : 5 ticks pour 30 min", () => {
    expect(nombreTicks(partie)).toBe(5)
    expect(tickActuel(partie, debut + 40 * min)).toBe(5)
    expect(prochainTick(partie, debut + 26 * min)).toBeNull()
  })
  it('fin de partie', () => {
    expect(estTerminee(partie, debut + 29 * min)).toBe(false)
    expect(estTerminee(partie, debut + 30 * min + 200)).toBe(true)
  })
})

describe('fausse position', () => {
  const runner: Joueur = {
    id: 'r',
    partie_id: 'p',
    pseudo: 'Léo',
    role: 'runner',
    faux_tick: 2,
    faux_dx: 250,
    faux_dy: -100,
    instant_cible_id: null,
    instant_at: null,
    instant_lat: null,
    instant_lng: null,
    created_at: '',
  }
  const vraie = { lat: 48.85, lng: 2.35 }

  it("s'applique uniquement au tick visé", () => {
    expect(positionRevelee(runner, vraie, 1, partie)).toEqual(vraie)
    const f = positionRevelee(runner, vraie, 2, partie)
    expect(Math.round(distanceM(f, vraie))).toBe(269)
  })
  it('reste toujours dans la zone', () => {
    for (let i = 0; i < 500; i++) {
      const bord = { lat: 48.85 + (Math.random() - 0.5) * 0.02, lng: 2.35 + (Math.random() - 0.5) * 0.02 }
      const a = Math.random() * 2 * Math.PI
      const d = 300 * Math.sqrt(Math.random())
      const f = positionFausse(bord, d * Math.cos(a), d * Math.sin(a), partie)
      expect(horsZone(f, partie)).toBe(false)
    }
  })
})
