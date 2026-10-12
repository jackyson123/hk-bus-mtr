import { useEffect, useMemo } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import type { BusStop, NearbyStop } from '../types'
import type { Lang } from '../types'

const userIcon = L.divIcon({
  className: '',
  html: `<div style="width:16px;height:16px;background:#3b82f6;border:3px solid white;border-radius:50%;box-shadow:0 0 8px rgba(59,130,246,0.8)"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
})

const stopIcon = (op: string) =>
  L.divIcon({
    className: '',
    html: `<div style="width:14px;height:14px;background:${op === 'KMB' ? '#E30613' : '#0066B3'};border:2px solid white;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.4)"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  })

function Recenter({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap()
  useEffect(() => {
    map.setView([lat, lng], map.getZoom())
  }, [lat, lng, map])
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
}

export default function MapView({
  userLat,
  userLng,
  stops,
  selectedStopId,
  onSelectStop,
  lang,
  height = '100%',
}: Props) {
  const center = useMemo(() => {
    if (userLat && userLng) return [userLat, userLng] as [number, number]
    return [22.3193, 114.1694] as [number, number] // HK default
  }, [userLat, userLng])

  const visibleStops = stops.slice(0, 40) // limit markers for performance

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
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; CARTO'
        />
        {userLat && userLng && (
          <>
            <Marker position={[userLat, userLng]} icon={userIcon}>
              <Popup>{lang === 'tc' ? '你的位置' : 'Your location'}</Popup>
            </Marker>
            <Recenter lat={userLat} lng={userLng} />
          </>
        )}
        {visibleStops.map((s) => (
          <Marker
            key={`${s.operator}-${s.id}`}
            position={[s.lat, s.lng]}
            icon={stopIcon(s.operator)}
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
                  <div className="text-xs text-emerald-400 mt-1">
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
