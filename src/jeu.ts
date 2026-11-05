// Logique de jeu pure (aucune dépendance à React ni à Supabase).

export type Statut = 'lobby' | 'en_cours' | 'terminee'
export type Role = 'runner' | 'chasseur'

export interface Partie {
  id: string
  code: string
  statut: Statut
  admin_id: string | null
  zone_lat: number
  zone_lng: number
  zone_rayon_m: number
  duree_min: number
  intervalle_min: number
  rayon_faux_m: number
  duree_instant_s: number
  started_at: string | null
  ends_at: string | null
  created_at: string
}

export interface Joueur {
  id: string
  partie_id: string
  pseudo: string
  role: Role
  faux_tick: number | null
  faux_dx: number | null
  faux_dy: number | null
  instant_cible_id: string | null
  instant_at: string | null
  instant_lat: number | null
  instant_lng: number | null
  created_at: string
}

export interface LatLng {
  lat: number
  lng: number
}

export interface PositionDatee extends LatLng {
  joueur_id: string
  created_at: string
}

/** Parse un horodatage Postgres (microsecondes acceptées, y compris par Safari). */
export function parseTs(s: string): number {
  return Date.parse(s.replace(' ', 'T').replace(/(\.\d{3})\d+/, '$1'))
}

function bornes(p: Partie): { debut: number; fin: number; intervalle: number } | null {
  if (!p.started_at || !p.ends_at) return null
  return { debut: parseTs(p.started_at), fin: parseTs(p.ends_at), intervalle: p.intervalle_min * 60_000 }
}

/** Numéro du dernier tick passé (0 = aucun tick encore). Pas de tick au lancement ni à l'heure de fin. */
export function tickActuel(p: Partie, now: number): number {
  const b = bornes(p)
  if (!b) return 0
  let n = Math.floor((Math.min(now, b.fin) - b.debut) / b.intervalle)
  if (b.debut + n * b.intervalle >= b.fin) n -= 1
  return Math.max(0, n)
}

export function heureTick(p: Partie, n: number): number {
  const b = bornes(p)
  if (!b) return 0
  return b.debut + n * b.intervalle
}

/** Heure du prochain tick, ou null s'il n'y en a plus avant la fin. */
export function prochainTick(p: Partie, now: number): number | null {
  const b = bornes(p)
  if (!b) return null
  const t = heureTick(p, tickActuel(p, now) + 1)
  return t < b.fin ? t : null
}

export function nombreTicks(p: Partie): number {
  const b = bornes(p)
  if (!b) return 0
  return tickActuel(p, b.fin)
}

export function finPartie(p: Partie): number | null {
  return p.ends_at ? parseTs(p.ends_at) : null
}

export function estTerminee(p: Partie, now: number): boolean {
  if (p.statut === 'terminee') return true
  const fin = finPartie(p)
  return p.statut === 'en_cours' && fin !== null && now >= fin
}

const R_TERRE = 6_371_000

export function distanceM(a: LatLng, b: LatLng): number {
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLng = (b.lng - a.lng) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2
  return 2 * R_TERRE * Math.asin(Math.sqrt(h))
}

/** Décale un point de dx mètres vers l'est et dy mètres vers le nord. */
export function decaler(p: LatLng, dx: number, dy: number): LatLng {
  const mParDegLat = 111_320
  const mParDegLng = 111_320 * Math.cos((p.lat * Math.PI) / 180)
  return { lat: p.lat + dy / mParDegLat, lng: p.lng + dx / mParDegLng }
}

export function centreZone(p: Partie): LatLng {
  return { lat: p.zone_lat, lng: p.zone_lng }
}

export function horsZone(pos: LatLng, p: Partie): boolean {
  return distanceM(pos, centreZone(p)) > p.zone_rayon_m
}

/** Ramène un point à l'intérieur de la zone (à 90 % du rayon) s'il en sort. */
export function ramenerDansZone(pos: LatLng, p: Partie): LatLng {
  const c = centreZone(p)
  const d = distanceM(pos, c)
  const max = p.zone_rayon_m * 0.9
  if (d <= p.zone_rayon_m) return pos
  const ratio = max / d
  return { lat: c.lat + (pos.lat - c.lat) * ratio, lng: c.lng + (pos.lng - c.lng) * ratio }
}

/**
 * Position fausse : vraie position + décalage tiré par le serveur à l'activation du bonus.
 * Si elle sort de la zone, on essaie le décalage opposé, puis on la ramène dans la zone.
 */
export function positionFausse(vraie: LatLng, dx: number, dy: number, p: Partie): LatLng {
  const a = decaler(vraie, dx, dy)
  if (!horsZone(a, p)) return a
  const b = decaler(vraie, -dx, -dy)
  if (!horsZone(b, p)) return b
  return ramenerDansZone(a, p)
}

/** Position que voient les chasseurs pour un runner au tick n. */
export function positionRevelee(runner: Joueur, vraie: LatLng, n: number, p: Partie): LatLng {
  if (runner.faux_tick === n && runner.faux_dx !== null && runner.faux_dy !== null) {
    return positionFausse(vraie, runner.faux_dx, runner.faux_dy, p)
  }
  return vraie
}

export function formatDuree(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

export function ilYa(ms: number): string {
  const min = Math.floor(ms / 60_000)
  if (min < 1) return "à l'instant"
  return `il y a ${min} min`
}

export function formatDistance(m: number): string {
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`
}

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

export function genererCode(): string {
  const octets = new Uint8Array(6)
  crypto.getRandomValues(octets)
  return Array.from(octets, (o) => ALPHABET[o % ALPHABET.length]).join('')
}

export function peutLancer(joueurs: Joueur[]): boolean {
  return joueurs.some((j) => j.role === 'runner') && joueurs.some((j) => j.role === 'chasseur')
}
