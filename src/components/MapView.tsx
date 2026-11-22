import { Fragment, useEffect, useMemo, useRef } from 'react'
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap,
  Polyline,
  ZoomControl,
} from 'react-leaflet'
import L from 'leaflet'
import type { BusStop, NearbyStop } from '../types'
import type { Lang } from '../types'
import type { LatLng } from '../lib/shapes'

const userIcon = L.divIcon({
  className: '',
  html: `<div style="position:relative;width:18px;height:18px"><span style="position:absolute;inset:-6px;border-radius:50%;background:rgba(59,130,246,0.22)"></span><span style="position:absolute;inset:0;background:#3b82f6;border:3px solid #fff;border-radius:50%;box-shadow:0 1px 6px rgba(37,99,235,0.55)"></span></div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
})

const stopIcon = (op: string, selected?: boolean, seq?: number) => {
  const size = selected ? 24 : seq != null ? 21 : 15
  const bg =
    op === 'KMB'
      ? '#e30613'
      : op === 'CTB'
      ? '#0066b3'
      : op === 'GMB'
      ? '#0B7A3B'
      : '#9d2d2d'
  const ring = selected
    ? '0 0 0 3px rgba(16,185,129,0.35),0 1px 4px rgba(0,0,0,0.4)'
    : '0 1px 4px rgba(0,0,0,0.35)'
  const label =
    seq != null
      ? `<span style="color:#fff;font-size:${size >= 21 ? 10 : 9}px;font-weight:700;line-height:1;font-variant-numeric:tabular-nums">${seq}</span>`
      : ''
  return L.divIcon({
    className: '',
    html: `<div style="width:${size}px;height:${size}px;background:${bg};border:2px solid ${selected ? '#34d399' : '#fff'};border-radius:50%;box-shadow:${ring};display:flex;align-items:center;justify-content:center">${label}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

/** Leaflet 要知容器大細；隱藏→顯示（手機開地圖）或視窗改變時要重新量度 */
function AutoResize() {
  const map = useMap()
  useEffect(() => {
    const el = map.getContainer()
    const fix = () => map.invalidateSize()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fix) : null
    ro?.observe(el)
    const t1 = window.setTimeout(fix, 120)
    const t2 = window.setTimeout(fix, 600)
    window.addEventListener('resize', fix)
    return () => {
      ro?.disconnect()
      window.clearTimeout(t1)
      window.clearTimeout(t2)
      window.removeEventListener('resize', fix)
    }
  }, [map])
  return null
}

function Recenter({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap()
  useEffect(() => {
    map.setView([lat, lng], Math.max(map.getZoom(), 15))
  }, [lat, lng, map])
  return null
}

/** Fit map to the stops (and the real shape once it arrives); re-fit when the map is resized (phone: map opened) */
function FitToStops({
  stops,
  fitKey,
  extra,
}: {
  stops: { lat: number; lng: number }[]
  fitKey: string
  extra?: LatLng[] | null
}) {
  const map = useMap()
  const data = useRef({ stops, extra })
  data.current = { stops, extra }
  // 軌跡一換（例如轉線）就要再 fit 一次，即使 -track 字尾冇變
  const pathSig =
    extra && extra.length > 1
      ? `${extra.length}:${extra[0][0].toFixed(4)}:${extra[0][1].toFixed(4)}`
      : '0'

  const fit = () => {
    const { stops: ss, extra: ex } = data.current
    const pts = ss.filter(
      (s) =>
        Number.isFinite(s.lat) &&
        Number.isFinite(s.lng) &&
        s.lat !== 0 &&
        s.lng !== 0
    )
    const all: [number, number][] = pts.map((p) => [p.lat, p.lng])
    if (ex && ex.length > 1) {
      // 真實軌跡用抽樣點，避免過千點都入 bounds 計數
      const step = Math.max(1, Math.floor(ex.length / 200))
      for (let i = 0; i < ex.length; i += step) all.push([ex[i][0], ex[i][1]])
      all.push([ex[ex.length - 1][0], ex[ex.length - 1][1]])
    }
    const size = map.getSize()
    if (all.length === 0 || size.x < 40 || size.y < 40) return
    if (all.length === 1) {
      map.setView(all[0], 16)
      return
    }
    const bounds = L.latLngBounds(all)
    map.fitBounds(bounds, { padding: [22, 22], maxZoom: 16, animate: false })
  }

  useEffect(() => {
    fit()
  }, [fitKey, pathSig, map]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = map.getContainer()
    let t: number | undefined
    const ro =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => {
            window.clearTimeout(t)
            t = window.setTimeout(fit, 220)
          })
        : null
    ro?.observe(el)
    return () => {
      ro?.disconnect()
      window.clearTimeout(t)
    }
  }, [map]) // eslint-disable-line react-hooks/exhaustive-deps
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
  /** Optional line colour for the connecting polyline (defaults to KMB red) */
  routeColor?: string
  /** Real road/rail geometry (one array per path/branch). Falls back to a stop-to-stop line when empty. */
  paths?: LatLng[][] | null
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
  routeColor = '#e30613',
  paths = null,
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

  /** 有真實軌跡就用佢；冇（未載入／冇資料）就降級用站點連線 */
  const linePaths = useMemo<[number, number][][]>(() => {
    const real = (paths || []).filter((p) => p && p.length > 1)
    if (real.length) return real as [number, number][][]
    if (!showRouteLine) return []
    const fallback: [number, number][] = visibleStops
      .filter((s) => s.lat && s.lng)
      .map((s) => [s.lat, s.lng] as [number, number])
    return fallback.length > 1 ? [fallback] : []
  }, [paths, showRouteLine, visibleStops])

  return (
    <div style={{ height, width: '100%' }} className="overflow-hidden">
      <MapContainer
        center={center}
        zoom={15}
        zoomSnap={0.25}
        style={{ height: '100%', width: '100%' }}
        zoomControl={false}
        attributionControl={false}
        className="hk-map"
      >
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        <ZoomControl position="bottomleft" />
        <AutoResize />

        {fitToStops && stops.length > 0 && (
          <FitToStops
            stops={stops}
            fitKey={fitKey || String(stops.length)}
            extra={linePaths.length ? linePaths[0] : null}
          />
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

        {linePaths.map((path, i) => (
          <Fragment key={`path-${i}`}>
            <Polyline
              positions={path}
              pathOptions={{
                color: '#ffffff',
                weight: 8,
                opacity: 0.9,
              }}
            />
            <Polyline
              positions={path}
              pathOptions={{
                color: routeColor,
                weight: 4,
                opacity: 0.9,
                lineJoin: 'round',
                lineCap: 'round',
              }}
            />
          </Fragment>
        ))}

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
                <div className="mt-0.5 text-xs opacity-70">
                  {s.operator} · {s.id}
                  {'distance' in s && s.distance != null
                    ? ` · ${Math.round(s.distance)}m`
                    : ''}
                </div>
                {selectedStopId === s.id && (
                  <div className="mt-1 text-xs text-emerald-800">
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
