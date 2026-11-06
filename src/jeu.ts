// Logique de jeu pure (aucune dépendance à React ni à Supabase).

export type Statut = 'lobby' | 'en_cours' | 'terminee'
export type Role = 'runner' | 'chasseur'
export type Mode = 'classique' | 'infection'
export type Point = [number, number] // [lat, lng]

export interface Partie {
  id: string
  code: string
  statut: Statut
  admin_id: string | null
  mode: Mode
  zone_lat: number // centre par défaut de la carte
  zone_lng: number
  zone_poly: Point[] | null // zone de jeu (facultative)
  hotspots: Point[]
  duree_min: number
  intervalle_min: number
  avance_min: number
  jokers_chasseur: number
  jokers_runner: number
  limite_dehors: boolean
  dehors_max_min: number
  rayon_faux_m: number
  duree_instant_s: number
  started_at: string | null
  chasse_at: string | null
  ends_at: string | null
  vainqueur: 'runners' | 'chasseurs' | null
  created_at: string
}

export interface Joueur {
  id: string
  partie_id: string
  pseudo: string
  role: Role
  role_initial: Role | null
  statut: 'actif' | 'attrape'
  attrape_at: string | null
  jokers_utilises: number
  jokers_bonus: number
  dehors_s: number
  derniere_lat: number | null
  derniere_lng: number | null
  derniere_at: string | null
  dernier_dehors: boolean
  hotspot_courant: number | null
  points: number
  points_palier: number
  created_at: string
}

export type TypeEvenement = 'faux' | 'joker_ping' | 'localiser' | 'hotspot_ping' | 'attrape'

export interface Evenement {
  id: number
  partie_id: string
  type: TypeEvenement
  joueur_id: string | null
  cible_id: string | null
  tick: number | null
  lat: number | null
  lng: number | null
  dx: number | null
  dy: number | null
  donnees: { id: string; pseudo: string; role: Role; lat: number; lng: number; at: string }[] | null
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

export const MAX_JOUEURS = 16
/** Points des runners toutes les 10 s selon la distance au chasseur le plus proche (même barème que le serveur). */
export const PALIERS_POINTS: { distance: number; points: number }[] = [
  { distance: 50, points: 10 },
  { distance: 100, points: 5 },
  { distance: 200, points: 2 },
  { distance: 500, points: 1 },
]

export function palierPoints(distance: number | null): number {
  if (distance === null) return 0
  return PALIERS_POINTS.find((p) => distance < p.distance)?.points ?? 0
}

/** Classement des runners par points (les attrapés gardent leurs points). */
export function classementRunners(joueurs: Joueur[]): Joueur[] {
  return joueurs.filter((j) => (j.role_initial ?? j.role) === 'runner').sort((a, b) => b.points - a.points)
}
export const RAYON_HOTSPOT_M = 30
export const DUREE_LOCALISATION_MS = 60_000
export const DELAI_DIRECT_MS = 30_000

/** Parse un horodatage Postgres (microsecondes acceptées, y compris par Safari). */
export function parseTs(s: string): number {
  return Date.parse(s.replace(' ', 'T').replace(/(\.\d{3})\d+/, '$1'))
}

// ---------- Temps ----------

interface Bornes {
  debut: number
  chasse: number
  fin: number
  intervalle: number
}

function bornes(p: Partie): Bornes | null {
  if (!p.started_at || !p.ends_at) return null
  const debut = parseTs(p.started_at)
  return {
    debut,
    chasse: p.chasse_at ? parseTs(p.chasse_at) : debut,
    fin: parseTs(p.ends_at),
    intervalle: p.intervalle_min * 60_000,
  }
}

export function debutChasse(p: Partie): number | null {
  return bornes(p)?.chasse ?? null
}

export function enAvance(p: Partie, now: number): boolean {
  const b = bornes(p)
  return b !== null && now < b.chasse
}

/** Numéro du dernier ping régulier passé (0 = aucun). Pas de ping au départ de la chasse ni à la fin. */
export function pingActuel(p: Partie, now: number): number {
  const b = bornes(p)
  if (!b || now < b.chasse) return 0
  let n = Math.floor((Math.min(now, b.fin) - b.chasse) / b.intervalle)
  if (b.chasse + n * b.intervalle >= b.fin) n -= 1
  return Math.max(0, n)
}

export function heurePing(p: Partie, n: number): number {
  const b = bornes(p)
  return b ? b.chasse + n * b.intervalle : 0
}

export function prochainPing(p: Partie, now: number): number | null {
  const b = bornes(p)
  if (!b) return null
  const t = heurePing(p, pingActuel(p, now) + 1)
  return t < b.fin ? t : null
}

export function nombrePings(p: Partie): number {
  const b = bornes(p)
  return b ? pingActuel(p, b.fin) : 0
}

export function finPartie(p: Partie): number | null {
  return p.ends_at ? parseTs(p.ends_at) : null
}

export function estTerminee(p: Partie, now: number): boolean {
  if (p.statut === 'terminee') return true
  const fin = finPartie(p)
  return p.statut === 'en_cours' && fin !== null && now >= fin
}

// ---------- Géométrie ----------

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

/** Point dans un polygone (lancer de rayon). */
export function dansPolygone(pos: LatLng, poly: Point[]): boolean {
  let dedans = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [yi, xi] = poly[i]
    const [yj, xj] = poly[j]
    if (yi > pos.lat !== yj > pos.lat && pos.lng < ((xj - xi) * (pos.lat - yi)) / (yj - yi) + xi) dedans = !dedans
  }
  return dedans
}

export function aUneZone(p: Partie): boolean {
  return p.zone_poly !== null && p.zone_poly.length >= 3
}

export function horsZone(pos: LatLng, p: Partie): boolean {
  return aUneZone(p) && !dansPolygone(pos, p.zone_poly as Point[])
}

export function centrePartie(p: Partie): LatLng {
  if (p.zone_poly && p.zone_poly.length > 0) {
    const n = p.zone_poly.length
    return {
      lat: p.zone_poly.reduce((s, q) => s + q[0], 0) / n,
      lng: p.zone_poly.reduce((s, q) => s + q[1], 0) / n,
    }
  }
  return { lat: p.zone_lat, lng: p.zone_lng }
}

/** Index du hotspot dans lequel se trouve le point, ou null. */
export function hotspotA(pos: LatLng, hotspots: Point[]): number | null {
  const i = hotspots.findIndex(([lat, lng]) => distanceM(pos, { lat, lng }) <= RAYON_HOTSPOT_M)
  return i >= 0 ? i : null
}

/**
 * Position fausse : vraie position + décalage tiré par le serveur.
 * Si elle sort de la zone, on essaie d'autres orientations puis des décalages plus courts (calcul identique sur tous les téléphones).
 */
export function positionFausse(vraie: LatLng, dx: number, dy: number, p: Partie): LatLng {
  for (const echelle of [1, 0.6, 0.3]) {
    for (let quart = 0; quart < 4; quart++) {
      const a = (quart * Math.PI) / 2
      const ex = (dx * Math.cos(a) - dy * Math.sin(a)) * echelle
      const ey = (dx * Math.sin(a) + dy * Math.cos(a)) * echelle
      const candidat = decaler(vraie, ex, ey)
      if (!horsZone(candidat, p)) return candidat
    }
  }
  return decaler(vraie, dx * 0.1, dy * 0.1)
}

// ---------- Jokers ----------

export function jokersDispo(j: Joueur, p: Partie): number {
  const base = j.role === 'chasseur' ? p.jokers_chasseur : p.jokers_runner
  return Math.max(0, base + j.jokers_bonus - j.jokers_utilises)
}

export function estRunnerEnJeu(j: Joueur): boolean {
  return j.role === 'runner' && j.statut === 'actif'
}

// ---------- Pings vus par les chasseurs ----------

export type SourcePing = 'ping' | 'joker' | 'hotspot'

export interface Ping extends LatLng {
  runnerId: string
  at: number
  source: SourcePing
  numero?: number
}

/**
 * Dernier ping connu de chaque runner en jeu : ping régulier (éventuellement faussé),
 * joker de chasseur ou hotspot — le plus récent l'emporte.
 */
export function derniersPings(
  p: Partie,
  joueurs: Joueur[],
  evenements: Evenement[],
  positionsAuPing: PositionDatee[] | null,
  n: number,
): Map<string, Ping> {
  const res = new Map<string, Ping>()
  const runners = joueurs.filter(estRunnerEnJeu)
  const t = heurePing(p, n)
  for (const r of runners) {
    let meilleur: Ping | null = null
    const vraie = n >= 1 ? positionsAuPing?.find((q) => q.joueur_id === r.id) : undefined
    const faux = n >= 1 ? evenements.find((e) => e.type === 'faux' && e.joueur_id === r.id && e.tick === n) : undefined
    let pos: LatLng | null = vraie ?? null
    if (faux && faux.lat !== null && faux.lng !== null) pos = { lat: faux.lat, lng: faux.lng } // position choisie par le runner
    else if (faux && vraie && faux.dx !== null && faux.dy !== null) pos = positionFausse(vraie, faux.dx, faux.dy, p)
    if (pos) meilleur = { runnerId: r.id, lat: pos.lat, lng: pos.lng, at: t, source: 'ping', numero: n }
    for (const e of evenements) {
      if ((e.type !== 'joker_ping' && e.type !== 'hotspot_ping') || e.cible_id !== r.id || e.lat === null || e.lng === null) continue
      const at = parseTs(e.created_at)
      if (!meilleur || at > meilleur.at) {
        meilleur = { runnerId: r.id, lat: e.lat, lng: e.lng, at, source: e.type === 'joker_ping' ? 'joker' : 'hotspot' }
      }
    }
    if (meilleur) res.set(r.id, meilleur)
  }
  return res
}

/** Runners hors zone visibles en direct par les chasseurs (si la limite hors zone est activée). */
export function runnersEnDirect(p: Partie, joueurs: Joueur[], now: number): Joueur[] {
  if (!p.limite_dehors || !aUneZone(p)) return []
  return joueurs.filter(
    (j) =>
      estRunnerEnJeu(j) &&
      j.dernier_dehors &&
      j.derniere_at !== null &&
      j.derniere_lat !== null &&
      now - parseTs(j.derniere_at) < DELAI_DIRECT_MS,
  )
}

/** Hotspots visibles par les chasseurs : seulement ceux où se trouve un runner. */
export function hotspotsOccupes(p: Partie, joueurs: Joueur[], now: number): Set<number> {
  const s = new Set<number>()
  for (const j of joueurs) {
    if (estRunnerEnJeu(j) && j.hotspot_courant !== null && j.derniere_at && now - parseTs(j.derniere_at) < DELAI_DIRECT_MS) {
      if (j.hotspot_courant < p.hotspots.length) s.add(j.hotspot_courant)
    }
  }
  return s
}

// ---------- Divers ----------

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
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1).replace('.', ',')} km`
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
