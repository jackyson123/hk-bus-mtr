import { useState, useEffect, useCallback, useMemo } from 'react'
import MapView from './components/MapView'
import EtaList from './components/EtaList'
import MtrPanel from './components/MtrPanel'
import { useGeolocation } from './hooks/useGeolocation'
import {
  getKmbStops,
  getKmbStopEta,
  getCtbEta,
  searchRouteVariants,
  loadRouteStops,
  haversine,
  type RouteVariant,
  type RouteStopItem,
} from './lib/api'
import type { BusStop, EtaItem, Lang, NearbyStop } from './types'

type Tab = 'bus' | 'mtr'
type BusMode = 'route' | 'nearby'

export default function App() {
  const [lang, setLang] = useState<Lang>('tc')
  const [tab, setTab] = useState<Tab>('bus')
  const [busMode, setBusMode] = useState<BusMode>('route')

  // Shared stop / ETA state
  const [selectedStop, setSelectedStop] = useState<BusStop | null>(null)
  const [etas, setEtas] = useState<EtaItem[]>([])
  const [etaLoading, setEtaLoading] = useState(false)
  const [mapExpanded, setMapExpanded] = useState(true)

  // Nearby / GPS
  const [allKmbStops, setAllKmbStops] = useState<BusStop[]>([])
  const [kmbStopMap, setKmbStopMap] = useState<Map<string, BusStop>>(new Map())
  const [nearby, setNearby] = useState<NearbyStop[]>([])
  const [nearbyFilter, setNearbyFilter] = useState('')
  const [stopsLoading, setStopsLoading] = useState(true)

  // Route search
  const [routeQuery, setRouteQuery] = useState('')
  const [variants, setVariants] = useState<RouteVariant[]>([])
  const [selectedVariant, setSelectedVariant] = useState<RouteVariant | null>(null)
  const [routeStops, setRouteStops] = useState<RouteStopItem[]>([])
  const [routeLoading, setRouteLoading] = useState(false)
  const [stopsLoadingRoute, setStopsLoadingRoute] = useState(false)
  const [routeError, setRouteError] = useState<string | null>(null)

  // CTB: when showing stop ETA we only get KMB from stop-eta; for CTB we also fetch route-specific if needed
  const [ctbFocusRoute, setCtbFocusRoute] = useState<string | null>(null)

  const { lat, lng, error: geoError, loading: geoLoading, request: requestGeo } =
    useGeolocation(false)

  // Load KMB stops once (for names + nearby)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setStopsLoading(true)
        const stops = await getKmbStops()
        if (cancelled) return
        setAllKmbStops(stops)
        const map = new Map<string, BusStop>()
        stops.forEach((s) => map.set(s.id, s))
        setKmbStopMap(map)
      } catch (e) {
        console.error('Failed to load KMB stops', e)
      } finally {
        if (!cancelled) setStopsLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // Nearby from GPS
  useEffect(() => {
    if (!lat || !lng || !allKmbStops.length) return
    const list: NearbyStop[] = allKmbStops
      .map((s) => ({
        ...s,
        distance: haversine(lat, lng, s.lat, s.lng),
      }))
      .filter((s) => s.distance < 800)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 40)
    setNearby(list)
  }, [lat, lng, allKmbStops])

  // Load all-routes ETA at a stop (KMB stop-eta). For CTB stop, load single route if known.
  const loadEta = useCallback(
    async (stop: BusStop, ctbRoute?: string | null) => {
      setEtaLoading(true)
      setEtas([])
      try {
        if (stop.operator === 'KMB') {
          const data = await getKmbStopEta(stop.id)
          setEtas(data)
        } else if (stop.operator === 'CTB') {
          const route = ctbRoute || ctbFocusRoute
          if (route) {
            const data = await getCtbEta(stop.id, route)
            setEtas(data)
          } else {
            setEtas([])
          }
        }
      } catch (e) {
        console.error(e)
        setEtas([])
      } finally {
        setEtaLoading(false)
      }
    },
    [ctbFocusRoute]
  )

  useEffect(() => {
    if (selectedStop) {
      loadEta(
        selectedStop,
        selectedStop.operator === 'CTB' ? ctbFocusRoute : null
      )
    }
  }, [selectedStop, loadEta, ctbFocusRoute])

  useEffect(() => {
    if (!selectedStop) return
    const t = setInterval(() => {
      loadEta(
        selectedStop,
        selectedStop.operator === 'CTB' ? ctbFocusRoute : null
      )
    }, 30000)
    return () => clearInterval(t)
  }, [selectedStop, loadEta, ctbFocusRoute])

  const filteredNearby = useMemo(() => {
    if (!nearbyFilter.trim()) return nearby
    const q = nearbyFilter.trim().toLowerCase()
    return nearby.filter(
      (s) =>
        s.name_tc.includes(q) ||
        s.name_en.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q)
    )
  }, [nearby, nearbyFilter])

  const handleSelectStop = (stop: BusStop) => {
    setSelectedStop(stop)
    setTab('bus')
    if (stop.operator === 'KMB') setCtbFocusRoute(null)
  }

  const handleSelectRouteStop = (item: RouteStopItem) => {
    const stop: BusStop = {
      id: item.stopId,
      name_tc: item.name_tc,
      name_en: item.name_en,
      lat: item.lat,
      lng: item.lng,
      operator: item.operator,
    }
    setSelectedStop(stop)
    if (item.operator === 'CTB' && selectedVariant) {
      setCtbFocusRoute(selectedVariant.route)
    } else {
      setCtbFocusRoute(null)
    }
  }

  // Search route number
  const onSearchRoute = async () => {
    const q = routeQuery.trim()
    if (!q) return
    setRouteLoading(true)
    setRouteError(null)
    setVariants([])
    setSelectedVariant(null)
    setRouteStops([])
    setSelectedStop(null)
    setEtas([])
    try {
      const list = await searchRouteVariants(q)
      if (!list.length) {
        setRouteError(
          lang === 'tc'
            ? `找不到路線 ${q.toUpperCase()}（九巴 / 城巴）`
            : `Route ${q.toUpperCase()} not found (KMB / CTB)`
        )
      } else {
        setVariants(list)
        // Auto-pick first if only one KMB outbound-like
        if (list.length === 1) {
          await pickVariant(list[0])
        }
      }
    } catch (e: any) {
      setRouteError(e.message || 'Search failed')
    } finally {
      setRouteLoading(false)
    }
  }

  const pickVariant = async (v: RouteVariant) => {
    setSelectedVariant(v)
    setStopsLoadingRoute(true)
    setRouteStops([])
    setSelectedStop(null)
    setEtas([])
    try {
      const stops = await loadRouteStops(v, kmbStopMap)
      // Filter empty CTB directions
      if (!stops.length && v.operator === 'CTB') {
        setRouteError(
          lang === 'tc'
            ? '此方向暫無站點資料，請試另一方向'
            : 'No stops for this direction, try the other'
        )
      } else {
        setRouteError(null)
      }
      setRouteStops(stops)
    } catch (e: any) {
      setRouteError(e.message || 'Failed to load stops')
    } finally {
      setStopsLoadingRoute(false)
    }
  }

  // Map markers: route stops if in route mode with data, else nearby
  const mapStops: BusStop[] = useMemo(() => {
    if (busMode === 'route' && routeStops.length) {
      return routeStops
        .filter((s) => s.lat && s.lng)
        .map((s) => ({
          id: s.stopId,
          name_tc: s.name_tc,
          name_en: s.name_en,
          lat: s.lat,
          lng: s.lng,
          operator: s.operator,
        }))
    }
    return filteredNearby.length ? filteredNearby : nearby
  }, [busMode, routeStops, filteredNearby, nearby])

  return (
    <div className="h-full flex flex-col bg-slate-950 text-slate-100">
      {/* Header */}
      <header className="flex-shrink-0 border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-3 py-2.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-red-500 to-blue-600 flex items-center justify-center text-sm font-bold">
              巴
            </div>
            <div>
              <h1 className="font-bold text-base leading-tight">hk-bus-mtr</h1>
              <p className="text-[10px] text-slate-400 leading-none">
                {lang === 'tc' ? '九巴 · 城巴 · 港鐵' : 'KMB · Citybus · MTR'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setLang(lang === 'tc' ? 'en' : 'tc')}
              className="px-2.5 py-1 rounded-lg bg-slate-800 text-xs font-medium hover:bg-slate-700"
            >
              {lang === 'tc' ? 'EN' : '繁'}
            </button>
            <button
              onClick={() => {
                setBusMode('nearby')
                requestGeo()
              }}
              disabled={geoLoading}
              className="px-2.5 py-1 rounded-lg bg-emerald-600/80 hover:bg-emerald-500 text-xs font-medium disabled:opacity-50"
            >
              {geoLoading ? '…' : lang === 'tc' ? '定位' : 'Locate'}
            </button>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-3 flex gap-1 pb-2">
          <button
            onClick={() => setTab('bus')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${
              tab === 'bus'
                ? 'bg-slate-700 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {lang === 'tc' ? '巴士' : 'Bus'}
          </button>
          <button
            onClick={() => setTab('mtr')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${
              tab === 'mtr'
                ? 'bg-slate-700 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {lang === 'tc' ? '港鐵' : 'MTR'}
          </button>
        </div>
      </header>

      <main className="flex-1 min-h-0 flex flex-col md:flex-row max-w-7xl w-full mx-auto">
        {/* Map */}
        {tab === 'bus' && (
          <div
            className={`map-panel relative border-b md:border-b-0 md:border-r border-slate-800 md:h-auto md:w-[45%] lg:w-[50%] ${
              mapExpanded ? 'h-52' : 'h-10'
            }`}
          >
            <button
              onClick={() => setMapExpanded((v) => !v)}
              className="md:hidden absolute top-2 right-2 z-10 px-2.5 py-1 rounded-lg bg-slate-900/90 text-xs border border-slate-700"
            >
              {mapExpanded
                ? lang === 'tc'
                  ? '收起地圖'
                  : 'Hide map'
                : lang === 'tc'
                ? '顯示地圖'
                : 'Show map'}
            </button>
            <div
              className={`${mapExpanded ? 'h-full' : 'h-0 overflow-hidden'} md:h-full`}
            >
              <MapView
                userLat={lat}
                userLng={lng}
                stops={mapStops}
                selectedStopId={selectedStop?.id ?? null}
                onSelectStop={handleSelectStop}
                lang={lang}
                height="100%"
              />
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {tab === 'mtr' ? (
            <MtrPanel lang={lang} />
          ) : (
            <>
              {/* Mode: route vs nearby */}
              <div className="flex-shrink-0 px-3 pt-3 flex gap-2">
                <button
                  onClick={() => setBusMode('route')}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium border transition ${
                    busMode === 'route'
                      ? 'bg-slate-700 border-slate-500 text-white'
                      : 'bg-slate-900 border-slate-800 text-slate-400'
                  }`}
                >
                  {lang === 'tc' ? '輸入路線' : 'By route'}
                </button>
                <button
                  onClick={() => setBusMode('nearby')}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium border transition ${
                    busMode === 'nearby'
                      ? 'bg-slate-700 border-slate-500 text-white'
                      : 'bg-slate-900 border-slate-800 text-slate-400'
                  }`}
                >
                  {lang === 'tc' ? '附近車站' : 'Nearby'}
                </button>
              </div>

              {busMode === 'route' ? (
                <div className="flex-shrink-0 p-3 space-y-2 border-b border-slate-800">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={routeQuery}
                      onChange={(e) => setRouteQuery(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && onSearchRoute()}
                      placeholder={
                        lang === 'tc'
                          ? '輸入路線號碼，例如 1A、104、E22'
                          : 'Route no. e.g. 1A, 104, E22'
                      }
                      className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500 uppercase"
                      autoCapitalize="characters"
                    />
                    <button
                      onClick={onSearchRoute}
                      disabled={routeLoading || !routeQuery.trim()}
                      className="px-4 rounded-xl bg-red-600 hover:bg-red-500 text-sm font-medium disabled:opacity-40"
                    >
                      {routeLoading
                        ? '…'
                        : lang === 'tc'
                        ? '查'
                        : 'Go'}
                    </button>
                  </div>

                  {routeError && (
                    <p className="text-xs text-amber-400">{routeError}</p>
                  )}

                  {/* Direction / variant chips */}
                  {variants.length > 0 && (
                    <div className="flex flex-col gap-1.5 max-h-36 overflow-y-auto">
                      {variants.map((v, i) => {
                        const key = `${v.operator}-${v.route}-${v.bound}-${v.service_type}-${i}`
                        const active =
                          selectedVariant?.operator === v.operator &&
                          selectedVariant?.route === v.route &&
                          selectedVariant?.bound === v.bound &&
                          selectedVariant?.service_type === v.service_type
                        return (
                          <button
                            key={key}
                            onClick={() => pickVariant(v)}
                            className={`text-left px-3 py-2 rounded-xl text-xs border transition ${
                              active
                                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
                                : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:border-slate-500'
                            }`}
                          >
                            <span
                              className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold mr-2 ${
                                v.operator === 'KMB'
                                  ? 'bg-kmb text-white'
                                  : 'bg-ctb text-white'
                              }`}
                            >
                              {v.operator}
                            </span>
                            {lang === 'tc' ? v.label_tc : v.label_en}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex-shrink-0 p-3 space-y-2 border-b border-slate-800">
                  <input
                    type="search"
                    value={nearbyFilter}
                    onChange={(e) => setNearbyFilter(e.target.value)}
                    placeholder={
                      lang === 'tc'
                        ? '篩選附近站名…'
                        : 'Filter nearby stops…'
                    }
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
                  />
                  {geoError && (
                    <p className="text-xs text-amber-400">
                      {lang === 'tc'
                        ? '無法取得定位，請允許位置權限，或改用「輸入路線」'
                        : 'Location unavailable. Allow permission, or use By route.'}
                    </p>
                  )}
                  {!lat && !geoLoading && (
                    <button
                      onClick={requestGeo}
                      className="w-full py-2 rounded-xl bg-emerald-600/20 border border-emerald-500/30 text-emerald-300 text-sm"
                    >
                      {lang === 'tc'
                        ? '點擊取得附近巴士站'
                        : 'Get nearby bus stops'}
                    </button>
                  )}
                  {filteredNearby.length > 0 && (
                    <div className="flex overflow-x-auto gap-2 pb-1">
                      {filteredNearby.slice(0, 15).map((s) => (
                        <button
                          key={s.id}
                          onClick={() => handleSelectStop(s)}
                          className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs border transition ${
                            selectedStop?.id === s.id
                              ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                              : 'bg-slate-800 border-slate-700 text-slate-300'
                          }`}
                        >
                          {lang === 'tc' ? s.name_tc : s.name_en}
                          <span className="ml-1 opacity-60">
                            {Math.round(s.distance)}m
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Route stop list — pick a stop to see ALL buses at that stop */}
              {busMode === 'route' && (stopsLoadingRoute || routeStops.length > 0) && (
                <div className="flex-shrink-0 border-b border-slate-800 max-h-40 overflow-y-auto">
                  {stopsLoadingRoute ? (
                    <div className="p-3 text-sm text-slate-400">
                      {lang === 'tc' ? '載入車站列表…' : 'Loading stops…'}
                    </div>
                  ) : (
                    <div className="p-2 space-y-1">
                      <p className="px-1 text-[10px] text-slate-500 uppercase tracking-wider">
                        {lang === 'tc'
                          ? '選擇車站 → 顯示該站所有路線到站'
                          : 'Select stop → all routes at this stop'}
                      </p>
                      {routeStops.map((s) => (
                        <button
                          key={`${s.operator}-${s.stopId}-${s.seq}`}
                          onClick={() => handleSelectRouteStop(s)}
                          className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 transition ${
                            selectedStop?.id === s.stopId
                              ? 'bg-emerald-500/15 border border-emerald-500/30'
                              : 'hover:bg-slate-800/80'
                          }`}
                        >
                          <span className="text-slate-500 text-xs w-6 tabular-nums">
                            {s.seq}
                          </span>
                          <span className="flex-1 truncate">
                            {lang === 'tc' ? s.name_tc : s.name_en}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Selected stop + ETA (all routes at stop for KMB) */}
              {selectedStop && (
                <div className="flex-shrink-0 px-3 py-2 bg-slate-900/50 flex items-center justify-between border-b border-slate-800">
                  <div className="min-w-0">
                    <div className="font-semibold text-sm truncate">
                      {lang === 'tc'
                        ? selectedStop.name_tc
                        : selectedStop.name_en}
                    </div>
                    <div className="text-xs text-slate-400">
                      {selectedStop.operator === 'KMB'
                        ? lang === 'tc'
                          ? '此站所有九巴路線'
                          : 'All KMB routes at this stop'
                        : lang === 'tc'
                        ? `城巴 ${ctbFocusRoute || ''}`
                        : `CTB ${ctbFocusRoute || ''}`}
                    </div>
                  </div>
                  <button
                    onClick={() =>
                      loadEta(
                        selectedStop,
                        selectedStop.operator === 'CTB' ? ctbFocusRoute : null
                      )
                    }
                    className="text-xs text-slate-400 hover:text-white flex-shrink-0 ml-2"
                  >
                    {lang === 'tc' ? '更新' : 'Refresh'}
                  </button>
                </div>
              )}

              <div className="flex-1 overflow-y-auto">
                {stopsLoading && busMode === 'nearby' ? (
                  <div className="p-6 text-center text-slate-400 text-sm">
                    {lang === 'tc' ? '載入站點資料中…' : 'Loading stops…'}
                  </div>
                ) : !selectedStop ? (
                  <div className="p-6 text-center text-slate-500 text-sm">
                    {busMode === 'route'
                      ? lang === 'tc'
                        ? '輸入路線 → 選方向 → 選車站'
                        : 'Enter route → pick direction → pick stop'
                      : lang === 'tc'
                      ? '用定位選附近站，或切換「輸入路線」'
                      : 'Locate nearby stops, or switch to By route'}
                  </div>
                ) : (
                  <EtaList etas={etas} lang={lang} loading={etaLoading} />
                )}
              </div>
            </>
          )}
        </div>
      </main>

      <footer className="flex-shrink-0 text-center text-[10px] text-slate-500 py-1.5 border-t border-slate-800">
        Data: data.gov.hk · KMB · Citybus · MTR · Not affiliated
      </footer>
    </div>
  )
}
