import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { SavedPlace } from '@/db/types'
import { formatDate } from '@/lib/dates'

/**
 * OpenStreetMap map of saved places (lazy-loaded so Leaflet stays out of the
 * main bundle). Markers are circle markers in the accent colour, which avoids
 * Leaflet's image-based default icons. Popup content is built with
 * textContent, never HTML strings.
 */
export default function PlacesMap({ places, onSelect }: { places: SavedPlace[]; onSelect: (p: SavedPlace) => void }) {
  const el = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.LayerGroup | null>(null)
  const selectRef = useRef(onSelect)
  selectRef.current = onSelect

  useEffect(() => {
    if (!el.current) return
    const map = L.map(el.current, { zoomControl: true, attributionControl: true }).setView([20, 0], 2)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
    }).addTo(map)
    layerRef.current = L.layerGroup().addTo(map)
    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    const layer = layerRef.current
    if (!map || !layer) return
    layer.clearLayers()
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--c-accent').trim() || '#5b9bff'
    const pts: L.LatLngExpression[] = []
    for (const p of places) {
      if (p.lat == null || p.lng == null) continue
      const ll: L.LatLngExpression = [p.lat, p.lng]
      pts.push(ll)
      const popup = document.createElement('div')
      const title = document.createElement('strong')
      title.textContent = p.name
      const sub = document.createElement('div')
      sub.textContent = formatDate(p.date, 'd MMM yyyy') + (p.address ? ` · ${p.address}` : '')
      sub.style.opacity = '0.7'
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.textContent = 'Details'
      btn.style.cssText = `margin-top:6px;color:${accent};font-weight:600;background:none;border:0;padding:0;cursor:pointer`
      btn.onclick = () => selectRef.current(p)
      popup.append(title, sub, btn)
      L.circleMarker(ll, { radius: 8, color: '#ffffff', weight: 2, fillColor: accent, fillOpacity: 1 })
        .bindPopup(popup)
        .addTo(layer)
    }
    if (pts.length === 1) map.setView(pts[0], 13)
    else if (pts.length > 1) map.fitBounds(L.latLngBounds(pts), { padding: [32, 32], maxZoom: 14 })
  }, [places])

  return <div ref={el} className="relative isolate z-0 h-[55dvh] min-h-72 w-full overflow-hidden rounded-[var(--radius-card)] border border-line" aria-label="Map of saved places" role="region" />
}
