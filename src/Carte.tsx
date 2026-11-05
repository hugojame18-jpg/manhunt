import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { LatLng } from './jeu'

export interface Marqueur {
  id: string
  pos: LatLng
  couleur: string
  label?: string
  rayon?: number
}

export interface Trace {
  id: string
  points: LatLng[]
  couleur: string
}

interface Props {
  zone: { centre: LatLng; rayon: number } | null
  marqueurs?: Marqueur[]
  traces?: Trace[]
  onClic?: (pos: LatLng) => void
  /** Change cette valeur pour recadrer la carte sur la zone. */
  recadrer?: number
}

export function Carte({ zone, marqueurs = [], traces = [], onClic, recadrer = 0 }: Props) {
  const divRef = useRef<HTMLDivElement>(null)
  const carteRef = useRef<L.Map | null>(null)
  const coucheRef = useRef<L.LayerGroup | null>(null)
  const onClicRef = useRef(onClic)
  onClicRef.current = onClic
  const cadreFait = useRef<number | null>(null)

  useEffect(() => {
    if (!divRef.current) return
    const carte = L.map(divRef.current, { zoomControl: true, attributionControl: true }).setView([48.8566, 2.3522], 14)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap',
    }).addTo(carte)
    carte.on('click', (e: L.LeafletMouseEvent) => onClicRef.current?.({ lat: e.latlng.lat, lng: e.latlng.lng }))
    coucheRef.current = L.layerGroup().addTo(carte)
    carteRef.current = carte
    // Safari calcule parfois la taille avant la mise en page.
    const t = window.setTimeout(() => carte.invalidateSize(), 200)
    return () => {
      window.clearTimeout(t)
      carte.remove()
      carteRef.current = null
    }
  }, [])

  useEffect(() => {
    const carte = carteRef.current
    const couche = coucheRef.current
    if (!carte || !couche) return
    couche.clearLayers()
    if (zone) {
      const cercle = L.circle([zone.centre.lat, zone.centre.lng], {
        radius: zone.rayon,
        color: '#16a34a',
        weight: 3,
        fillOpacity: 0.06,
        interactive: false,
      }).addTo(couche)
      if (cadreFait.current !== recadrer) {
        carte.fitBounds(cercle.getBounds(), { padding: [20, 20] })
        cadreFait.current = recadrer
      }
    }
    for (const t of traces) {
      if (t.points.length > 1) {
        L.polyline(
          t.points.map((p) => [p.lat, p.lng] as [number, number]),
          { color: t.couleur, weight: 4, opacity: 0.85, interactive: false },
        ).addTo(couche)
      }
    }
    for (const m of marqueurs) {
      const cm = L.circleMarker([m.pos.lat, m.pos.lng], {
        radius: m.rayon ?? 10,
        color: '#ffffff',
        weight: 3,
        fillColor: m.couleur,
        fillOpacity: 1,
      }).addTo(couche)
      if (m.label) cm.bindTooltip(m.label, { permanent: true, direction: 'top', offset: [0, -10], className: 'etiquette' })
    }
  }, [zone, marqueurs, traces, recadrer])

  return <div ref={divRef} className="carte" />
}
