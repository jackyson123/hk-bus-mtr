import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
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
  groupVariantsByDirection,
  loadRouteStops,
  formatEta,
  sortEtasByTime,
  haversine,
  getFullFare,
  formatFare,
  getSectionFares,
  type RouteVariant,
  type DirectionGroup,
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
  const [nearbyEtas, setNearbyEtas] = useState<Record<string, EtaItem[]>>({})
  const [nearbyEtaLoading, setNearbyEtaLoading] = useState(false)
  const [routeFare, setRouteFare] = useState<number | null>(null)
  const [nearestStopId, setNearestStopId] = useState<string | null>(null)
  /** 路線模式下：是否展開「此站所有路線」 */
  const [showAllAtStop, setShowAllAtStop] = useState(false)
  const [sectionFares, setSectionFares] = useState<number[] | null>(null)
  const nearestStopRef = useRef<HTMLButtonElement | null>(null)

  // Route search
  const [routeQuery, setRouteQuery] = useState('')
  const [variants, setVariants] = useState<RouteVariant[]>([])
  const [directionGroups, setDirectionGroups] = useState<DirectionGroup[]>([])
  const [activePartners, setActivePartners] = useState<RouteVariant[]>([])
  const [selectedVariant, setSelectedVariant] = useState<RouteVariant | null>(null)
  const [routeStops, setRouteStops] = useState<RouteStopItem[]>([])
  const [routeLoading, setRouteLoading] = useState(false)
  const [stopsLoadingRoute, setStopsLoadingRoute] = useState(false)
  const [routeError, setRouteError] = useState<string | null>(null)
  /** seq -> next few clock ETAs for current route variant */
  const [routeEtaBySeq, setRouteEtaBySeq] = useState<
    Record<number, { eta: string | null; eta_seq: number; operator: 'KMB' | 'CTB' }[]>
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

  // 附近：每個站載入有咩巴士
  useEffect(() => {
    if (busMode !== 'nearby' || !nearby.length) {
      setNearbyEtas({})
      return
    }
    let cancelled = false
    ;(async () => {
      setNearbyEtaLoading(true)
      const top = nearby.slice(0, 8)
      const map: Record<string, EtaItem[]> = {}
      await Promise.all(
        top.map(async (s) => {
          try {
            const etas = await getKmbStopEta(s.id)
            if (!cancelled) map[s.id] = etas.slice(0, 8)
          } catch {
            if (!cancelled) map[s.id] = []
          }
        })
      )
      if (!cancelled) {
        setNearbyEtas({ ...map })
        setNearbyEtaLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [busMode, nearby])

  // 路線模式：定時自動更新各站到站（唔使手動）
  useEffect(() => {
    if (busMode !== 'route' || !selectedVariant || !routeStops.length) return
    let cancelled = false
    const refresh = async () => {
      const v = selectedVariant
      try {
        if (v.operator === 'KMB') {
          const all = await getKmbRouteEta(v.route, v.service_type)
          const wantDir = v.bound === 'I' ? 'I' : 'O'
          const map: Record<number, { eta: string | null; eta_seq: number; operator: 'KMB' | 'CTB' }[]> = {}
          for (const g of all) {
            if (g.dir && g.dir !== wantDir) continue
            map[g.seq] = sortEtasByTime(g.etas).slice(0, 3).map((e) => ({
              eta: e.eta,
              eta_seq: e.eta_seq,
              operator: 'KMB' as const,
            }))
          }
          if (!Object.keys(map).length) {
            for (const g of all) {
              map[g.seq] = sortEtasByTime(g.etas).slice(0, 3).map((e) => ({
                eta: e.eta,
                eta_seq: e.eta_seq,
                operator: 'KMB' as const,
              }))
            }
          }
          if (!cancelled && Object.keys(map).length) setRouteEtaBySeq(map)
        }
      } catch {
        /* will try next interval */
      }
    }
    const t = setInterval(refresh, 25000)
    return () => {
      cancelled = true
      clearInterval(t)
    }
  }, [busMode, selectedVariant, routeStops.length])


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
    if (!selectedStop) return
    // 路線模式未撳「其他車」就唔載入同站全部路線
    if (busMode === 'route' && !showAllAtStop) return
    loadEta(
      selectedStop,
      selectedStop.operator === 'CTB' ? ctbFocusRoute : null
    )
  }, [selectedStop, loadEta, ctbFocusRoute, busMode, showAllAtStop])

  useEffect(() => {
    if (!selectedStop) return
    if (busMode === 'route' && !showAllAtStop) return
    const t = setInterval(() => {
      loadEta(
        selectedStop,
        selectedStop.operator === 'CTB' ? ctbFocusRoute : null
      )
    }, 30000)
    return () => clearInterval(t)
  }, [selectedStop, loadEta, ctbFocusRoute, busMode, showAllAtStop])

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
    // 唔改 nearestStopId ——「最近」只由 GPS 計一次
    setShowAllAtStop(false)
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
    setDirectionGroups([])
    setActivePartners([])
    setSelectedVariant(null)
    setRouteStops([])
    setRouteEtaBySeq({})
    setSelectedStop(null)
    setEtas([])
    setRouteFare(null)
    setNearestStopId(null)
    setShowAllAtStop(false)
    setSectionFares(null)
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
        setDirectionGroups([])
      } else {
        setVariants(list)
        const groups = groupVariantsByDirection(list)
        setDirectionGroups(groups)
        // 只有一個方向 → 自動揀；聯營唔使再揀九巴/城巴
        if (groups.length === 1) {
          await pickDirection(groups[0])
        }
      }
    } catch (e: any) {
      setRouteError(e.message || 'Search failed')
    } finally {
      setRouteLoading(false)
    }
  }

  const pickDirection = async (g: DirectionGroup) => {
    setActivePartners(g.partners)
    await pickVariant(g.primary, g.partners)
  }

  const pickVariant = async (v: RouteVariant, partners?: RouteVariant[]) => {
    const allPartners =
      partners && partners.length
        ? partners
        : activePartners.length
        ? activePartners
        : [v]
    setActivePartners(allPartners)
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
      if (typeof window !== 'undefined' && window.innerWidth >= 768) {
        setMapExpanded(true)
      }
      setBusMode('route')

      // GPS：跳到本線最近站並標示
      let nearestId: string | null = null
      if (lat != null && lng != null && stops.length) {
        let best = Infinity
        for (const s of stops) {
          if (!s.lat || !s.lng) continue
          const d = haversine(lat, lng, s.lat, s.lng)
          if (d < best) {
            best = d
            nearestId = s.stopId
          }
        }
        setNearestStopId(nearestId)
        // 路線模式只標示最近站，唔自動開「此站所有路線」
        setSelectedStop(null)
        setEtas([])
      } else {
        setNearestStopId(null)
      }

      try {
        const fare = await getFullFare(v.operator, v.route, v.bound)
        setRouteFare(fare)
      } catch {
        setRouteFare(null)
      }
      try {
        const sf = await getSectionFares(
          v.operator,
          v.route,
          v.bound,
          v.service_type
        )
        setSectionFares(sf)
      } catch {
        setSectionFares(null)
      }
      // 等 list render 後 scroll 到最近站
      window.setTimeout(() => {
        nearestStopRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        })
      }, 350)

      // 自動載入各站到站時間，失敗會自動重試
      const loadRouteEtas = async (): Promise<boolean> => {
        try {
          const map: Record<number, { eta: string | null; eta_seq: number; operator: 'KMB' | 'CTB' }[]> = {}
          const partners =
            allPartners && allPartners.length ? allPartners : [v]

          // KMB route-eta（一次攞齊各站）
          const kmbP = partners.find((p) => p.operator === 'KMB')
          if (kmbP) {
            try {
              const all = await getKmbRouteEta(kmbP.route, kmbP.service_type)
              const wantDir = kmbP.bound === 'I' ? 'I' : 'O'
              for (const g of all) {
                if (g.dir && g.dir !== wantDir) continue
                const sorted = sortEtasByTime(g.etas).slice(0, 4)
                if (!map[g.seq]) map[g.seq] = []
                map[g.seq].push(
                  ...sorted.map((e) => ({
                    eta: e.eta,
                    eta_seq: e.eta_seq,
                    operator: 'KMB' as const,
                  }))
                )
              }
              if (!Object.keys(map).length) {
                for (const g of all) {
                  const sorted = sortEtasByTime(g.etas).slice(0, 4)
                  if (!map[g.seq]) map[g.seq] = []
                  map[g.seq].push(
                    ...sorted.map((e) => ({
                      eta: e.eta,
                      eta_seq: e.eta_seq,
                      operator: 'KMB' as const,
                    }))
                  )
                }
              }
            } catch (e) {
              console.error('KMB route-eta', e)
            }
          }

          // 城巴：用站點座標配對後合併時間
          const ctbP = partners.find((p) => p.operator === 'CTB')
          if (ctbP) {
            try {
              let ctbStops = await loadRouteStops(ctbP, kmbStopMap)
              if (!ctbStops.length) {
                // 試另一方向
                const altBound =
                  ctbP.bound === 'outbound' || ctbP.bound === 'O'
                    ? 'inbound'
                    : 'outbound'
                ctbStops = await loadRouteStops(
                  { ...ctbP, bound: altBound },
                  kmbStopMap
                )
              }
              // 每個主線站搵最近城巴站（80m 內）
              const matches: { seq: number; ctbStopId: string }[] = []
              for (const s of stops) {
                if (!s.lat || !s.lng) continue
                let best: { id: string; d: number } | null = null
                for (const cs of ctbStops) {
                  if (!cs.lat || !cs.lng) continue
                  const d = haversine(s.lat, s.lng, cs.lat, cs.lng)
                  if (d < 80 && (!best || d < best.d)) {
                    best = { id: cs.stopId, d }
                  }
                }
                if (best) matches.push({ seq: s.seq, ctbStopId: best.id })
              }
              // 最多 20 個站並行攞城巴 ETA
              await Promise.all(
                matches.slice(0, 20).map(async (m) => {
                  try {
                    const etas = await getCtbEta(m.ctbStopId, ctbP.route)
                    if (!etas.length) return
                    if (!map[m.seq]) map[m.seq] = []
                    map[m.seq].push(
                      ...sortEtasByTime(etas)
                        .slice(0, 3)
                        .map((e) => ({
                          eta: e.eta,
                          eta_seq: e.eta_seq,
                          operator: 'CTB' as const,
                        }))
                    )
                  } catch {
                    /* ignore */
                  }
                })
              )
            } catch (e) {
              console.error('CTB merge eta', e)
            }
          }

          // 各站時間合併後再排序截取
          for (const seq of Object.keys(map)) {
            const n = Number(seq)
            map[n] = sortEtasByTime(map[n]).slice(0, 4)
          }
          setRouteEtaBySeq(map)
          return Object.keys(map).length > 0
        } catch (e) {
          console.error('route-eta failed', e)
          return false
        }
      }
      let ok = await loadRouteEtas()
      for (let attempt = 0; !ok && attempt < 3; attempt++) {
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)))
        ok = await loadRouteEtas()
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
                    ['nearby', lang === 'tc' ? '附近' : 'Near'],
                    ['route', lang === 'tc' ? '路線' : 'Route'],
                    ['search', lang === 'tc' ? '查站' : 'Stop'],
                    ['favorites', lang === 'tc' ? '收藏' : 'Fav'],
                  ] as const
                ).map(([mode, label]) => (
                  <button
                    key={mode}
                    onClick={() => {
                      setBusMode(mode)
                      if (mode === 'nearby') requestGeo()
                    }}
                    className={`py-2 rounded-xl text-xs font-medium border transition ${
                      busMode === mode
                        ? 'bg-stone-800 border-stone-800 text-white'
                        : 'bg-white border-stone-200 text-stone-700'
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
                  {directionGroups.length > 0 && (
                    <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto">
                      {directionGroups.map((g) => {
                        const active =
                          !!selectedVariant &&
                          selectedVariant.route === g.route &&
                          (selectedVariant.dest_tc === g.dest_tc ||
                            selectedVariant.dest_en === g.dest_en)
                        return (
                          <button
                            key={g.key}
                            type="button"
                            onClick={() => pickDirection(g)}
                            className={`w-full text-left px-3 py-2.5 rounded-xl text-sm border transition ${
                              active
                                ? 'bg-stone-800 text-white border-stone-800'
                                : 'bg-white text-stone-800 border-stone-200 hover:border-stone-400'
                            }`}
                          >
                            <div className="font-semibold">
                              {lang === 'tc' ? g.label_tc : g.label_en}
                            </div>
                            <div
                              className={`text-[11px] mt-0.5 ${
                                active ? 'text-stone-300' : 'text-stone-500'
                              }`}
                            >
                              {g.isJoint
                                ? lang === 'tc'
                                  ? '聯營 · 到站時間合併九巴+城巴'
                                  : 'Joint · KMB+CTB times merged'
                                : g.primary.operator === 'KMB'
                                ? lang === 'tc'
                                  ? '九巴'
                                  : 'KMB'
                                : lang === 'tc'
                                ? '城巴'
                                : 'Citybus'}
                              {' · '}
                              {lang === 'tc' ? g.orig_tc : g.orig_en}
                              {' → '}
                              {lang === 'tc' ? g.dest_tc : g.dest_en}
                            </div>
                          </button>
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
                      <p className="text-xs text-stone-600 py-2">
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
                    <p className="text-[10px] text-stone-600 uppercase tracking-wider mb-1">
                      {lang === 'tc' ? '收藏車站' : 'Favourite stops'}
                    </p>
                    {favStops.length === 0 ? (
                      <p className="text-xs text-stone-600">
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
                    <p className="text-[10px] text-stone-600 uppercase tracking-wider mb-1">
                      {lang === 'tc' ? '收藏路線' : 'Favourite routes'}
                    </p>
                    {favRoutes.length === 0 ? (
                      <p className="text-xs text-stone-600">
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
                      <p className="text-[10px] text-stone-600 uppercase tracking-wider mb-1">
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
                            className="text-stone-600"
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
                      className="w-full py-2 rounded-xl bg-emerald-600/20 border border-emerald-500/30 text-emerald-700 text-sm"
                    >
                      {lang === 'tc'
                        ? '點擊取得附近巴士站'
                        : 'Get nearby bus stops'}
                    </button>
                  )}
                  {nearbyEtaLoading && (
                    <p className="text-xs text-stone-600">
                      {lang === 'tc' ? '載入附近巴士…' : 'Loading nearby buses…'}
                    </p>
                  )}
                  <div className="space-y-3 max-h-[50vh] overflow-y-auto">
                    {filteredNearby.slice(0, 8).map((s) => {
                      const etas = nearbyEtas[s.id] || []
                      // group by route
                      const byRoute: Record<string, typeof etas> = {}
                      for (const e of etas) {
                        const k = `${e.operator}-${e.route}`
                        if (!byRoute[k]) byRoute[k] = []
                        byRoute[k].push(e)
                      }
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => handleSelectStop(s)}
                          className={`w-full text-left rounded-2xl border p-3 transition ${
                            selectedStop?.id === s.id
                              ? 'border-emerald-500 bg-emerald-50'
                              : 'border-stone-200 bg-white hover:border-stone-300'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <span className="font-bold text-base truncate">
                              {lang === 'tc' ? s.name_tc : s.name_en}
                            </span>
                            <span className="text-xs text-stone-700 flex-shrink-0 font-medium">
                              {Math.round(s.distance)}m
                            </span>
                          </div>
                          {etas.length === 0 ? (
                            <p className="text-sm text-stone-600">
                              {nearbyEtaLoading
                                ? '…'
                                : lang === 'tc'
                                ? '暫無到站'
                                : 'No ETA'}
                            </p>
                          ) : (
                            <div className="space-y-1.5">
                              {Object.values(byRoute)
                                .slice(0, 5)
                                .map((items) => {
                                  const first = items[0]
                                  const times = items
                                    .slice(0, 2)
                                    .map((e) => formatEta(e.eta, lang))
                                    .join(' · ')
                                  return (
                                    <div
                                      key={`${first.operator}-${first.route}`}
                                      className="flex items-center gap-2 text-sm"
                                    >
                                      <span
                                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded text-white ${
                                          first.operator === 'KMB' ? 'bg-kmb' : 'bg-ctb'
                                        }`}
                                      >
                                        {first.route}
                                      </span>
                                      <span className="text-stone-700 truncate flex-1 text-xs">
                                        → {lang === 'tc' ? first.dest_tc : first.dest_en}
                                      </span>
                                      <span className="font-semibold tabular-nums text-stone-800 flex-shrink-0">
                                        {times}
                                      </span>
                                    </div>
                                  )
                                })}
                            </div>
                          )}
                        </button>
                      )
                    })}
                  </div>
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
                      <div className="px-1 flex items-center justify-between gap-2 flex-wrap mb-1">
                        <p className="text-[10px] text-stone-600 uppercase tracking-wider">
                          {lang === 'tc'
                            ? '各站到站（最近站已標示）'
                            : 'Stops (nearest marked)'}
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {routeFare != null && (
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
                              {formatFare(routeFare, lang)}
                            </span>
                          )}
                          {sectionFares && sectionFares.length > 0 && (
                            <span className="text-[10px] text-stone-600 px-1.5 py-0.5">
                              {lang === 'tc'
                                ? '站旁 $ = 由此上車全程分段'
                                : 'Stop $ = stage fare from here'}
                            </span>
                          )}
                        </div>
                      </div>
                      {nearestStopId && lat != null && (
                        <p className="px-1 text-xs text-emerald-700 mb-1">
                          {lang === 'tc'
                            ? '📍 已跳至 GPS 最近站'
                            : '📍 Jumped to nearest stop by GPS'}
                        </p>
                      )}
                      {routeStops.map((s, idx) => {
                        const times = sortEtasByTime(routeEtaBySeq[s.seq] || [])
                        const isNearest = nearestStopId === s.stopId
                        const boardFare =
                          sectionFares && sectionFares[idx] != null
                            ? sectionFares[idx]
                            : null
                        return (
                          <div
                            key={`${s.operator}-${s.stopId}-${s.seq}`}
                            className={`w-full px-3 py-2.5 rounded-lg text-sm flex flex-col gap-1.5 transition border ${
                              isNearest
                                ? 'bg-amber-50 border-amber-400 border-2'
                                : selectedStop?.id === s.stopId
                                ? 'bg-emerald-50 border-emerald-400'
                                : 'border-transparent hover:bg-stone-100'
                            }`}
                          >
                            <button
                              ref={isNearest ? nearestStopRef : undefined}
                              type="button"
                              onClick={() => handleSelectRouteStop(s)}
                              className="w-full text-left flex items-center gap-2"
                            >
                              <span className="text-stone-600 text-xs w-6 tabular-nums flex-shrink-0 font-medium">
                                {s.seq}
                              </span>
                              <span className="flex-1 min-w-0">
                                <span className="truncate block font-medium">
                                  {lang === 'tc' ? s.name_tc : s.name_en}
                                </span>
                                {isNearest && (
                                  <span className="text-[10px] font-bold text-amber-700">
                                    {lang === 'tc' ? '📍 最近' : '📍 Nearest'}
                                  </span>
                                )}
                              </span>
                              {boardFare != null && (
                                <span className="flex-shrink-0 text-[11px] font-bold text-amber-900 bg-amber-100 border border-amber-300 px-1.5 py-0.5 rounded">
                                  ${boardFare.toFixed(1)}
                                </span>
                              )}
                              <span
                                role="button"
                                tabIndex={0}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleSelectRouteStop(s)
                                  setShowAllAtStop(true)
                                }}
                                className="flex-shrink-0 text-[10px] px-1.5 py-1 rounded bg-stone-200 text-stone-700 font-medium"
                              >
                                {lang === 'tc' ? '其他車' : 'Other'}
                              </span>
                            </button>
                            <div className="pl-8 flex flex-wrap items-center gap-2">
                              {times.length === 0 ? (
                                <span className="text-stone-500 text-xs">
                                  {lang === 'tc' ? '載入中…' : 'Loading…'}
                                </span>
                              ) : (
                                times.map((tm, i) => (
                                  <span
                                    key={i}
                                    className={`inline-flex flex-col items-center leading-tight px-2 py-1 rounded-md ${
                                      i === 0
                                        ? 'bg-emerald-100'
                                        : 'bg-stone-100'
                                    }`}
                                  >
                                    <span
                                      className={`tabular-nums text-sm font-bold ${
                                        i === 0
                                          ? 'text-emerald-900'
                                          : 'text-stone-800'
                                      }`}
                                    >
                                      {formatEta(tm.eta, lang)}
                                    </span>
                                    <span
                                      className={`text-[9px] font-semibold mt-0.5 ${
                                        tm.operator === 'CTB'
                                          ? 'text-orange-600'
                                          : 'text-red-700'
                                      }`}
                                    >
                                      {tm.operator === 'CTB'
                                        ? lang === 'tc'
                                          ? '城巴'
                                          : 'CTB'
                                        : lang === 'tc'
                                        ? '九巴'
                                        : 'KMB'}
                                    </span>
                                  </span>
                                ))
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Selected stop + ETA：附近/查站/收藏 常顯；路線模式要撳「同站其他車」先顯 */}
              {selectedStop && (busMode !== 'route' || showAllAtStop) && (
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
                ) : busMode === 'route' && !showAllAtStop ? (
                  <div className="p-4 text-center text-stone-600 text-sm">
                    {routeStops.length
                      ? lang === 'tc'
                        ? '上面係本線各站到站時間。撳站旁「其他車」可睇同站其他路線。'
                        : 'Above: this route’s stops. Tap “Other” for all routes at a stop.'
                      : lang === 'tc'
                      ? '輸入路線 → 選方向'
                      : 'Enter route → pick direction'}
                  </div>
                ) : !selectedStop ? (
                  <div className="p-6 text-center text-stone-600 text-sm">
                    {lang === 'tc'
                      ? '用定位選附近站，或切換「查站」'
                      : 'Locate nearby, or use Stop search'}
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

      <footer className="flex-shrink-0 text-center text-[10px] text-stone-600 py-1.5 border-t border-stone-200">
        Data: data.gov.hk · KMB · Citybus · MTR · Not affiliated
      </footer>
    </div>
  )
}
