import { useEffect, useMemo } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap, Polyline } from 'react-leaflet'
import L from 'leaflet'
import type { BusStop, NearbyStop } from '../types'
import type { Lang } from '../types'

const userIcon = L.divIcon({
  className: '',
  html: `<div style="width:16px;height:16px;background:#3b82f6;border:3px solid white;border-radius:50%;box-shadow:0 0 8px rgba(59,130,246,0.8)"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
})

const stopIcon = (op: string, selected?: boolean, seq?: number) => {
  const size = selected ? 22 : seq != null ? 20 : 14
  const bg = op === 'KMB' ? '#E30613' : op === 'CTB' ? '#0066B3' : '#9D2D2D'
  const border = selected ? '#34d399' : 'white'
  const label =
    seq != null
      ? `<span style="color:white;font-size:10px;font-weight:700;line-height:${size}px">${seq}</span>`
      : ''
  return L.divIcon({
    className: '',
    html: `<div style="width:${size}px;height:${size}px;background:${bg};border:2px solid ${border};border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center">${label}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

function Recenter({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap()
  useEffect(() => {
    map.setView([lat, lng], Math.max(map.getZoom(), 15))
  }, [lat, lng, map])
  return null
}

/** Fit map to all stop positions when route/stops change */
function FitToStops({
  stops,
  fitKey,
}: {
  stops: { lat: number; lng: number }[]
  fitKey: string
}) {
  const map = useMap()
  useEffect(() => {
    const pts = stops.filter(
      (s) =>
        Number.isFinite(s.lat) &&
        Number.isFinite(s.lng) &&
        s.lat !== 0 &&
        s.lng !== 0
    )
    if (pts.length === 0) return
    if (pts.length === 1) {
      map.setView([pts[0].lat, pts[0].lng], 16, { animate: true })
      return
    }
    const bounds = L.latLngBounds(pts.map((p) => [p.lat, p.lng] as [number, number]))
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16, animate: true })
  }, [fitKey, map]) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}

interface Props {
  userLat: number | null
  userLng: number | null
  stops: (BusStop | NearbyStop)[]
  selectedStopId: string | null
  onSelectStop: (stop: BusStop) => void
  lang: Lang
  height?: string
  /** When true, fit bounds to stops (e.g. after route search) */
  fitToStops?: boolean
  /** Change this when route changes to re-trigger fit */
  fitKey?: string
  /** Draw line connecting route stops in order */
  showRouteLine?: boolean
}

export default function MapView({
  userLat,
  userLng,
  stops,
  selectedStopId,
  onSelectStop,
  lang,
  height = '100%',
  fitToStops = false,
  fitKey = '',
  showRouteLine = false,
}: Props) {
  const center = useMemo(() => {
    if (fitToStops && stops.length) {
      const withCoord = stops.filter((s) => s.lat && s.lng)
      if (withCoord.length) {
        const lat =
          withCoord.reduce((a, s) => a + s.lat, 0) / withCoord.length
        const lng =
          withCoord.reduce((a, s) => a + s.lng, 0) / withCoord.length
        return [lat, lng] as [number, number]
      }
    }
    if (userLat && userLng) return [userLat, userLng] as [number, number]
    return [22.3193, 114.1694] as [number, number]
  }, [userLat, userLng, fitToStops, stops])

  // Show more markers for route view
  const visibleStops = fitToStops ? stops : stops.slice(0, 50)

  const linePositions = useMemo(() => {
    if (!showRouteLine) return [] as [number, number][]
    return visibleStops
      .filter((s) => s.lat && s.lng)
      .map((s) => [s.lat, s.lng] as [number, number])
  }, [showRouteLine, visibleStops])

  return (
    <div style={{ height, width: '100%' }} className="rounded-xl overflow-hidden">
      <MapContainer
        center={center}
        zoom={15}
        style={{ height: '100%', width: '100%' }}
        zoomControl={true}
        attributionControl={false}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        />

        {fitToStops && stops.length > 0 && (
          <FitToStops stops={stops} fitKey={fitKey || String(stops.length)} />
        )}

        {!fitToStops && userLat && userLng && (
          <>
            <Marker position={[userLat, userLng]} icon={userIcon}>
              <Popup>{lang === 'tc' ? '你的位置' : 'Your location'}</Popup>
            </Marker>
            <Recenter lat={userLat} lng={userLng} />
          </>
        )}

        {userLat && userLng && fitToStops && (
          <Marker position={[userLat, userLng]} icon={userIcon}>
            <Popup>{lang === 'tc' ? '你的位置' : 'Your location'}</Popup>
          </Marker>
        )}

        {linePositions.length > 1 && (
          <Polyline
            positions={linePositions}
            pathOptions={{
              color: '#f87171',
              weight: 3,
              opacity: 0.7,
            }}
          />
        )}

        {visibleStops.map((s, idx) => (
          <Marker
            key={`${s.operator}-${s.id}-${idx}`}
            position={[s.lat, s.lng]}
            icon={stopIcon(
              s.operator,
              selectedStopId === s.id,
              fitToStops ? idx + 1 : undefined
            )}
            eventHandlers={{
              click: () => onSelectStop(s),
            }}
          >
            <Popup>
              <div className="text-sm">
                <div className="font-semibold">
                  {lang === 'tc' ? s.name_tc : s.name_en}
                </div>
                <div className="text-xs opacity-70 mt-0.5">
                  {s.operator} · {s.id}
                  {'distance' in s && s.distance != null
                    ? ` · ${Math.round(s.distance)}m`
                    : ''}
                </div>
                {selectedStopId === s.id && (
                  <div className="text-xs text-emerald-800 mt-1">
                    {lang === 'tc' ? '已選取' : 'Selected'}
                  </div>
                )}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  )
}
