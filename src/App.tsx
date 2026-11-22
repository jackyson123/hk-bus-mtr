import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import type { ComponentType } from 'react'
import MapView from './components/MapView'
import EtaList from './components/EtaList'
import MtrPanel from './components/MtrPanel'
import GmbPanel from './components/GmbPanel'
import type { GmbTarget } from './components/GmbPanel'
import LiveClock from './components/LiveClock'
import {
  IconPin,
  IconRoute,
  IconSearch,
  IconStar,
  IconBus,
  IconTrain,
  IconMinibus,
  IconMap,
  IconWalk,
  IconRefresh,
  IconChevron,
} from './components/Icons'
import { useGeolocation } from './hooks/useGeolocation'
import type { FavRoute, FavRouteStop } from './lib/favorites'
import { regionMeta, regionLabel } from './lib/gmb'
import type { GmbRegion } from './lib/gmb'
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

type Tab = 'bus' | 'gmb' | 'mtr'
type BusMode = 'route' | 'nearby' | 'search' | 'favorites'

export default function App() {
  const [lang, setLang] = useState<Lang>('tc')
  const [tab, setTab] = useState<Tab>('bus')
  const [busMode, setBusMode] = useState<BusMode>('route')

  // 港鐵：目前選中嘅線／站（由 App 持有，方便收藏一鍵跳轉）
  const [mtrLine, setMtrLine] = useState('TCL')
  const [mtrStation, setMtrStation] = useState('HOK')
  // 小巴：由收藏跳入嘅目標
  const [gmbTarget, setGmbTarget] = useState<GmbTarget | null>(null)

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
  const [nearbyEtaStatus, setNearbyEtaStatus] = useState<
    Record<string, 'loading' | 'retry' | 'ok' | 'error'>
  >({})
  const [nearbyReloadKey, setNearbyReloadKey] = useState(0)
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
    favRouteStops,
    favGmb,
    favMtr,
    isStopFav,
    isRouteFav,
    isRouteStopFav,
    isGmbFav,
    isMtrFav,
    toggleStop,
    toggleRoute,
    toggleRouteStop,
    toggleGmb,
    toggleMtr,
    removeStop,
    removeRoute,
    removeRouteStop,
    removeGmb,
    removeMtr,
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

  // 附近：分批（併發上限 4）載入每個站嘅到站，失敗自動重試
  useEffect(() => {
    if (busMode !== 'nearby') return
    const top = nearby.slice(0, 12)
    if (!top.length) {
      setNearbyEtas({})
      setNearbyEtaStatus({})
      return
    }

    let cancelled = false
    let periodic: number | undefined
    let quickRefreshUsed = 0
    const timers: number[] = []
    const failedIds = new Set<string>()
    const allIds = top.map((s) => s.id)

    const sleep = (ms: number) =>
      new Promise<void>((resolve) => {
        const t = window.setTimeout(resolve, ms)
        timers.push(t)
      })

    /** 單站：成功即寫入；失敗等 1.5s / 3s 再試，最多 3 次 */
    const tryStop = async (id: string): Promise<'ok' | 'fail'> => {
      for (let attempt = 0; attempt < 3; attempt++) {
        if (cancelled) return 'fail'
        if (attempt > 0) {
          setNearbyEtaStatus((prev) => ({ ...prev, [id]: 'retry' }))
          await sleep(1500 * attempt)
          if (cancelled) return 'fail'
        }
        try {
          const etas = await getKmbStopEta(id)
          if (cancelled) return 'fail'
          // 保留多班（每線通常 2–3 班）
          setNearbyEtas((prev) => ({ ...prev, [id]: etas.slice(0, 24) }))
          setNearbyEtaStatus((prev) => ({ ...prev, [id]: 'ok' }))
          failedIds.delete(id)
          // 有路線當刻攞唔到時間（eta = null）：稍後再刷新一次
          if (
            quickRefreshUsed < 1 &&
            (etas.length === 0 || etas.some((e) => !e.eta))
          ) {
            quickRefreshUsed++
            timers.push(
              window.setTimeout(() => {
                if (!cancelled) runRound(allIds)
              }, 8000)
            )
          }
          return 'ok'
        } catch {
          /* 下一輪再試 */
        }
      }
      if (!cancelled) {
        failedIds.add(id)
        setNearbyEtaStatus((prev) => ({ ...prev, [id]: 'error' }))
      }
      return 'fail'
    }

    /** 一輪：最多 4 個請求同時進行 */
    const runRound = async (
      ids: string[],
      opts: { first?: boolean } = {}
    ): Promise<number> => {
      if (cancelled || !ids.length) return 0
      if (opts.first) setNearbyEtaLoading(true)
      setNearbyEtaStatus((prev) => {
        const next = { ...prev }
        for (const id of ids) {
          if (next[id] !== 'ok') next[id] = next[id] === 'error' ? 'loading' : next[id] || 'loading'
        }
        return next
      })
      let cursor = 0
      let fails = 0
      const workers = Array.from(
        { length: Math.min(4, ids.length) },
        async () => {
          while (!cancelled) {
            const i = cursor++
            if (i >= ids.length) return
            const res = await tryStop(ids[i])
            if (res === 'fail') fails++
          }
        }
      )
      await Promise.all(workers)
      if (opts.first && !cancelled) setNearbyEtaLoading(false)
      return fails
    }

    /** 整輪失敗站再掃一次（最多兩轉，唔會無限 loop） */
    let extraSweeps = 0
    const sweepFailed = async () => {
      if (cancelled || extraSweeps >= 2) return
      const ids = [...failedIds]
      if (!ids.length) return
      extraSweeps++
      timers.push(
        window.setTimeout(async () => {
          if (cancelled) return
          const fails = await runRound(ids)
          if (!cancelled && (fails > 0 || failedIds.size > 0)) sweepFailed()
        }, 6000)
      )
    }

    const start = async () => {
      const fails = await runRound(allIds, { first: true })
      if (cancelled) return
      if (fails > 0) sweepFailed()
      // 定時刷新（保留現有資料，唔會閃白）
      periodic = window.setInterval(() => {
        if (!cancelled) runRound(allIds)
      }, 25000)
    }
    start()

    return () => {
      cancelled = true
      if (periodic) window.clearInterval(periodic)
      timers.forEach((t) => window.clearTimeout(t))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busMode, nearby, nearbyReloadKey])

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

  /** 跳去路線站行：重試幾次，等班次資料載入後版面穩定再置中 */
  const scrollToRouteStop = (seq: number) => {
    ;[350, 1200, 2100].forEach((delay) => {
      window.setTimeout(() => {
        document
          .getElementById(`route-stop-${seq}`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }, delay)
    })
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
  const onSearchRoute = async (overrideQuery?: string) => {
    const q = (overrideQuery ?? routeQuery).trim()
    if (!q) return
    if (overrideQuery) setRouteQuery(q.toUpperCase())
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

  /**
   * 「附近」撳車號：自動查路線、自動揀中包含該附近站嘅方向，
   * 再跳去該站並高亮（唔使用戶自己揀方向）。
   */
  const openRouteAtStop = async (
    routeNo: string,
    operator: 'KMB' | 'CTB',
    fromStop: BusStop
  ) => {
    const q = routeNo.trim().toUpperCase()
    if (!q) return
    setBusMode('route')
    setRouteQuery(q)
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
    try {
      const list = await searchRouteVariants(q)
      if (!list.length) {
        setRouteError(
          lang === 'tc'
            ? `找不到路線 ${q}（九巴 / 城巴）`
            : `Route ${q} not found (KMB / CTB)`
        )
        return
      }
      setVariants(list)
      const groups = groupVariantsByDirection(list)
      setDirectionGroups(groups)

      // 逐個方向比對站序：用座標找最接近呢個附近站嘅站點（150m 內）
      const preferred = list.filter((v) => v.operator === operator)
      const pool = preferred.length ? preferred : list
      let best: {
        v: RouteVariant
        partners: RouteVariant[]
        seq: number
        d: number
      } | null = null
      const tried = new Set<string>()
      for (const v of pool) {
        const variantKey = `${v.operator}|${v.bound}|${v.service_type}`
        if (tried.has(variantKey)) continue
        tried.add(variantKey)
        try {
          const stops = await loadRouteStops(v, kmbStopMap)
          for (const s of stops) {
            if (!s.lat || !s.lng) continue
            const d = haversine(fromStop.lat, fromStop.lng, s.lat, s.lng)
            if (d > 150) continue
            if (best && d >= best.d) continue
            const g = groups.find((gr) =>
              gr.partners.some(
                (p) =>
                  p.operator === v.operator &&
                  p.bound === v.bound &&
                  p.service_type === v.service_type
              )
            )
            best = { v, partners: g?.partners ?? [v], seq: s.seq, d }
          }
        } catch {
          /* 試下一個方向 */
        }
      }

      if (best) {
        await pickVariant(best.v, best.partners, best.seq)
        showToast(
          lang === 'tc'
            ? `${q} · 已跳去 ${fromStop.name_tc}`
            : `${q} · jumped to ${fromStop.name_en}`
        )
      } else {
        // 搵唔到吻合方向：至少載入同一間公司嘅方向，唔使由零開始
        const fallback = pool[0]
        const g = groups.find((gr) =>
          gr.partners.some(
            (p) =>
              p.operator === fallback.operator &&
              p.bound === fallback.bound &&
              p.service_type === fallback.service_type
          )
        )
        await pickVariant(fallback, g?.partners ?? [fallback])
        showToast(
          lang === 'tc'
            ? '搵唔到對應方向，請自己揀'
            : 'Could not match direction — pick one'
        )
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

  const pickVariant = async (
    v: RouteVariant,
    partners?: RouteVariant[],
    focusSeq?: number
  ) => {
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

      // 由「附近」撳車號：自動跳去該站並高亮，順便開埋該站嘅實時到站
      if (focusSeq != null) {
        const target = stops.find((s) => s.seq === focusSeq)
        if (target) {
          handleSelectRouteStop(target)
          setShowAllAtStop(true)
          scrollToRouteStop(focusSeq)
        }
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
      if (focusSeq == null) {
        window.setTimeout(() => {
          nearestStopRef.current?.scrollIntoView({
            behavior: 'smooth',
            block: 'nearest',
          })
        }, 350)
      }

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
  /** 由收藏跳去「路線 + 方向 + 站」 */
  const openFavRouteStop = async (rs: FavRouteStop) => {
    const v: RouteVariant = {
      operator: rs.operator as 'KMB' | 'CTB',
      route: rs.route,
      bound: rs.bound,
      service_type: rs.service_type,
      dest_tc: rs.dest_tc,
      dest_en: rs.dest_en,
      orig_tc: rs.orig_tc,
      orig_en: rs.orig_en,
      label_tc: `${rs.route} → ${rs.dest_tc}`,
      label_en: `${rs.route} → ${rs.dest_en}`,
    }
    let partners: RouteVariant[] = [v]
    try {
      if (rs.partnersJson) partners = JSON.parse(rs.partnersJson)
    } catch {
      /* ignore */
    }
    setBusMode('route')
    setRouteQuery(rs.route)
    await pickVariant(v, partners)
    handleSelectRouteStop({
      seq: rs.seq,
      stopId: rs.stopId,
      name_tc: rs.stopName_tc,
      name_en: rs.stopName_en,
      lat: rs.stopLat,
      lng: rs.stopLng,
      operator: rs.operator as 'KMB' | 'CTB',
    })
    setNearestStopId(rs.stopId)
    window.setTimeout(() => {
      nearestStopRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      })
    }, 400)
  }

  /** 由收藏跳去整條巴士路線 */
  const openFavRoute = (r: FavRoute) => {
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
  }

  const modeItems: {
    mode: BusMode
    label: string
    Icon: ComponentType<{ className?: string; filled?: boolean }>
  }[] = [
    { mode: 'nearby', label: lang === 'tc' ? '附近' : 'Near', Icon: IconPin },
    { mode: 'route', label: lang === 'tc' ? '路線' : 'Route', Icon: IconRoute },
    { mode: 'search', label: lang === 'tc' ? '查站' : 'Stop', Icon: IconSearch },
    { mode: 'favorites', label: lang === 'tc' ? '收藏' : 'Fav', Icon: IconStar },
  ]

  const sideCard =
    'border-b border-stone-200/70 px-3 py-3.5 md:mb-3 md:rounded-2xl md:border md:border-stone-200/80 md:bg-white md:p-3.5 md:shadow-card md:last:mb-0'

  const quickRoutes = ['1A', '104', '968', 'E22']

  const mapStopCount = mapStops.length

  return (
    <div className="flex h-full min-h-0 flex-col text-stone-900">
      {/* ─────────── Header ─────────── */}
      <header className="sticky top-0 z-30 flex-shrink-0 border-b border-stone-200/80 bg-white/85 backdrop-blur-xl">
        <div className="mx-auto flex h-14 w-full max-w-[1720px] items-center gap-2 px-3 md:h-[68px] md:px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#e30613] via-[#c11a4a] to-[#1d4ed8] text-[15px] font-black text-white shadow-sm shadow-red-900/20 md:h-10 md:w-10 md:text-base">
              巴
            </div>
            <div className="leading-tight">
              <h1 className="text-[15px] font-bold tracking-tight md:text-[17px]">
                hk-bus-mtr
              </h1>
              <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-stone-500">
                {lang === 'tc' ? '九巴 · 城巴 · 小巴 · 港鐵' : 'KMB · Citybus · GMB · MTR'}
              </p>
            </div>
          </div>

          {/* Desktop segmented tab switch */}
          <div className="ml-6 hidden rounded-2xl bg-stone-100/90 p-1 md:flex">
            {(
              [
                ['bus', lang === 'tc' ? '巴士' : 'Bus', IconBus],
                ['gmb', lang === 'tc' ? '小巴' : 'Minibus', IconMinibus],
                ['mtr', lang === 'tc' ? '港鐵' : 'MTR', IconTrain],
              ] as const
            ).map(([key, label, Icon]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${
                  tab === key
                    ? 'bg-white text-stone-900 shadow-sm'
                    : 'text-stone-500 hover:text-stone-800'
                }`}
              >
                <Icon
                  className={`h-4 w-4 ${
                    tab === key
                      ? key === 'gmb'
                        ? 'text-[#0B7A3B]'
                        : key === 'mtr'
                        ? 'text-mtr'
                        : 'text-[#e30613]'
                      : ''
                  }`}
                />
                {label}
              </button>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-2">
            <LiveClock lang={lang} />
            <button
              onClick={() => setLang(lang === 'tc' ? 'en' : 'tc')}
              className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs font-bold text-stone-700 transition hover:border-stone-300 hover:text-stone-900"
              title={lang === 'tc' ? 'English' : '繁體中文'}
            >
              {lang === 'tc' ? 'EN' : '繁'}
            </button>
            <button
              onClick={() => {
                setBusMode('nearby')
                setTab('bus')
                requestGeo()
              }}
              disabled={geoLoading}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-500 disabled:opacity-50"
            >
              <IconPin className="h-3.5 w-3.5" />
              {geoLoading ? '…' : lang === 'tc' ? '定位' : 'Locate'}
            </button>
          </div>
        </div>

        {/* Mobile tab switch */}
        <div className="flex gap-1 px-3 pb-2 md:hidden">
          {(
            [
              ['bus', lang === 'tc' ? '巴士' : 'Bus', IconBus],
              ['gmb', lang === 'tc' ? '小巴' : 'Minibus', IconMinibus],
              ['mtr', lang === 'tc' ? '港鐵' : 'MTR', IconTrain],
            ] as const
          ).map(([key, label, Icon]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-semibold transition ${
                tab === key
                  ? 'bg-stone-900 text-white shadow-sm'
                  : 'border border-stone-200 bg-white text-stone-600'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>
      </header>

      {/* ─────────── Main ─────────── */}
      <main
        className={`relative mx-auto flex w-full max-w-[1720px] flex-1 min-h-0 flex-col overflow-y-auto md:overflow-hidden ${
          tab === 'bus'
            ? 'md:grid md:grid-cols-[320px_minmax(0,1fr)] md:grid-rows-[300px_minmax(0,1fr)] xl:grid-cols-[330px_minmax(0,1fr)_minmax(360px,31%)] xl:grid-rows-1'
            : ''
        }`}
      >
        {tab === 'mtr' ? (
          <MtrPanel
            lang={lang}
            line={mtrLine}
            station={mtrStation}
            onSelect={(line, station) => {
              setMtrLine(line)
              setMtrStation(station)
            }}
            favMtr={favMtr}
            isMtrFav={isMtrFav}
            toggleMtrFav={toggleMtr}
            removeMtrFav={removeMtr}
            showToast={showToast}
            onOpenFavorites={() => {
              setTab('bus')
              setBusMode('favorites')
            }}
          />
        ) : tab === 'gmb' ? (
          <GmbPanel
            lang={lang}
            favGmb={favGmb}
            isGmbFav={isGmbFav}
            toggleGmb={toggleGmb}
            removeGmb={removeGmb}
            target={gmbTarget}
            onOpenFavorites={() => {
              setTab('bus')
              setBusMode('favorites')
            }}
            showToast={showToast}
          />
        ) : (
          <>
            {/* ── Map rail ── */}
            <div
              className={`map-panel relative order-1 flex-shrink-0 border-b border-stone-200/70 md:order-none md:col-span-2 md:row-start-1 md:h-full md:border-0 md:p-4 md:pb-0 xl:col-span-1 xl:col-start-3 xl:row-start-1 xl:p-4 xl:pl-0 ${
                mapExpanded ? 'h-[42vh]' : 'h-11'
              }`}
            >
              <button
                onClick={() => setMapExpanded((v) => !v)}
                className="absolute right-3 top-2 z-20 rounded-lg border border-stone-200 bg-white/95 px-2.5 py-1 text-xs font-semibold text-stone-700 shadow-sm md:hidden"
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
                className={`relative overflow-hidden bg-stone-200/40 md:h-full md:rounded-2xl md:border md:border-stone-200/80 md:bg-white md:shadow-card ${
                  mapExpanded ? 'h-full' : 'h-0'
                }`}
              >
                <div className="pointer-events-none absolute left-3 top-3 z-10 hidden items-center gap-2 rounded-xl border border-stone-200/70 bg-white/92 px-3 py-1.5 shadow-sm backdrop-blur md:flex">
                  <IconMap className="h-3.5 w-3.5 text-stone-500" />
                  <span className="text-[11px] font-semibold text-stone-800">
                    {lang === 'tc' ? '路線圖' : 'Route map'}
                  </span>
                  <span className="text-[10px] font-medium tabular-nums text-stone-500">
                    {mapStopCount} {lang === 'tc' ? '站' : 'stops'}
                  </span>
                </div>

                <div className="pointer-events-none absolute bottom-3 left-3 z-10 hidden items-center gap-2 rounded-lg border border-stone-200/70 bg-white/92 px-2.5 py-1.5 text-[9px] font-medium text-stone-600 shadow-sm backdrop-blur md:flex">
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-kmb" />
                    KMB
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-ctb" />
                    CTB
                  </span>
                  <span className="h-2.5 w-px bg-stone-300" />
                  <span className="text-stone-400">© OpenStreetMap</span>
                </div>

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

            {/* ── Left rail ── */}
            <aside className="order-2 flex min-h-0 flex-none flex-col md:order-none md:col-start-1 md:row-start-2 md:overflow-y-auto md:border-r md:border-stone-200/70 md:px-4 md:py-4 md:pr-2 xl:row-start-1">
              <nav className="sticky top-0 z-20 grid grid-cols-4 gap-1.5 border-b border-stone-200/70 bg-[#f5f4f2]/95 px-3 py-2.5 backdrop-blur md:static md:mb-3 md:grid-cols-1 md:gap-1 md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
                {modeItems.map(({ mode, label, Icon }) => {
                  const active = busMode === mode
                  return (
                    <button
                      key={mode}
                      onClick={() => {
                        setBusMode(mode)
                        if (mode === 'nearby') requestGeo()
                      }}
                      className={`flex flex-col items-center justify-center gap-1 rounded-xl border py-2 text-[11px] font-semibold transition md:flex-row md:justify-start md:gap-2.5 md:rounded-2xl md:border-0 md:px-3 md:py-2.5 md:text-sm ${
                        active
                          ? 'border-stone-900 bg-stone-900 text-white shadow-sm'
                          : 'border-stone-200 bg-white text-stone-600 md:bg-transparent md:hover:bg-white md:hover:text-stone-900'
                      }`}
                    >
                      <Icon
                        className={`hidden h-4 w-4 md:block ${
                          active ? 'text-white' : 'text-stone-500'
                        }`}
                        {...(mode === 'favorites' ? { filled: active } : {})}
                      />
                      <span>{label}</span>
                    </button>
                  )
                })}
              </nav>

              {/* Route search + directions */}
              {busMode === 'route' && (
                <div className={sideCard}>
                  <p className="label-cap mb-2 flex items-center gap-1.5">
                    <IconRoute className="h-3.5 w-3.5" />
                    {lang === 'tc' ? '路線號碼' : 'Route number'}
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={routeQuery}
                      onChange={(e) => setRouteQuery(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && onSearchRoute()}
                      placeholder={
                        lang === 'tc'
                          ? '例如 1A、104、E22'
                          : 'e.g. 1A, 104, E22'
                      }
                      className="input-base h-11 flex-1 font-semibold uppercase tracking-wide"
                      autoCapitalize="characters"
                    />
                    <button
                      onClick={() => onSearchRoute()}
                      disabled={routeLoading || !routeQuery.trim()}
                      className="btn-primary h-11 w-14"
                    >
                      {routeLoading ? '…' : lang === 'tc' ? '查' : 'Go'}
                    </button>
                  </div>

                  {routeError && (
                    <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-800">
                      {routeError}
                    </p>
                  )}

                  {directionGroups.length > 0 ? (
                    <>
                      <p className="label-cap mb-1.5 mt-3">
                        {lang === 'tc' ? '揀方向' : 'Direction'}
                      </p>
                      <div className="max-h-[44vh] space-y-1.5 overflow-y-auto pr-1 md:max-h-[44vh]">
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
                              className={`flex w-full items-start gap-2.5 rounded-xl border px-2.5 py-2 text-left transition ${
                                active
                                  ? 'border-stone-900 bg-stone-900 text-white shadow-sm'
                                  : 'border-stone-200 bg-white hover:border-stone-300 hover:bg-stone-50'
                              }`}
                            >
                              <span
                                className={`mt-0.5 flex h-5 flex-shrink-0 items-center rounded-md px-1.5 text-[9px] font-bold ${
                                  active
                                    ? 'bg-white/15 text-white'
                                    : g.primary.operator === 'KMB'
                                    ? 'bg-kmb text-white'
                                    : 'bg-ctb text-white'
                                }`}
                              >
                                {g.isJoint ? 'KMB·CTB' : g.primary.operator}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-[13px] font-bold">
                                  {g.route} → {lang === 'tc' ? g.dest_tc : g.dest_en}
                                </span>
                                <span
                                  className={`mt-0.5 block truncate text-[11px] ${
                                    active ? 'text-stone-300' : 'text-stone-500'
                                  }`}
                                >
                                  {lang === 'tc' ? '由 ' : 'From '}
                                  {lang === 'tc' ? g.orig_tc : g.orig_en}
                                </span>
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    </>
                  ) : (
                    !routeLoading &&
                    !routeError && (
                      <div className="mt-3">
                        <p className="label-cap mb-1.5">
                          {lang === 'tc' ? '試吓' : 'Try'}
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {quickRoutes.map((r) => (
                            <button
                              key={r}
                              onClick={() => onSearchRoute(r)}
                              className="rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1 text-xs font-bold text-stone-700 transition hover:border-stone-400 hover:bg-white"
                            >
                              {r}
                            </button>
                          ))}
                        </div>
                      </div>
                    )
                  )}
                </div>
              )}

              {/* Stop search */}
              {busMode === 'search' && (
                <div className={sideCard}>
                  <p className="label-cap mb-2 flex items-center gap-1.5">
                    <IconSearch className="h-3.5 w-3.5" />
                    {lang === 'tc' ? '車站名稱' : 'Stop name'}
                  </p>
                  <input
                    type="search"
                    value={stopNameQuery}
                    onChange={(e) => setStopNameQuery(e.target.value)}
                    placeholder={
                      lang === 'tc'
                        ? '例如 旺角、彌敦道…'
                        : 'e.g. Mong Kok…'
                    }
                    className="input-base h-11"
                  />
                  {stopsLoading && (
                    <p className="mt-2 text-xs text-stone-500">
                      {lang === 'tc' ? '載入站名資料中…' : 'Loading stop names…'}
                    </p>
                  )}
                  <div className="mt-2 max-h-[46vh] space-y-1 overflow-y-auto pr-1 md:max-h-[46vh]">
                    {stopNameQuery.trim() &&
                      stopNameResults.length === 0 &&
                      !stopsLoading && (
                        <p className="py-2 text-xs text-stone-500">
                          {lang === 'tc' ? '找不到相關車站' : 'No matching stops'}
                        </p>
                      )}
                    {stopNameResults.map((s) => (
                      <div
                        key={s.id}
                        className={`flex items-center gap-1 rounded-lg border transition ${
                          selectedStop?.id === s.id
                            ? 'border-emerald-300 bg-emerald-50'
                            : 'border-transparent hover:border-stone-200 hover:bg-stone-50'
                        }`}
                      >
                        <button
                          onClick={() => handleSelectStop(s)}
                          className="min-w-0 flex-1 px-2.5 py-2 text-left text-[13px] font-medium"
                        >
                          <span className="truncate">
                            {lang === 'tc' ? s.name_tc : s.name_en}
                          </span>
                        </button>
                        <button
                          type="button"
                          className={`px-2 py-1.5 ${
                            isStopFav(s.operator, s.id)
                              ? 'text-amber-500'
                              : 'text-stone-300 hover:text-stone-500'
                          }`}
                          title={
                            lang === 'tc' ? '收藏此站' : 'Favourite this stop'
                          }
                          onClick={() => {
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
                          <IconStar
                            className="h-4 w-4"
                            filled={isStopFav(s.operator, s.id)}
                          />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Favourites */}
              {busMode === 'favorites' && (
                <div className={`${sideCard} space-y-4`}>
                  <div>
                    <p className="label-cap mb-1.5">
                      {lang === 'tc' ? '收藏路線站' : 'Favourite route stops'}
                    </p>
                    {favRouteStops.length === 0 ? (
                      <p className="text-xs leading-relaxed text-stone-500">
                        {lang === 'tc'
                          ? '喺路線站旁撳 ☆ 可收藏「路線+方向+站」'
                          : 'Tap ☆ on a route stop to save route+direction+stop'}
                      </p>
                    ) : (
                      <div className="space-y-1">
                        {favRouteStops.map((rs) => (
                          <div
                            key={`${rs.operator}-${rs.route}-${rs.bound}-${rs.stopId}`}
                            className="flex items-center gap-1 rounded-lg border border-transparent hover:border-stone-200 hover:bg-stone-50"
                          >
                            <button
                              type="button"
                              onClick={() => openFavRouteStop(rs)}
                              className="min-w-0 flex-1 px-2.5 py-2 text-left"
                            >
                              <span className="block truncate text-[13px] font-bold">
                                <span
                                  className={`mr-1 inline-block rounded px-1 py-0.5 align-[1px] text-[8px] font-bold text-white ${
                                    rs.operator === 'KMB' ? 'bg-kmb' : 'bg-ctb'
                                  }`}
                                >
                                  {rs.operator === 'KMB'
                                    ? lang === 'tc'
                                      ? '九巴'
                                      : 'KMB'
                                    : lang === 'tc'
                                    ? '城巴'
                                    : 'CTB'}
                                </span>
                                {rs.route}{' '}
                                <span className="font-medium text-stone-500">
                                  → {lang === 'tc' ? rs.dest_tc : rs.dest_en}
                                </span>
                              </span>
                              <span className="mt-0.5 block truncate text-[11px] text-stone-600">
                                {lang === 'tc' ? rs.stopName_tc : rs.stopName_en}
                              </span>
                            </button>
                            <button
                              type="button"
                              className="px-2 py-1.5 text-stone-300 hover:text-stone-600"
                              title={lang === 'tc' ? '移除' : 'Remove'}
                              onClick={() =>
                                removeRouteStop({
                                  operator: rs.operator,
                                  route: rs.route,
                                  bound: rs.bound,
                                  service_type: rs.service_type,
                                  stopId: rs.stopId,
                                })
                              }
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <p className="label-cap mb-1.5">
                      {lang === 'tc' ? '收藏車站' : 'Favourite stops'}
                    </p>
                    {favStops.length === 0 ? (
                      <p className="text-xs leading-relaxed text-stone-500">
                        {lang === 'tc'
                          ? '未有收藏。喺站名／附近／路線選站後撳 ★'
                          : 'None yet. Tap ★ on a stop to save.'}
                      </p>
                    ) : (
                      <div className="space-y-1">
                        {favStops.map((s) => (
                          <div
                            key={`${s.operator}-${s.id}`}
                            className={`flex items-center gap-1 rounded-lg border ${
                              selectedStop?.id === s.id
                                ? 'border-emerald-300 bg-emerald-50'
                                : 'border-transparent hover:border-stone-200 hover:bg-stone-50'
                            }`}
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
                              className="flex min-w-0 flex-1 items-center gap-1.5 truncate px-2.5 py-2 text-left text-[13px] font-medium"
                            >
                              <span
                                className={`flex-shrink-0 rounded px-1 py-0.5 text-[8px] font-bold text-white ${
                                  s.operator === 'KMB' ? 'bg-kmb' : 'bg-ctb'
                                }`}
                              >
                                {s.operator === 'KMB'
                                  ? lang === 'tc'
                                    ? '九巴'
                                    : 'KMB'
                                  : lang === 'tc'
                                  ? '城巴'
                                  : 'CTB'}
                              </span>
                              <span className="truncate">
                                {lang === 'tc' ? s.name_tc : s.name_en}
                              </span>
                            </button>
                            <button
                              type="button"
                              className="px-2 py-1.5 text-stone-300 hover:text-stone-600"
                              title={lang === 'tc' ? '移除' : 'Remove'}
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
                    <p className="label-cap mb-1.5">
                      {lang === 'tc' ? '收藏路線' : 'Favourite routes'}
                    </p>
                    {favRoutes.length === 0 ? (
                      <p className="text-xs leading-relaxed text-stone-500">
                        {lang === 'tc'
                          ? '未有收藏。選路線方向後撳 ★'
                          : 'None yet. Tap ★ on a route variant.'}
                      </p>
                    ) : (
                      <div className="space-y-1">
                        {favRoutes.map((r) => (
                          <div
                            key={`${r.operator}-${r.route}-${r.bound}-${r.service_type}`}
                            className="flex items-center gap-1 rounded-lg border border-transparent hover:border-stone-200 hover:bg-stone-50"
                          >
                            <button
                              onClick={() => openFavRoute(r)}
                              className="flex min-w-0 flex-1 items-center gap-1.5 px-2.5 py-2 text-left text-[12px] font-semibold"
                            >
                              <span
                                className={`inline-block rounded px-1.5 py-0.5 text-[9px] font-bold text-white ${
                                  r.operator === 'KMB' ? 'bg-kmb' : 'bg-ctb'
                                }`}
                              >
                                {r.operator}
                              </span>
                              <span className="truncate">
                                {lang === 'tc' ? r.label_tc : r.label_en}
                              </span>
                            </button>
                            <button
                              type="button"
                              className="px-2 py-1.5 text-stone-300 hover:text-stone-600"
                              title={lang === 'tc' ? '移除' : 'Remove'}
                              onClick={() => removeRoute(r)}
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <p className="label-cap mb-1.5">
                      {lang === 'tc' ? '收藏小巴站' : 'Saved minibus stops'}
                    </p>
                    {favGmb.length === 0 ? (
                      <p className="text-xs leading-relaxed text-stone-500">
                        {lang === 'tc'
                          ? '喺「小巴」分頁揀好路線方向，撳站旁 ☆ 收藏。'
                          : 'In the Minibus tab, pick a direction and tap ☆ next to a stop.'}
                      </p>
                    ) : (
                      <div className="space-y-1">
                        {favGmb.map((f) => {
                          const meta = regionMeta(f.region)
                          return (
                            <div
                              key={`${f.routeId}-${f.routeSeq}-${f.stopId}`}
                              className="flex items-center gap-1 rounded-lg border border-transparent hover:border-stone-200 hover:bg-stone-50"
                            >
                              <button
                                type="button"
                                onClick={() => {
                                  setTab('gmb')
                                  setGmbTarget({
                                    region: f.region as GmbRegion,
                                    code: f.routeCode,
                                    routeId: f.routeId,
                                    routeSeq: f.routeSeq,
                                    stopSeq: f.stopSeq,
                                    nonce: Date.now(),
                                  })
                                }}
                                className="flex min-w-0 flex-1 items-center gap-1.5 px-2.5 py-2 text-left"
                              >
                                <span
                                  className="flex-shrink-0 rounded px-1 py-0.5 text-[8px] font-bold text-white"
                                  style={{ backgroundColor: meta.color }}
                                >
                                  {regionLabel(f.region, lang)}
                                </span>
                                <span className="flex-shrink-0 rounded bg-[#0B7A3B] px-1 py-0.5 text-[8px] font-bold text-white">
                                  {lang === 'tc' ? '小巴' : 'GMB'}
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-[13px] font-bold">
                                    {f.routeCode}{' '}
                                    <span className="font-medium text-stone-500">
                                      · {lang === 'tc' ? f.stopName_tc : f.stopName_en}
                                    </span>
                                  </span>
                                  <span className="mt-0.5 block truncate text-[11px] text-stone-500">
                                    → {lang === 'tc' ? f.dest_tc : f.dest_en}
                                  </span>
                                </span>
                              </button>
                              <button
                                type="button"
                                className="px-2 py-1.5 text-stone-300 hover:text-stone-600"
                                title={lang === 'tc' ? '移除' : 'Remove'}
                                onClick={() =>
                                  removeGmb({
                                    routeId: f.routeId,
                                    routeSeq: f.routeSeq,
                                    stopId: f.stopId,
                                  })
                                }
                              >
                                ✕
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  <div>
                    <p className="label-cap mb-1.5">
                      {lang === 'tc' ? '收藏港鐵站' : 'Saved MTR stations'}
                    </p>
                    {favMtr.length === 0 ? (
                      <p className="text-xs leading-relaxed text-stone-500">
                        {lang === 'tc'
                          ? '喺「港鐵」分頁揀好線同站，撳 ☆ 收藏，一撳睇返上／下行班次。'
                          : 'In the MTR tab, pick a line and station and tap ☆ to save it.'}
                      </p>
                    ) : (
                      <div className="space-y-1">
                        {favMtr.map((f) => (
                          <div
                            key={`${f.line}-${f.station}`}
                            className="flex items-center gap-1 rounded-lg border border-transparent hover:border-stone-200 hover:bg-stone-50"
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setMtrLine(f.line)
                                setMtrStation(f.station)
                                setTab('mtr')
                              }}
                              className="flex min-w-0 flex-1 items-center gap-1.5 px-2.5 py-2 text-left"
                            >
                              <span
                                className="flex-shrink-0 rounded px-1 py-0.5 text-[8px] font-bold text-white"
                                style={{ backgroundColor: f.color }}
                              >
                                {lang === 'tc' ? '港鐵' : 'MTR'}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-[13px] font-bold">
                                  {lang === 'tc' ? f.line_tc : f.line_en}{' '}
                                  <span className="font-medium text-stone-500">
                                    · {lang === 'tc' ? f.station_tc : f.station_en}
                                  </span>
                                </span>
                                <span className="mt-0.5 block text-[11px] text-stone-500">
                                  {lang === 'tc' ? '一撳睇上／下行實時班次' : 'Tap for live up/down trains'}
                                </span>
                              </span>
                            </button>
                            <button
                              type="button"
                              className="px-2 py-1.5 text-stone-300 hover:text-stone-600"
                              title={lang === 'tc' ? '移除' : 'Remove'}
                              onClick={() => removeMtr({ line: f.line, station: f.station })}
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
                      <p className="label-cap mb-1.5">
                        {lang === 'tc' ? '已設定提醒' : 'Active reminders'}
                      </p>
                      {reminders.map((r) => (
                        <div
                          key={r.id}
                          className="flex items-center gap-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900"
                        >
                          <span className="flex-1 truncate">
                            🔔 {r.route} · {r.stopName}
                          </span>
                          <button
                            type="button"
                            className="text-amber-700 hover:text-amber-900"
                            onClick={() => cancelReminder(r.id)}
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Nearby filter */}
              {busMode === 'nearby' && (
                <div className={sideCard}>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="label-cap flex items-center gap-1.5">
                      <IconWalk className="h-3.5 w-3.5" />
                      {lang === 'tc' ? '附近車站' : 'Nearby stops'}
                    </p>
                    <button
                      type="button"
                      onClick={() => setNearbyReloadKey((k) => k + 1)}
                      className="inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-white px-2 py-1 text-[10px] font-semibold text-stone-600 transition hover:text-stone-900"
                      title={lang === 'tc' ? '重新載入附近到站' : 'Reload nearby arrivals'}
                    >
                      <IconRefresh className="h-3 w-3" />
                      {lang === 'tc' ? '更新' : 'Refresh'}
                    </button>
                  </div>
                  <input
                    type="search"
                    value={nearbyFilter}
                    onChange={(e) => setNearbyFilter(e.target.value)}
                    placeholder={
                      lang === 'tc' ? '篩選附近站名…' : 'Filter nearby stops…'
                    }
                    className="input-base h-11"
                  />
                  {geoError && (
                    <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs leading-relaxed text-amber-800">
                      {lang === 'tc'
                        ? '無法取得定位，請允許位置權限，或改用「路線」搜尋'
                        : 'Location unavailable. Allow permission, or search a route.'}
                    </p>
                  )}
                  {!lat && !geoLoading && (
                    <button
                      onClick={requestGeo}
                      className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 py-2.5 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-100"
                    >
                      <IconPin className="h-3.5 w-3.5" />
                      {lang === 'tc'
                        ? '取得附近巴士站'
                        : 'Get nearby bus stops'}
                    </button>
                  )}
                  <p className="mt-2 text-[11px] leading-relaxed text-stone-500">
                    {lang === 'tc'
                      ? '撳右邊任何一個站，睇齊該站所有路線實時到站。'
                      : 'Pick a stop on the right to see every route’s live arrivals.'}
                  </p>
                </div>
              )}
            </aside>

            {/* ── Board ── */}
            <section className="order-3 flex min-h-0 flex-none flex-col md:order-none md:col-start-2 md:row-start-2 md:px-2 md:py-4 xl:col-start-2 xl:row-start-1 xl:pl-2 xl:pr-0">
              <div className="flex min-h-0 flex-col md:flex-1 md:overflow-hidden md:rounded-2xl md:border md:border-stone-200/80 md:bg-white md:shadow-card">
                {/* Board header (desktop) */}
                <div className="hidden items-center justify-between gap-3 border-b border-stone-200/70 px-4 py-3 md:flex">
                  <div className="min-w-0">
                    <p className="label-cap">
                      {busMode === 'route'
                        ? lang === 'tc'
                          ? '路線'
                          : 'Route'
                        : busMode === 'nearby'
                        ? lang === 'tc'
                          ? '附近'
                          : 'Nearby'
                        : busMode === 'search'
                        ? lang === 'tc'
                          ? '查站'
                          : 'Stop search'
                        : lang === 'tc'
                        ? '收藏'
                        : 'Favourites'}
                    </p>
                    <h2 className="truncate text-[17px] font-bold tracking-tight">
                      {busMode === 'route'
                        ? selectedVariant
                          ? `${selectedVariant.route} · ${
                              lang === 'tc'
                                ? selectedVariant.dest_tc
                                : selectedVariant.dest_en
                            }`
                          : directionGroups.length > 0
                          ? lang === 'tc'
                            ? '揀一個方向'
                            : 'Pick a direction'
                          : lang === 'tc'
                          ? '搵路線'
                          : 'Find a route'
                        : busMode === 'nearby'
                        ? lang === 'tc'
                          ? `附近 ${filteredNearby.length} 個站`
                          : `${filteredNearby.length} stops nearby`
                        : busMode === 'search'
                        ? lang === 'tc'
                          ? '搜尋車站'
                          : 'Find a stop'
                        : lang === 'tc'
                        ? '我的收藏'
                        : 'My favourites'}
                    </h2>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-1.5">
                    {busMode === 'route' && selectedVariant && (
                      <span
                        className={`rounded-md px-2 py-1 text-[10px] font-bold text-white ${
                          selectedVariant.operator === 'KMB'
                            ? 'bg-kmb'
                            : 'bg-ctb'
                        }`}
                      >
                        {selectedVariant.operator}
                      </span>
                    )}
                    {busMode === 'route' && routeFare != null && (
                      <span className="rounded-lg border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-bold text-amber-900">
                        {formatFare(routeFare, lang)}
                      </span>
                    )}
                    {busMode === 'route' && routeStops.length > 0 && (
                      <span className="hidden rounded-lg border border-stone-200 bg-stone-50 px-2 py-1 text-[11px] font-semibold tabular-nums text-stone-600 lg:inline">
                        {routeStops.length} {lang === 'tc' ? '站' : 'stops'}
                      </span>
                    )}
                    {busMode === 'nearby' && nearbyEtaLoading && (
                      <span className="text-[11px] font-medium text-stone-500">
                        {lang === 'tc' ? '更新中…' : 'Updating…'}
                      </span>
                    )}
                  </div>
                </div>

                <div className="min-h-0 flex-1 md:overflow-y-auto">
                  {/* Nearby cards */}
                  {busMode === 'nearby' && (
                    <div className="space-y-2.5 p-3 md:grid md:grid-cols-1 md:gap-2.5 md:p-4 xl:grid-cols-2">
                      {stopsLoading && (
                        <div className="col-span-full p-6 text-center text-sm text-stone-500">
                          {lang === 'tc'
                            ? '載入站點資料中…'
                            : 'Loading stops…'}
                        </div>
                      )}
                      {!stopsLoading && filteredNearby.length === 0 && (
                        <div className="col-span-full rounded-2xl border border-dashed border-stone-300 bg-stone-50/60 px-5 py-10 text-center">
                          <p className="text-sm font-semibold text-stone-700">
                            {lang === 'tc'
                              ? '未取得附近車站'
                              : 'No nearby stops yet'}
                          </p>
                          <p className="mt-1 text-xs leading-relaxed text-stone-500">
                            {lang === 'tc'
                              ? '按左邊「取得附近巴士站」，或者用「路線」直接查。'
                              : 'Use “Get nearby bus stops”, or search a route.'}
                          </p>
                          <button
                            onClick={requestGeo}
                            className="mt-3 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500"
                          >
                            {geoLoading
                              ? '…'
                              : lang === 'tc'
                              ? '取得定位'
                              : 'Locate me'}
                          </button>
                        </div>
                      )}
                      {filteredNearby.slice(0, 12).map((s) => {
                        const etas = nearbyEtas[s.id] || []
                        const groups: {
                          key: string
                          operator: string
                          route: string
                          dest_tc: string
                          dest_en: string
                          times: typeof etas
                        }[] = []
                        const seen = new Map<string, number>()
                        for (const e of sortEtasByTime(etas)) {
                          const key = `${e.operator}-${e.route}`
                          if (!seen.has(key)) {
                            seen.set(key, groups.length)
                            groups.push({
                              key,
                              operator: e.operator,
                              route: e.route,
                              dest_tc: e.dest_tc,
                              dest_en: e.dest_en,
                              times: [e],
                            })
                          } else {
                            const g = groups[seen.get(key)!]
                            if (g.times.length < 3) g.times.push(e)
                          }
                        }
                        groups.sort((a, b) => {
                          const ta = a.times[0]?.eta
                            ? new Date(a.times[0].eta!).getTime()
                            : Infinity
                          const tb = b.times[0]?.eta
                            ? new Date(b.times[0].eta!).getTime()
                            : Infinity
                          return ta - tb
                        })
                        const etaStatus = nearbyEtaStatus[s.id]
                        const busy =
                          etaStatus === 'loading' || etaStatus === 'retry'
                        const failed = etaStatus === 'error'
                        return (
                          <div
                            key={s.id}
                            data-stop-id={s.id}
                            className={`group flex flex-col rounded-2xl border bg-white p-3.5 text-left transition ${
                              selectedStop?.id === s.id
                                ? 'border-emerald-400 shadow-[0_0_0_3px_rgba(16,185,129,0.12)]'
                                : 'border-stone-200 hover:border-stone-300 hover:shadow-sm'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => handleSelectStop(s)}
                              className="flex items-start justify-between gap-2"
                            >
                              <span className="min-w-0">
                                <span className="block truncate text-[15px] font-bold leading-snug">
                                  {lang === 'tc' ? s.name_tc : s.name_en}
                                </span>
                                <span className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] font-medium text-emerald-700">
                                  <IconWalk className="h-3 w-3" />
                                  {Math.round(s.distance)} m
                                  {busy && (
                                    <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-stone-100 px-1.5 py-0.5 text-[9px] font-bold text-stone-600">
                                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-stone-400" />
                                      {etaStatus === 'retry'
                                        ? lang === 'tc'
                                          ? '重試中'
                                          : 'Retrying'
                                        : lang === 'tc'
                                        ? '更新中'
                                        : 'Loading'}
                                    </span>
                                  )}
                                  {failed && (
                                    <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-800">
                                      ↻ {lang === 'tc' ? '自動重試中' : 'Retrying'}
                                    </span>
                                  )}
                                </span>
                              </span>
                              <IconChevron className="mt-1 h-4 w-4 flex-shrink-0 text-stone-300 transition group-hover:translate-x-0.5 group-hover:text-stone-500" />
                            </button>

                            <div className="mt-2.5 space-y-1.5">
                              {groups.length === 0 ? (
                                <p className="flex items-center gap-1.5 text-xs text-stone-500">
                                  {busy ? (
                                    <>
                                      <span className="h-2 w-2 animate-pulse rounded-full bg-stone-300" />
                                      {etaStatus === 'retry'
                                        ? lang === 'tc'
                                          ? '連線唔穩，重試中…'
                                          : 'Connection issue — retrying…'
                                        : lang === 'tc'
                                        ? '載入到站時間…'
                                        : 'Loading arrivals…'}
                                    </>
                                  ) : failed ? (
                                    <>
                                      <span className="animate-spin text-[11px] text-amber-600">
                                        ↻
                                      </span>
                                      {lang === 'tc'
                                        ? '暫時攞唔到，會自動再試'
                                        : 'Couldn’t load — retrying automatically'}
                                    </>
                                  ) : (
                                    <>{lang === 'tc' ? '暫無到站' : 'No ETA'}</>
                                  )}
                                </p>
                              ) : (
                                groups.slice(0, 6).map((g) => (
                                  <div
                                    key={g.key}
                                    className="flex items-center gap-2"
                                  >
                                    <button
                                      type="button"
                                      title={
                                        lang === 'tc'
                                          ? `查 ${g.route}，自動跳去 ${s.name_tc} 呢站`
                                          : `Open ${g.route}, jump to this stop`
                                      }
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        openRouteAtStop(
                                          g.route,
                                          g.operator === 'CTB' ? 'CTB' : 'KMB',
                                          s
                                        )
                                      }}
                                      className={`w-11 flex-shrink-0 rounded-md py-0.5 text-center text-[10px] font-bold text-white ${
                                        g.operator === 'KMB'
                                          ? 'bg-kmb'
                                          : 'bg-ctb'
                                      }`}
                                    >
                                      {g.route}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        openRouteAtStop(
                                          g.route,
                                          g.operator === 'CTB' ? 'CTB' : 'KMB',
                                          s
                                        )
                                      }}
                                      className="min-w-0 flex-1 truncate text-left text-[11px] font-medium text-stone-600 hover:text-stone-900"
                                    >
                                      → {lang === 'tc' ? g.dest_tc : g.dest_en}
                                    </button>
                                    <span className="flex flex-shrink-0 items-center gap-1">
                                      {g.times.some((t) => t.eta) ? (
                                        [0, 1, 2].map((i) => {
                                        const e = g.times[i]
                                        return (
                                          <span
                                            key={i}
                                            className={`min-w-[2.9rem] rounded-md px-1 py-0.5 text-center text-[11px] font-bold tabular-nums ${
                                              !e
                                                ? 'text-stone-200'
                                                : i === 0
                                                ? 'bg-emerald-100 text-emerald-900'
                                                : 'bg-stone-100 text-stone-700'
                                            }`}
                                          >
                                            {e ? formatEta(e.eta, lang) : '–'}
                                          </span>
                                        )
                                        })
                                      ) : (
                                        <span className="min-w-[5.5rem] text-right text-[10px] font-medium text-stone-400">
                                          {lang === 'tc' ? '暫無班次' : 'No service'}
                                        </span>
                                      )}
                                    </span>
                                  </div>
                                ))
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* Route stop board */}
                  {busMode === 'route' &&
                    (stopsLoadingRoute || routeStops.length > 0) && (
                      <div>
                        {stopsLoadingRoute ? (
                          <div className="p-4 text-sm text-stone-500 md:p-5">
                            {lang === 'tc' ? '載入車站列表…' : 'Loading stops…'}
                          </div>
                        ) : (
                          <>
                            <div className="flex flex-wrap items-center gap-2 border-b border-stone-200/70 px-3 py-2.5 md:px-4">
                              <p className="label-cap">
                                {lang === 'tc'
                                  ? '各站到站'
                                  : 'Live arrivals'}
                              </p>
                              {nearestStopId && lat != null && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900">
                                  📍 {lang === 'tc' ? '已跳至最近站' : 'Nearest stop'}
                                </span>
                              )}
                              {sectionFares && sectionFares.length > 0 && (
                                <span className="ml-auto hidden text-[10px] text-stone-500 lg:inline">
                                  {lang === 'tc'
                                    ? '站旁 $ = 由此上車分段收費'
                                    : '$ = stage fare from this stop'}
                                </span>
                              )}
                            </div>
                            <div>
                              {routeStops.map((s, idx) => {
                                const times = sortEtasByTime(
                                  routeEtaBySeq[s.seq] || []
                                )
                                const isNearest = nearestStopId === s.stopId
                                const boardFare =
                                  sectionFares && sectionFares[idx] != null
                                    ? sectionFares[idx]
                                    : null
                                return (
                                  <div
                                    key={`${s.operator}-${s.stopId}-${s.seq}`}
                                    id={`route-stop-${s.seq}`}
                                    className={`fade-up grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1.5 border-b border-stone-100 px-3 py-2.5 transition last:border-0 md:px-4 lg:grid-cols-[2.25rem_minmax(0,1fr)_3.75rem_13rem_4.5rem] lg:gap-x-3 ${
                                      selectedStop?.id === s.stopId
                                        ? 'bg-emerald-50/70 shadow-[inset_3px_0_0_0_#10b981]'
                                        : isNearest
                                        ? 'bg-amber-50/80'
                                        : 'hover:bg-stone-50'
                                    }`}
                                  >
                                    <span
                                      className={`col-start-1 row-start-1 flex h-6 w-6 items-center justify-center justify-self-center rounded-md text-[11px] font-bold tabular-nums ${
                                        isNearest
                                          ? 'bg-amber-500 text-white'
                                          : 'bg-stone-100 text-stone-600'
                                      }`}
                                    >
                                      {s.seq}
                                    </span>

                                    <button
                                      ref={isNearest ? nearestStopRef : undefined}
                                      type="button"
                                      onClick={() => handleSelectRouteStop(s)}
                                      className="col-start-2 row-start-1 min-w-0 self-stretch text-left"
                                    >
                                      <span className="block truncate text-[13px] font-semibold md:text-sm">
                                        {lang === 'tc' ? s.name_tc : s.name_en}
                                      </span>
                                      {isNearest && (
                                        <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-amber-200/70 px-1.5 py-0.5 text-[9px] font-bold text-amber-900">
                                          📍 {lang === 'tc' ? '最近' : 'Nearest'}
                                        </span>
                                      )}
                                    </button>

                                    {boardFare != null ? (
                                      <span className="hidden self-center justify-self-end rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[11px] font-bold text-amber-900 lg:inline">
                                        ${boardFare.toFixed(1)}
                                      </span>
                                    ) : (
                                      <span className="hidden lg:block" />
                                    )}

                                    <div className="col-span-2 col-start-2 row-start-2 flex flex-wrap items-center gap-1.5 lg:col-span-1 lg:col-start-4 lg:row-start-1 lg:flex-nowrap">
                                      {times.length === 0 ? (
                                        <span className="text-[11px] text-stone-400">
                                          {Object.keys(routeEtaBySeq).length === 0
                                            ? lang === 'tc'
                                              ? '載入中…'
                                              : 'Loading…'
                                            : lang === 'tc'
                                            ? '暫無到站'
                                            : 'No ETA'}
                                        </span>
                                      ) : (
                                        times.map((tm, i) => (
                                          <span
                                            key={i}
                                            className={`inline-flex min-w-[4rem] flex-col items-center justify-center rounded-lg px-1.5 py-1 leading-tight ${
                                              i === 0
                                                ? 'bg-emerald-100 text-emerald-900'
                                                : 'bg-stone-100 text-stone-700'
                                            }`}
                                          >
                                            <span className="text-[13px] font-bold tabular-nums">
                                              {formatEta(tm.eta, lang)}
                                            </span>
                                            <span
                                              className={`mt-0.5 text-[9px] font-semibold ${
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

                                    <div className="col-start-3 row-start-1 flex items-center justify-end gap-0.5 lg:col-start-5">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          handleSelectRouteStop(s)
                                          setShowAllAtStop(true)
                                        }}
                                        className="rounded-md px-1.5 py-1 text-[10px] font-semibold text-stone-500 transition hover:bg-stone-200 hover:text-stone-800"
                                        title={
                                          lang === 'tc'
                                            ? '睇同站其他路線'
                                            : 'All routes at this stop'
                                        }
                                      >
                                        {lang === 'tc' ? '其他車' : 'Other'}
                                      </button>
                                      {selectedVariant && (
                                        <button
                                          type="button"
                                          className={`rounded-md px-1 py-1 transition ${
                                            isRouteStopFav({
                                              operator: selectedVariant.operator,
                                              route: selectedVariant.route,
                                              bound: selectedVariant.bound,
                                              service_type:
                                                selectedVariant.service_type,
                                              stopId: s.stopId,
                                            })
                                              ? 'text-amber-500'
                                              : 'text-stone-300 hover:text-stone-500'
                                          }`}
                                          title={
                                            lang === 'tc'
                                              ? '收藏此線此站'
                                              : 'Favourite this route stop'
                                          }
                                          onClick={() => {
                                            const v = selectedVariant
                                            toggleRouteStop({
                                              operator: v.operator,
                                              route: v.route,
                                              bound: v.bound,
                                              service_type: v.service_type,
                                              dest_tc: v.dest_tc,
                                              dest_en: v.dest_en,
                                              orig_tc: v.orig_tc,
                                              orig_en: v.orig_en,
                                              stopId: s.stopId,
                                              stopName_tc: s.name_tc,
                                              stopName_en: s.name_en,
                                              stopLat: s.lat,
                                              stopLng: s.lng,
                                              seq: s.seq,
                                              partnersJson: JSON.stringify(
                                                activePartners
                                              ),
                                              savedAt: Date.now(),
                                            })
                                            showToast(
                                              isRouteStopFav({
                                                operator: v.operator,
                                                route: v.route,
                                                bound: v.bound,
                                                service_type: v.service_type,
                                                stopId: s.stopId,
                                              })
                                                ? lang === 'tc'
                                                  ? '已取消收藏'
                                                  : 'Removed'
                                                : lang === 'tc'
                                                ? '已收藏此線此站'
                                                : 'Saved route stop'
                                            )
                                          }}
                                        >
                                          <IconStar
                                            className="h-4 w-4"
                                            filled={isRouteStopFav({
                                              operator: selectedVariant.operator,
                                              route: selectedVariant.route,
                                              bound: selectedVariant.bound,
                                              service_type:
                                                selectedVariant.service_type,
                                              stopId: s.stopId,
                                            })}
                                          />
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </>
                        )}
                      </div>
                    )}

                  {/* Selected stop board */}
                  {selectedStop && (busMode !== 'route' || showAllAtStop) && (
                    <div className="border-t border-stone-200/70 md:border-t">
                      <div className="flex items-center justify-between gap-3 bg-stone-50/70 px-4 py-3">
                        <div className="min-w-0">
                          <p className="label-cap">
                            {selectedStop.operator === 'KMB'
                              ? lang === 'tc'
                                ? '此站所有九巴路線'
                                : 'All KMB routes here'
                              : lang === 'tc'
                              ? `城巴 ${ctbFocusRoute || ''}`
                              : `CTB ${ctbFocusRoute || ''}`}
                          </p>
                          <h3 className="truncate text-base font-bold tracking-tight">
                            {lang === 'tc'
                              ? selectedStop.name_tc
                              : selectedStop.name_en}
                          </h3>
                        </div>
                        <div className="flex flex-shrink-0 items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              toggleStop(selectedStop)
                              showToast(
                                isStopFav(
                                  selectedStop.operator,
                                  selectedStop.id
                                )
                                  ? lang === 'tc'
                                    ? '已取消收藏'
                                    : 'Removed favourite'
                                  : lang === 'tc'
                                  ? '已加入收藏'
                                  : 'Saved to favourites'
                              )
                            }}
                            className={`rounded-lg border border-stone-200 bg-white p-2 transition ${
                              isStopFav(selectedStop.operator, selectedStop.id)
                                ? 'text-amber-500'
                                : 'text-stone-400 hover:text-stone-700'
                            }`}
                            title={lang === 'tc' ? '收藏車站' : 'Favourite stop'}
                          >
                            <IconStar
                              className="h-4 w-4"
                              filled={isStopFav(
                                selectedStop.operator,
                                selectedStop.id
                              )}
                            />
                          </button>
                          <button
                            onClick={() =>
                              loadEta(
                                selectedStop,
                                selectedStop.operator === 'CTB'
                                  ? ctbFocusRoute
                                  : null
                              )
                            }
                            className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-2.5 py-2 text-[11px] font-semibold text-stone-600 transition hover:text-stone-900"
                          >
                            <IconRefresh className="h-3.5 w-3.5" />
                            {lang === 'tc' ? '更新' : 'Refresh'}
                          </button>
                        </div>
                      </div>
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
                    </div>
                  )}

                  {/* Empty states */}
                  {busMode === 'route' &&
                    !showAllAtStop &&
                    !stopsLoadingRoute &&
                    routeStops.length === 0 && (
                      <div className="flex flex-col items-center justify-center px-6 py-12 text-center md:py-16">
                        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-stone-100 text-stone-400">
                          <IconRoute className="h-7 w-7" />
                        </div>
                        <h3 className="text-base font-bold tracking-tight">
                          {directionGroups.length > 0
                            ? lang === 'tc'
                              ? '揀方向，睇全線到站'
                              : 'Pick a direction'
                            : lang === 'tc'
                            ? '查路線，即刻睇到站'
                            : 'Search a route for live arrivals'}
                        </h3>
                        <p className="mt-1 max-w-sm text-sm leading-relaxed text-stone-500">
                          {directionGroups.length > 0
                            ? lang === 'tc'
                              ? '左邊已經搵到路線方向，撳一個就會列出全線各站同實時到站時間。'
                              : 'Directions are listed on the left — pick one to load every stop with live ETAs.'
                            : lang === 'tc'
                            ? '輸入路線號碼，揀方向，即刻列出全線各站同實時到站時間。'
                            : 'Enter a route number and pick a direction to see every stop with live ETAs.'}
                        </p>
                        {directionGroups.length === 0 && (
                          <div className="mt-5 flex flex-wrap justify-center gap-2">
                            {quickRoutes.map((r) => (
                              <button
                                key={r}
                                onClick={() => onSearchRoute(r)}
                                className="rounded-full border border-stone-200 bg-white px-3.5 py-1.5 text-xs font-bold text-stone-700 shadow-sm transition hover:border-stone-400 hover:text-stone-900"
                              >
                                {r}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                  {busMode === 'route' &&
                    !showAllAtStop &&
                    !stopsLoadingRoute &&
                    routeStops.length > 0 && (
                      <p className="px-4 py-3 text-center text-xs text-stone-500">
                        {lang === 'tc'
                          ? '撳站名可睇同站所有路線；撳「其他車」即跳到該站。'
                          : 'Tap a stop or “Other” to see every route at that stop.'}
                      </p>
                    )}

                  {busMode === 'favorites' && !selectedStop && (
                    <div className="hidden md:block">
                      <div className="flex items-center justify-between gap-3 border-b border-stone-200/70 px-4 py-3">
                        <p className="label-cap">
                          {lang === 'tc' ? '收藏總覽' : 'All favourites'}
                        </p>
                        <p className="text-[11px] font-medium tabular-nums text-stone-500">
                          {lang === 'tc' ? '巴士' : 'Bus'}{' '}
                          {favStops.length +
                            favRoutes.length +
                            favRouteStops.length}{' '}
                          · {lang === 'tc' ? '小巴' : 'GMB'} {favGmb.length} ·{' '}
                          {lang === 'tc' ? '港鐵' : 'MTR'} {favMtr.length}
                        </p>
                      </div>

                      {favStops.length +
                        favRoutes.length +
                        favRouteStops.length +
                        favGmb.length +
                        favMtr.length ===
                      0 ? (
                        <div className="flex flex-col items-center justify-center px-6 py-12 text-center md:py-16">
                          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-stone-100 text-stone-400">
                            <IconStar className="h-7 w-7" />
                          </div>
                          <h3 className="text-base font-bold tracking-tight">
                            {lang === 'tc' ? '由收藏開始' : 'Start from a favourite'}
                          </h3>
                          <p className="mt-1 max-w-sm text-sm leading-relaxed text-stone-500">
                            {lang === 'tc'
                              ? '喺巴士、小巴或港鐵分頁撳 ☆ 收藏，之後喺呢度一撳就睇到實時班次。'
                              : 'Tap ☆ in the bus, minibus or MTR tab, then open it here in one tap.'}
                          </p>
                        </div>
                      ) : (
                        <div className="grid gap-4 p-4 lg:grid-cols-2">
                          {favMtr.length > 0 && (
                            <section>
                              <p className="label-cap mb-1.5">
                                {lang === 'tc' ? '港鐵站' : 'MTR stations'}
                              </p>
                              <div className="space-y-1.5">
                                {favMtr.map((f) => (
                                  <button
                                    key={`${f.line}-${f.station}`}
                                    type="button"
                                    onClick={() => {
                                      setMtrLine(f.line)
                                      setMtrStation(f.station)
                                      setTab('mtr')
                                    }}
                                    className="flex w-full items-center gap-2.5 rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-left transition hover:border-stone-300 hover:bg-stone-50"
                                  >
                                    <span
                                      className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-[8px] font-black leading-none text-white"
                                      style={{ backgroundColor: f.color }}
                                    >
                                      {lang === 'tc' ? '港鐵' : 'MTR'}
                                    </span>
                                    <span className="min-w-0 flex-1">
                                      <span className="block truncate text-[13px] font-bold">
                                        {lang === 'tc' ? f.line_tc : f.line_en}
                                        <span className="font-medium text-stone-500">
                                          {' · '}
                                          {lang === 'tc' ? f.station_tc : f.station_en}
                                        </span>
                                      </span>
                                      <span className="mt-0.5 block text-[11px] text-stone-500">
                                        {lang === 'tc'
                                          ? '上／下行實時班次'
                                          : 'Live up / down trains'}
                                      </span>
                                    </span>
                                    <IconChevron className="h-4 w-4 flex-shrink-0 text-stone-300" />
                                  </button>
                                ))}
                              </div>
                            </section>
                          )}

                          {favGmb.length > 0 && (
                            <section>
                              <p className="label-cap mb-1.5">
                                {lang === 'tc' ? '小巴站' : 'Minibus stops'}
                              </p>
                              <div className="space-y-1.5">
                                {favGmb.map((f) => {
                                  const meta = regionMeta(f.region)
                                  return (
                                    <button
                                      key={`${f.routeId}-${f.routeSeq}-${f.stopId}`}
                                      type="button"
                                      onClick={() => {
                                        setTab('gmb')
                                        setGmbTarget({
                                          region: f.region as GmbRegion,
                                          code: f.routeCode,
                                          routeId: f.routeId,
                                          routeSeq: f.routeSeq,
                                          stopSeq: f.stopSeq,
                                          nonce: Date.now(),
                                        })
                                      }}
                                      className="flex w-full items-center gap-2.5 rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-left transition hover:border-stone-300 hover:bg-stone-50"
                                    >
                                      <span
                                        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-[8px] font-black leading-none text-white"
                                        style={{ backgroundColor: meta.color }}
                                      >
                                        {lang === 'tc' ? '小巴' : 'GMB'}
                                      </span>
                                      <span className="min-w-0 flex-1">
                                        <span className="block truncate text-[13px] font-bold">
                                          {f.routeCode}
                                          <span className="font-medium text-stone-500">
                                            {' · '}
                                            {lang === 'tc' ? f.stopName_tc : f.stopName_en}
                                          </span>
                                        </span>
                                        <span className="mt-0.5 block truncate text-[11px] text-stone-500">
                                          {regionLabel(f.region, lang)} ·{' '}
                                          {lang === 'tc' ? '往' : 'to'}{' '}
                                          {lang === 'tc' ? f.dest_tc : f.dest_en}
                                        </span>
                                      </span>
                                      <IconChevron className="h-4 w-4 flex-shrink-0 text-stone-300" />
                                    </button>
                                  )
                                })}
                              </div>
                            </section>
                          )}

                          {(favRouteStops.length > 0 ||
                            favStops.length > 0 ||
                            favRoutes.length > 0) && (
                            <section>
                              <p className="label-cap mb-1.5">
                                {lang === 'tc' ? '巴士' : 'Bus'}
                              </p>
                              <div className="space-y-1.5">
                                {favRouteStops.map((rs) => (
                                  <button
                                    key={`${rs.operator}-${rs.route}-${rs.bound}-${rs.service_type}-${rs.stopId}`}
                                    type="button"
                                    onClick={() => openFavRouteStop(rs)}
                                    className="flex w-full items-center gap-2.5 rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-left transition hover:border-stone-300 hover:bg-stone-50"
                                  >
                                    <span
                                      className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-[8px] font-black leading-none text-white ${
                                        rs.operator === 'KMB' ? 'bg-kmb' : 'bg-ctb'
                                      }`}
                                    >
                                      {rs.operator === 'KMB'
                                        ? lang === 'tc'
                                          ? '九巴'
                                          : 'KMB'
                                        : lang === 'tc'
                                        ? '城巴'
                                        : 'CTB'}
                                    </span>
                                    <span className="min-w-0 flex-1">
                                      <span className="block truncate text-[13px] font-bold">
                                        {rs.route}
                                        <span className="font-medium text-stone-500">
                                          {' · '}
                                          {lang === 'tc' ? rs.stopName_tc : rs.stopName_en}
                                        </span>
                                      </span>
                                      <span className="mt-0.5 block truncate text-[11px] text-stone-500">
                                        {lang === 'tc' ? '往' : 'to'}{' '}
                                        {lang === 'tc' ? rs.dest_tc : rs.dest_en}
                                      </span>
                                    </span>
                                    <IconChevron className="h-4 w-4 flex-shrink-0 text-stone-300" />
                                  </button>
                                ))}
                                {favStops.map((st) => (
                                  <button
                                    key={`${st.operator}-${st.id}`}
                                    type="button"
                                    onClick={() =>
                                      handleSelectStop({
                                        id: st.id,
                                        name_tc: st.name_tc,
                                        name_en: st.name_en,
                                        lat: st.lat,
                                        lng: st.lng,
                                        operator: st.operator as BusStop['operator'],
                                      })
                                    }
                                    className="flex w-full items-center gap-2.5 rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-left transition hover:border-stone-300 hover:bg-stone-50"
                                  >
                                    <span
                                      className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-[8px] font-black leading-none text-white ${
                                        st.operator === 'KMB' ? 'bg-kmb' : 'bg-ctb'
                                      }`}
                                    >
                                      {st.operator === 'KMB'
                                        ? lang === 'tc'
                                          ? '九巴'
                                          : 'KMB'
                                        : lang === 'tc'
                                        ? '城巴'
                                        : 'CTB'}
                                    </span>
                                    <span className="min-w-0 flex-1">
                                      <span className="block truncate text-[13px] font-bold">
                                        {lang === 'tc' ? st.name_tc : st.name_en}
                                      </span>
                                      <span className="mt-0.5 block text-[11px] text-stone-500">
                                        {lang === 'tc'
                                          ? '此站所有路線實時到站'
                                          : 'All routes at this stop'}
                                      </span>
                                    </span>
                                    <IconChevron className="h-4 w-4 flex-shrink-0 text-stone-300" />
                                  </button>
                                ))}
                                {favRoutes.map((r) => (
                                  <button
                                    key={`${r.operator}-${r.route}-${r.bound}-${r.service_type}`}
                                    type="button"
                                    onClick={() => openFavRoute(r)}
                                    className="flex w-full items-center gap-2.5 rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-left transition hover:border-stone-300 hover:bg-stone-50"
                                  >
                                    <span
                                      className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-[8px] font-black leading-none text-white ${
                                        r.operator === 'KMB' ? 'bg-kmb' : 'bg-ctb'
                                      }`}
                                    >
                                      {r.operator === 'KMB'
                                        ? lang === 'tc'
                                          ? '九巴'
                                          : 'KMB'
                                        : lang === 'tc'
                                        ? '城巴'
                                        : 'CTB'}
                                    </span>
                                    <span className="min-w-0 flex-1">
                                      <span className="block truncate text-[13px] font-bold">
                                        {lang === 'tc' ? r.label_tc : r.label_en}
                                      </span>
                                      <span className="mt-0.5 block text-[11px] text-stone-500">
                                        {lang === 'tc'
                                          ? '全線各站實時到站'
                                          : 'Every stop on the route'}
                                      </span>
                                    </span>
                                    <IconChevron className="h-4 w-4 flex-shrink-0 text-stone-300" />
                                  </button>
                                ))}
                              </div>
                            </section>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {busMode === 'favorites' && !selectedStop && (
                    <div className="flex flex-col items-center justify-center px-6 py-10 text-center md:hidden">
                      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-stone-100 text-stone-400">
                        <IconStar className="h-6 w-6" />
                      </div>
                      <h3 className="text-sm font-bold tracking-tight">
                        {lang === 'tc' ? '由收藏開始' : 'Start from a favourite'}
                      </h3>
                      <p className="mt-1 max-w-xs text-xs leading-relaxed text-stone-500">
                        {lang === 'tc'
                          ? '上面揀一個收藏，即刻睇實時到站。'
                          : 'Pick a favourite above to see live arrivals.'}
                      </p>
                    </div>
                  )}

                  {busMode === 'search' && !selectedStop && (
                    <div className="flex flex-col items-center justify-center px-6 py-12 text-center md:py-16">
                      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-stone-100 text-stone-400">
                        <IconSearch className="h-7 w-7" />
                      </div>
                      <h3 className="text-base font-bold tracking-tight">
                        {lang === 'tc' ? '揀一個站' : 'Pick a stop'}
                      </h3>
                      <p className="mt-1 max-w-sm text-sm leading-relaxed text-stone-500">
                        {lang === 'tc'
                          ? '喺左邊搜尋站名，再撳個站睇所有路線實時到站。'
                          : 'Search a stop name on the left, then open it for live arrivals.'}
                      </p>
                    </div>
                  )}

                  {busMode === 'route' &&
                    showAllAtStop &&
                    !selectedStop && (
                      <p className="p-6 text-center text-sm text-stone-500">
                        {lang === 'tc'
                          ? '揀一個站睇同站所有路線'
                          : 'Pick a stop to see all routes'}
                      </p>
                    )}
                </div>
              </div>
            </section>
          </>
        )}
      </main>

      {toast && (
        <div className="fixed bottom-8 left-1/2 z-50 max-w-[90%] -translate-x-1/2 rounded-full bg-stone-900/95 px-4 py-2 text-sm font-medium text-white shadow-lg">
          {toast}
        </div>
      )}

      <footer className="flex-shrink-0 border-t border-stone-200/70 bg-white/60 px-4 py-1.5 text-center text-[10px] text-stone-500 backdrop-blur">
        Data: data.gov.hk · KMB · Citybus · GMB · MTR · Not affiliated
      </footer>
    </div>
  )
}
