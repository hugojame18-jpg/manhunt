import { useEffect, useRef, useState, type ReactNode } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { maplibreGL } from '@maplibre/maplibre-gl-leaflet'
import { setWorkerUrl } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import urlWorker from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'

// Vite déplace MapLibre : on lui indique où trouver son worker (dessin de la carte en arrière-plan).
setWorkerUrl(urlWorker)
import type { LatLng, Point } from './jeu'
import { RAYON_HOTSPOT_M } from './jeu'
import { initiale } from './ui'

/** moi : point bleu · joueur : avatar · direct : avatar pulsant (position en temps réel) */
export type TypeMarqueur = 'moi' | 'joueur' | 'direct'

export interface Marqueur {
  id: string
  pos: LatLng
  type: TypeMarqueur
  nom?: string
  detail?: string
  couleur?: string
}

export interface Trace {
  id: string
  points: LatLng[]
  couleur: string
  pointille?: boolean
}

export interface Hotspot {
  pos: LatLng
  occupe?: boolean
}

interface Props {
  /** Zone de jeu (polygone) — null si pas de zone. */
  zone: Point[] | null
  /** Centre utilisé quand il n'y a pas de zone. */
  centreDefaut: LatLng
  /** Mode édition : affiche les sommets du polygone, même incomplet. */
  edition?: boolean
  hotspots?: Hotspot[]
  marqueurs?: Marqueur[]
  traces?: Trace[]
  onClic?: (pos: LatLng) => void
  /** Incrémenter pour recadrer la carte sur la zone. */
  recadrer?: number
  /** Incrémenter n pour centrer la carte sur pos. */
  centrer?: { pos: LatLng; n: number } | null
  /** Marge en pixels laissée en haut (panneau flottant) lors du recadrage. */
  margeHaut?: number
  children?: ReactNode
}

// Fond de carte vectoriel OpenFreeMap (gratuit, sans clé).
const STYLE_CLAIR = 'https://tiles.openfreemap.org/styles/liberty'
const STYLE_SOMBRE = 'https://tiles.openfreemap.org/styles/dark'

/** Suit le mode sombre de l'iPhone. */
export function useSombre(): boolean {
  const [sombre, setSombre] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const maj = () => setSombre(mq.matches)
    mq.addEventListener('change', maj)
    return () => mq.removeEventListener('change', maj)
  }, [])
  return sombre
}

function echapper(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
}

function htmlMarqueur(m: Marqueur): string {
  if (m.type === 'moi') return '<div class="m-moi"><span class="m-halo"></span><span class="m-point"></span></div>'
  const label = m.nom ? `<div class="m-label">${echapper(m.nom)}${m.detail ? `<span>${echapper(m.detail)}</span>` : ''}</div>` : ''
  return `<div class="m-joueur${m.type === 'direct' ? ' m-direct' : ''}" style="--c:${m.couleur ?? '#0f172a'}">
    <div class="m-avatar">${echapper(initiale(m.nom ?? '?'))}</div>${label}</div>`
}

function icone(m: Marqueur): L.DivIcon {
  const taille = m.type === 'moi' ? 22 : 38
  return L.divIcon({ className: 'mh-icone', html: htmlMarqueur(m), iconSize: [taille, taille], iconAnchor: [taille / 2, taille / 2] })
}

export function Carte({
  zone,
  centreDefaut,
  edition = false,
  hotspots = [],
  marqueurs = [],
  traces = [],
  onClic,
  recadrer = 0,
  centrer = null,
  margeHaut = 20,
  children,
}: Props) {
  const divRef = useRef<HTMLDivElement>(null)
  const carteRef = useRef<L.Map | null>(null)
  const coucheZone = useRef<L.LayerGroup | null>(null)
  const coucheHotspots = useRef<L.LayerGroup | null>(null)
  const coucheTraces = useRef<L.LayerGroup | null>(null)
  const enPlace = useRef(new Map<string, { marqueur: L.Marker; html: string }>())
  const onClicRef = useRef(onClic)
  onClicRef.current = onClic
  const cadreFait = useRef<number | null>(null)
  const fond = useRef<L.MaplibreGL | null>(null)
  const sombre = useSombre()
  const initial = useRef({ sombre, centreDefaut })

  useEffect(() => {
    if (!divRef.current) return
    const carte = L.map(divRef.current, { zoomControl: false, attributionControl: false }).setView(
      [initial.current.centreDefaut.lat, initial.current.centreDefaut.lng],
      16,
    )
    L.control
      .attribution({ prefix: false, position: 'bottomleft' })
      .addAttribution('© OpenFreeMap · © OpenMapTiles · © OpenStreetMap')
      .addTo(carte)
    fond.current = maplibreGL({ style: initial.current.sombre ? STYLE_SOMBRE : STYLE_CLAIR, attributionControl: false }).addTo(carte)
    carte.on('click', (e: L.LeafletMouseEvent) => onClicRef.current?.({ lat: e.latlng.lat, lng: e.latlng.lng }))
    coucheZone.current = L.layerGroup().addTo(carte)
    coucheHotspots.current = L.layerGroup().addTo(carte)
    coucheTraces.current = L.layerGroup().addTo(carte)
    carteRef.current = carte
    const marqueursEnPlace = enPlace.current
    const observateur = new ResizeObserver(() => carte.invalidateSize())
    observateur.observe(divRef.current)
    return () => {
      observateur.disconnect()
      marqueursEnPlace.clear()
      carte.remove()
      carteRef.current = null
    }
  }, [])

  const premierStyle = useRef(true)
  useEffect(() => {
    if (premierStyle.current) {
      premierStyle.current = false
      return
    }
    fond.current?.getMaplibreMap().setStyle(sombre ? STYLE_SOMBRE : STYLE_CLAIR)
  }, [sombre])

  // Zone : polygone + assombrissement de tout ce qui est dehors.
  const cleZone = zone ? JSON.stringify(zone) : ''
  useEffect(() => {
    const carte = carteRef.current
    const couche = coucheZone.current
    if (!carte || !couche) return
    couche.clearLayers()
    const encre = sombre ? '#f5f5f7' : '#0f172a'
    const pts = zone ?? []
    if (pts.length >= 3 && !edition) {
      const monde: [number, number][] = [
        [85, -180],
        [85, 180],
        [-85, 180],
        [-85, -180],
      ]
      L.polygon([monde, pts], { stroke: false, fillColor: sombre ? '#000' : '#0f172a', fillOpacity: sombre ? 0.5 : 0.22, interactive: false }).addTo(couche)
    }
    if (pts.length >= 3) {
      L.polygon(pts, { color: encre, weight: 2.5, opacity: 0.85, fill: edition, fillOpacity: 0.08, interactive: false }).addTo(couche)
    } else if (pts.length === 2) {
      L.polyline(pts, { color: encre, weight: 2.5, dashArray: '6 6', interactive: false }).addTo(couche)
    }
    if (edition) {
      pts.forEach((q, i) =>
        L.circleMarker(q, {
          radius: i === pts.length - 1 ? 9 : 7,
          color: '#fff',
          weight: 3,
          fillColor: i === pts.length - 1 ? '#2563eb' : encre,
          fillOpacity: 1,
          interactive: false,
        }).addTo(couche),
      )
    }
    if (cadreFait.current !== recadrer) {
      if (pts.length >= 2) carte.fitBounds(L.latLngBounds(pts), { paddingTopLeft: [24, margeHaut], paddingBottomRight: [24, 48] })
      else carte.setView([centreDefaut.lat, centreDefaut.lng], 16)
      cadreFait.current = recadrer
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cleZone, edition, recadrer, margeHaut, sombre])

  const cleHotspots = JSON.stringify(hotspots)
  useEffect(() => {
    const couche = coucheHotspots.current
    if (!couche) return
    couche.clearLayers()
    for (const h of hotspots) {
      L.circle([h.pos.lat, h.pos.lng], {
        radius: RAYON_HOTSPOT_M,
        color: '#f59e0b',
        weight: h.occupe ? 3 : 2,
        fillColor: '#f59e0b',
        fillOpacity: h.occupe ? 0.35 : 0.18,
        dashArray: h.occupe ? undefined : '4 4',
        interactive: false,
        className: h.occupe ? 'hotspot-occupe' : undefined,
      }).addTo(couche)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cleHotspots])

  useEffect(() => {
    const couche = coucheTraces.current
    if (!couche) return
    couche.clearLayers()
    for (const t of traces) {
      if (t.points.length < 2) continue
      const pts = t.points.map((p) => [p.lat, p.lng] as [number, number])
      L.polyline(pts, { color: sombre ? '#000000' : '#ffffff', weight: 8, opacity: 0.9, interactive: false }).addTo(couche)
      L.polyline(pts, { color: t.couleur, weight: 4.5, opacity: 1, dashArray: t.pointille ? '2 8' : undefined, interactive: false }).addTo(couche)
    }
  }, [traces, sombre])

  // Marqueurs : on ne recrée que ceux qui ont changé (pas de clignotement).
  useEffect(() => {
    const carte = carteRef.current
    if (!carte) return
    const vus = new Set<string>()
    for (const m of marqueurs) {
      vus.add(m.id)
      const html = htmlMarqueur(m)
      const existant = enPlace.current.get(m.id)
      if (existant) {
        existant.marqueur.setLatLng([m.pos.lat, m.pos.lng])
        if (existant.html !== html) {
          existant.marqueur.setIcon(icone(m))
          existant.html = html
        }
      } else {
        const marqueur = L.marker([m.pos.lat, m.pos.lng], {
          icon: icone(m),
          interactive: false,
          keyboard: false,
          zIndexOffset: m.type === 'moi' ? 1000 : m.type === 'direct' ? 500 : 0,
        }).addTo(carte)
        enPlace.current.set(m.id, { marqueur, html })
      }
    }
    for (const [id, { marqueur }] of enPlace.current) {
      if (!vus.has(id)) {
        marqueur.remove()
        enPlace.current.delete(id)
      }
    }
  }, [marqueurs])

  const centrerN = centrer?.n
  useEffect(() => {
    const carte = carteRef.current
    if (!carte || !centrer) return
    carte.flyTo([centrer.pos.lat, centrer.pos.lng], Math.max(carte.getZoom(), 17), { duration: 0.6 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centrerN])

  return (
    <div className="carte-wrap">
      <div ref={divRef} className="carte" />
      {children}
    </div>
  )
}
