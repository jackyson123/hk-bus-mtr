import { useState, useEffect, useCallback, useMemo } from 'react'
import MapView from './components/MapView'
import EtaList from './components/EtaList'
import MtrPanel from './components/MtrPanel'
import { useGeolocation } from './hooks/useGeolocation'
import { useFavorites } from './hooks/useFavorites'
import { useReminders } from './hooks/useReminders'
import {
  getKmbStops,
  getKmbStopEta,
  getCtbEta,
  getKmbRouteEta,
  searchRouteVariants,
  loadRouteStops,
  formatEta,
  haversine,
  type RouteVariant,
  type RouteStopItem,
} from './lib/api'
import type { BusStop, EtaItem, Lang, NearbyStop } from './types'

type Tab = 'bus' | 'mtr'
type BusMode = 'route' | 'nearby' | 'search' | 'favorites'

export default function App() {
  const [lang, setLang] = useState<Lang>('tc')
  const [tab, setTab] = useState<Tab>('bus')
  const [busMode, setBusMode] = useState<BusMode>('route')

  // Shared stop / ETA state
  const [selectedStop, setSelectedStop] = useState<BusStop | null>(null)
  const [etas, setEtas] = useState<EtaItem[]>([])
  const [etaLoading, setEtaLoading] = useState(false)
  const [mapExpanded, setMapExpanded] = useState(false)

  // Nearby / GPS
  const [allKmbStops, setAllKmbStops] = useState<BusStop[]>([])
  const [kmbStopMap, setKmbStopMap] = useState<Map<string, BusStop>>(new Map())
  const [nearby, setNearby] = useState<NearbyStop[]>([])
  const [nearbyFilter, setNearbyFilter] = useState('')
  const [stopsLoading, setStopsLoading] = useState(true)
  const [stopNameQuery, setStopNameQuery] = useState('')
  const [toast, setToast] = useState<string | null>(null)

  // Route search
  const [routeQuery, setRouteQuery] = useState('')
  const [variants, setVariants] = useState<RouteVariant[]>([])
  const [selectedVariant, setSelectedVariant] = useState<RouteVariant | null>(null)
  const [routeStops, setRouteStops] = useState<RouteStopItem[]>([])
  const [routeLoading, setRouteLoading] = useState(false)
  const [stopsLoadingRoute, setStopsLoadingRoute] = useState(false)
  const [routeError, setRouteError] = useState<string | null>(null)
  /** seq -> next few clock ETAs for current route variant */
  const [routeEtaBySeq, setRouteEtaBySeq] = useState<
    Record<number, { eta: string | null; eta_seq: number }[]>
  >({})

  // CTB: when showing stop ETA we only get KMB from stop-eta; for CTB we also fetch route-specific if needed
  const [ctbFocusRoute, setCtbFocusRoute] = useState<string | null>(null)

  const { lat, lng, error: geoError, loading: geoLoading, request: requestGeo } =
    useGeolocation(false)

  const {
    favStops,
    favRoutes,
    isStopFav,
    isRouteFav,
    toggleStop,
    toggleRoute,
    removeStop,
    removeRoute,
  } = useFavorites()

  const { reminders, addReminder, cancelReminder } = useReminders(lang)

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast(null), 2800)
  }, [])

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

  const stopNameResults = useMemo(() => {
    const q = stopNameQuery.trim()
    if (q.length < 1) return [] as BusStop[]
    const lower = q.toLowerCase()
    const scored = allKmbStops
      .filter(
        (s) =>
          s.name_tc.includes(q) ||
          s.name_en.toLowerCase().includes(lower)
      )
      .map((s) => {
        let score = 0
        if (s.name_tc === q || s.name_en.toLowerCase() === lower) score = 100
        else if (s.name_tc.startsWith(q) || s.name_en.toLowerCase().startsWith(lower))
          score = 50
        else score = 10
        if (lat && lng && s.lat && s.lng) {
          const d = haversine(lat, lng, s.lat, s.lng)
          score += Math.max(0, 20 - d / 500)
        }
        return { s, score }
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 40)
      .map((x) => x.s)
    return scored
  }, [stopNameQuery, allKmbStops, lat, lng])

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
    setRouteEtaBySeq({})
    setSelectedStop(null)
    setEtas([])
    setBusMode('route')
    if (typeof window !== 'undefined' && window.innerWidth >= 768) {
      setMapExpanded(true)
    }
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
    setRouteEtaBySeq({})
    setSelectedStop(null)
    setEtas([])
    try {
      const stops = await loadRouteStops(v, kmbStopMap)
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
      // 桌面自動開地圖；手機保持收起以免壓住班次
      if (typeof window !== 'undefined' && window.innerWidth >= 768) {
        setMapExpanded(true)
      }
      setBusMode('route')

      // Auto-load clock ETAs for every stop on this route
      if (v.operator === 'KMB') {
        try {
          const all = await getKmbRouteEta(v.route, v.service_type)
          const wantDir = v.bound === 'I' ? 'I' : 'O'
          const map: Record<number, { eta: string | null; eta_seq: number }[]> = {}
          for (const g of all) {
            if (g.dir && g.dir !== wantDir) continue
            map[g.seq] = g.etas.slice(0, 3).map((e) => ({
              eta: e.eta,
              eta_seq: e.eta_seq,
            }))
          }
          if (!Object.keys(map).length) {
            for (const g of all) {
              map[g.seq] = g.etas.slice(0, 3).map((e) => ({
                eta: e.eta,
                eta_seq: e.eta_seq,
              }))
            }
          }
          setRouteEtaBySeq(map)
        } catch (e) {
          console.error('route-eta failed', e)
        }
      } else {
        const map: Record<number, { eta: string | null; eta_seq: number }[]> = {}
        const batch = stops.slice(0, 25)
        await Promise.all(
          batch.map(async (s) => {
            try {
              const etas = await getCtbEta(s.stopId, v.route)
              if (etas.length) {
                map[s.seq] = etas.slice(0, 3).map((e) => ({
                  eta: e.eta,
                  eta_seq: e.eta_seq,
                }))
              }
            } catch {
              /* ignore */
            }
          })
        )
        setRouteEtaBySeq(map)
      }
    } catch (e: any) {
      setRouteError(e.message || 'Failed to load stops')
    } finally {
      setStopsLoadingRoute(false)
    }
  }

  // Map markers
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
    if (busMode === 'search' && stopNameResults.length) {
      return stopNameResults.filter((s) => s.lat && s.lng)
    }
    if (busMode === 'favorites' && favStops.length) {
      return favStops.map((s) => ({
        id: s.id,
        name_tc: s.name_tc,
        name_en: s.name_en,
        lat: s.lat,
        lng: s.lng,
        operator: s.operator as BusStop['operator'],
      }))
    }
    return filteredNearby.length ? filteredNearby : nearby
  }, [busMode, routeStops, filteredNearby, nearby, stopNameResults, favStops])

  const handleRemind = useCallback(
    async (opts: {
      route: string
      dest: string
      etaIso: string
      minutesBefore: number
    }) => {
      if (!selectedStop) return
      const res = await addReminder({
        ...opts,
        stopName:
          lang === 'tc' ? selectedStop.name_tc : selectedStop.name_en,
      })
      showToast(res.message)
    },
    [selectedStop, addReminder, lang, showToast]
  )

  return (
    <div className="h-full flex flex-col bg-stone-50 text-stone-900">
      {/* Header */}
      <header className="flex-shrink-0 border-b border-stone-200 bg-white/90 backdrop-blur sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-3 py-2.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-red-500 to-blue-600 flex items-center justify-center text-sm font-bold">
              巴
            </div>
            <div>
              <h1 className="font-bold text-base leading-tight">hk-bus-mtr</h1>
              <p className="text-[10px] text-stone-500 leading-none">
                {lang === 'tc' ? '九巴 · 城巴 · 港鐵' : 'KMB · Citybus · MTR'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setLang(lang === 'tc' ? 'en' : 'tc')}
              className="px-2.5 py-1 rounded-lg bg-stone-100 text-xs font-medium hover:bg-stone-200"
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
                ? 'bg-stone-800 text-white'
                : 'text-stone-500 hover:text-stone-800'
            }`}
          >
            {lang === 'tc' ? '巴士' : 'Bus'}
          </button>
          <button
            onClick={() => setTab('mtr')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${
              tab === 'mtr'
                ? 'bg-stone-800 text-white'
                : 'text-stone-500 hover:text-stone-800'
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
            className={`map-panel relative border-b md:border-b-0 md:border-r border-stone-200 md:w-[45%] lg:w-[50%] md:min-h-0 md:self-stretch ${
              mapExpanded ? 'h-40 md:h-auto md:flex-1' : 'h-11 md:h-auto md:flex-1'
            }`}
          >
            <button
              onClick={() => setMapExpanded((v) => !v)}
              className="md:hidden absolute top-2 right-2 z-10 px-2.5 py-1 rounded-lg bg-white/90 text-xs border border-stone-200"
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
                fitToStops={
                  (busMode === 'route' && routeStops.length > 0) ||
                  (busMode === 'search' && stopNameResults.length > 0)
                }
                fitKey={
                  busMode === 'route' && selectedVariant
                    ? `${selectedVariant.operator}-${selectedVariant.route}-${selectedVariant.bound}-${selectedVariant.service_type}-${routeStops.length}`
                    : busMode === 'search'
                    ? `search-${stopNameQuery}-${stopNameResults.length}`
                    : ''
                }
                showRouteLine={busMode === 'route' && routeStops.length > 1}
              />
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-h-0 flex flex-col overflow-y-auto">
          {tab === 'mtr' ? (
            <MtrPanel lang={lang} />
          ) : (
            <>
              {/* Mode tabs */}
              <div className="flex-shrink-0 sticky top-0 z-10 bg-stone-50/95 backdrop-blur px-3 pt-3 pb-2 grid grid-cols-4 gap-1.5 border-b border-stone-100">
                {(
                  [
                    ['route', lang === 'tc' ? '路線' : 'Route'],
                    ['search', lang === 'tc' ? '站名' : 'Stop'],
                    ['nearby', lang === 'tc' ? '附近' : 'Near'],
                    ['favorites', lang === 'tc' ? '收藏' : 'Fav'],
                  ] as const
                ).map(([mode, label]) => (
                  <button
                    key={mode}
                    onClick={() => setBusMode(mode)}
                    className={`py-2 rounded-xl text-xs font-medium border transition ${
                      busMode === mode
                        ? 'bg-stone-800 border-stone-800 text-white'
                        : 'bg-white border-stone-200 text-stone-500'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {busMode === 'route' ? (
                <div className="flex-shrink-0 p-3 space-y-2 border-b border-stone-200">
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
                      className="flex-1 bg-stone-100 border border-stone-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-stone-400 uppercase"
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
                          <div key={key} className="flex gap-1 items-stretch">
                            <button
                              onClick={() => pickVariant(v)}
                              className={`flex-1 text-left px-3 py-2 rounded-xl text-xs border transition ${
                                active
                                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
                                  : 'bg-stone-100 border-stone-200 text-stone-700 hover:border-stone-400'
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
                            <button
                              type="button"
                              className="px-2 rounded-xl border border-stone-200 text-amber-400 text-sm"
                              onClick={() => {
                                toggleRoute(v)
                                showToast(
                                  isRouteFav(v)
                                    ? lang === 'tc'
                                      ? '已取消收藏路線'
                                      : 'Route unfavourited'
                                    : lang === 'tc'
                                    ? '已收藏路線'
                                    : 'Route saved'
                                )
                              }}
                            >
                              {isRouteFav(v) ? '★' : '☆'}
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              ) : busMode === 'search' ? (
                <div className="flex-shrink-0 p-3 space-y-2 border-b border-stone-200">
                  <input
                    type="search"
                    value={stopNameQuery}
                    onChange={(e) => setStopNameQuery(e.target.value)}
                    placeholder={
                      lang === 'tc'
                        ? '輸入站名，例如 旺角、彌敦道…'
                        : 'Stop name e.g. Mong Kok…'
                    }
                    className="w-full bg-stone-100 border border-stone-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-stone-400"
                  />
                  {stopsLoading && (
                    <p className="text-xs text-stone-500">
                      {lang === 'tc' ? '載入站名資料中…' : 'Loading stop names…'}
                    </p>
                  )}
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {stopNameQuery.trim() && stopNameResults.length === 0 && !stopsLoading && (
                      <p className="text-xs text-stone-400 py-2">
                        {lang === 'tc' ? '找不到相關車站' : 'No matching stops'}
                      </p>
                    )}
                    {stopNameResults.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => {
                          handleSelectStop(s)
                          if (typeof window !== 'undefined' && window.innerWidth >= 768) {
                            setMapExpanded(true)
                          }
                        }}
                        className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 ${
                          selectedStop?.id === s.id
                            ? 'bg-emerald-500/15 border border-emerald-500/30'
                            : 'hover:bg-stone-100'
                        }`}
                      >
                        <span className="flex-1 truncate">
                          {lang === 'tc' ? s.name_tc : s.name_en}
                        </span>
                        <button
                          type="button"
                          className="text-sm px-1"
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleStop(s)
                            showToast(
                              isStopFav(s.operator, s.id)
                                ? lang === 'tc'
                                  ? '已取消收藏'
                                  : 'Removed favourite'
                                : lang === 'tc'
                                ? '已加入收藏'
                                : 'Saved to favourites'
                            )
                          }}
                        >
                          {isStopFav(s.operator, s.id) ? '★' : '☆'}
                        </button>
                      </button>
                    ))}
                  </div>
                </div>
              ) : busMode === 'favorites' ? (
                <div className="flex-shrink-0 p-3 space-y-3 border-b border-stone-200">
                  <div>
                    <p className="text-[10px] text-stone-400 uppercase tracking-wider mb-1">
                      {lang === 'tc' ? '收藏車站' : 'Favourite stops'}
                    </p>
                    {favStops.length === 0 ? (
                      <p className="text-xs text-stone-400">
                        {lang === 'tc'
                          ? '未有收藏。喺站名／附近／路線選站後撳 ★'
                          : 'None yet. Tap ★ on a stop to save.'}
                      </p>
                    ) : (
                      <div className="space-y-1">
                        {favStops.map((s) => (
                          <div
                            key={`${s.operator}-${s.id}`}
                            className="flex items-center gap-2"
                          >
                            <button
                              onClick={() =>
                                handleSelectStop({
                                  id: s.id,
                                  name_tc: s.name_tc,
                                  name_en: s.name_en,
                                  lat: s.lat,
                                  lng: s.lng,
                                  operator: s.operator as BusStop['operator'],
                                })
                              }
                              className={`flex-1 text-left px-3 py-2 rounded-lg text-sm ${
                                selectedStop?.id === s.id
                                  ? 'bg-emerald-500/15 border border-emerald-500/30'
                                  : 'bg-stone-50 hover:bg-stone-100'
                              }`}
                            >
                              {lang === 'tc' ? s.name_tc : s.name_en}
                            </button>
                            <button
                              type="button"
                              className="text-amber-400 px-2"
                              onClick={() => removeStop(s.operator, s.id)}
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <p className="text-[10px] text-stone-400 uppercase tracking-wider mb-1">
                      {lang === 'tc' ? '收藏路線' : 'Favourite routes'}
                    </p>
                    {favRoutes.length === 0 ? (
                      <p className="text-xs text-stone-400">
                        {lang === 'tc'
                          ? '未有收藏。選路線方向後撳 ★'
                          : 'None yet. Tap ★ on a route variant.'}
                      </p>
                    ) : (
                      <div className="space-y-1">
                        {favRoutes.map((r) => (
                          <div
                            key={`${r.operator}-${r.route}-${r.bound}-${r.service_type}`}
                            className="flex items-center gap-2"
                          >
                            <button
                              onClick={() => {
                                setBusMode('route')
                                setRouteQuery(r.route)
                                pickVariant({
                                  operator: r.operator,
                                  route: r.route,
                                  bound: r.bound,
                                  service_type: r.service_type,
                                  dest_tc: r.dest_tc,
                                  dest_en: r.dest_en,
                                  orig_tc: r.orig_tc,
                                  orig_en: r.orig_en,
                                  label_tc: r.label_tc,
                                  label_en: r.label_en,
                                })
                              }}
                              className="flex-1 text-left px-3 py-2 rounded-lg text-xs bg-stone-50 hover:bg-stone-100"
                            >
                              <span
                                className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold mr-1 ${
                                  r.operator === 'KMB'
                                    ? 'bg-kmb text-white'
                                    : 'bg-ctb text-white'
                                }`}
                              >
                                {r.operator}
                              </span>
                              {lang === 'tc' ? r.label_tc : r.label_en}
                            </button>
                            <button
                              type="button"
                              className="text-amber-400 px-2"
                              onClick={() => removeRoute(r)}
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  {reminders.length > 0 && (
                    <div>
                      <p className="text-[10px] text-stone-400 uppercase tracking-wider mb-1">
                        {lang === 'tc' ? '已設定提醒' : 'Active reminders'}
                      </p>
                      {reminders.map((r) => (
                        <div
                          key={r.id}
                          className="flex items-center gap-2 text-xs text-stone-700 py-1"
                        >
                          <span className="flex-1 truncate">
                            🔔 {r.route} · {r.stopName}
                          </span>
                          <button
                            type="button"
                            className="text-stone-400"
                            onClick={() => cancelReminder(r.id)}
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex-shrink-0 p-3 space-y-2 border-b border-stone-200">
                  <input
                    type="search"
                    value={nearbyFilter}
                    onChange={(e) => setNearbyFilter(e.target.value)}
                    placeholder={
                      lang === 'tc'
                        ? '篩選附近站名…'
                        : 'Filter nearby stops…'
                    }
                    className="w-full bg-stone-100 border border-stone-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-stone-400"
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
                              : 'bg-stone-100 border-stone-200 text-stone-700'
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
                <div className="flex-shrink-0 border-b border-stone-200">
                  {stopsLoadingRoute ? (
                    <div className="p-3 text-sm text-stone-500">
                      {lang === 'tc' ? '載入車站列表…' : 'Loading stops…'}
                    </div>
                  ) : (
                    <div className="p-2 space-y-1">
                      <p className="px-1 text-[10px] text-stone-400 uppercase tracking-wider">
                        {lang === 'tc'
                          ? '各站到站時間（撳站可睇同站其他車）'
                          : 'ETA per stop (tap for all routes at stop)'}
                      </p>
                      {routeStops.map((s) => {
                        const times = routeEtaBySeq[s.seq] || []
                        return (
                          <button
                            key={`${s.operator}-${s.stopId}-${s.seq}`}
                            onClick={() => handleSelectRouteStop(s)}
                            className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 transition ${
                              selectedStop?.id === s.stopId
                                ? 'bg-emerald-500/15 border border-emerald-500/30'
                                : 'hover:bg-stone-100'
                            }`}
                          >
                            <span className="text-stone-400 text-xs w-6 tabular-nums flex-shrink-0">
                              {s.seq}
                            </span>
                            <span className="flex-1 min-w-0 truncate">
                              {lang === 'tc' ? s.name_tc : s.name_en}
                            </span>
                            <span className="flex-shrink-0 flex gap-1.5 tabular-nums text-xs font-medium">
                              {times.length === 0 ? (
                                <span className="text-stone-400">—</span>
                              ) : (
                                times.map((t, i) => (
                                  <span
                                    key={i}
                                    className={
                                      i === 0
                                        ? 'text-emerald-300'
                                        : 'text-stone-500'
                                    }
                                  >
                                    {formatEta(t.eta, lang)}
                                  </span>
                                ))
                              )}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Selected stop + ETA (all routes at stop for KMB) */}
              {selectedStop && (
                <div className="flex-shrink-0 px-3 py-2 bg-stone-100/80 flex items-center justify-between border-b border-stone-200 gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-sm truncate">
                      {lang === 'tc'
                        ? selectedStop.name_tc
                        : selectedStop.name_en}
                    </div>
                    <div className="text-xs text-stone-500">
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
                    type="button"
                    onClick={() => {
                      toggleStop(selectedStop)
                      showToast(
                        isStopFav(selectedStop.operator, selectedStop.id)
                          ? lang === 'tc'
                            ? '已取消收藏'
                            : 'Removed favourite'
                          : lang === 'tc'
                          ? '已加入收藏'
                          : 'Saved to favourites'
                      )
                    }}
                    className="text-lg flex-shrink-0 text-amber-400"
                    title={lang === 'tc' ? '收藏車站' : 'Favourite stop'}
                  >
                    {isStopFav(selectedStop.operator, selectedStop.id) ? '★' : '☆'}
                  </button>
                  <button
                    onClick={() =>
                      loadEta(
                        selectedStop,
                        selectedStop.operator === 'CTB' ? ctbFocusRoute : null
                      )
                    }
                    className="text-xs text-stone-500 hover:text-stone-900 flex-shrink-0"
                  >
                    {lang === 'tc' ? '更新' : 'Refresh'}
                  </button>
                </div>
              )}

              <div className="pb-8">
                {stopsLoading && busMode === 'nearby' ? (
                  <div className="p-6 text-center text-stone-500 text-sm">
                    {lang === 'tc' ? '載入站點資料中…' : 'Loading stops…'}
                  </div>
                ) : !selectedStop ? (
                  <div className="p-6 text-center text-stone-400 text-sm">
                    {busMode === 'route'
                      ? lang === 'tc'
                        ? '輸入路線 → 選方向 → 選車站'
                        : 'Enter route → pick direction → pick stop'
                      : lang === 'tc'
                      ? '用定位選附近站，或切換「輸入路線」'
                      : 'Locate nearby stops, or switch to By route'}
                  </div>
                ) : (
                  <EtaList
                    etas={etas}
                    lang={lang}
                    loading={etaLoading}
                    stopName={
                      lang === 'tc'
                        ? selectedStop.name_tc
                        : selectedStop.name_en
                    }
                    onRemind={handleRemind}
                  />
                )}
              </div>
            </>
          )}
        </div>
      </main>

      {toast && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-stone-800 text-white text-sm shadow-lg max-w-[90%] text-center">
          {toast}
        </div>
      )}

      <footer className="flex-shrink-0 text-center text-[10px] text-stone-400 py-1.5 border-t border-stone-200">
        Data: data.gov.hk · KMB · Citybus · MTR · Not affiliated
      </footer>
    </div>
  )
}
