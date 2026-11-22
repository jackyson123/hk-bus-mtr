import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import MapView from './MapView'
import {
  IconStar,
  IconRefresh,
  IconMap,
  IconSearch,
  IconMinibus,
  IconChevron,
} from './Icons'
import {
  GMB_REGIONS,
  regionMeta,
  regionLabel,
  searchGmbRoutes,
  getGmbRouteVariants,
  getGmbRouteStops,
  getGmbFare,
  getGmbRouteEtas,
  todayHeadway,
  type GmbRegion,
  type GmbRouteRef,
  type GmbRouteVariant,
  type GmbDirection,
  type GmbRouteStop,
  type GmbEtaItem,
} from '../lib/gmb'
import { formatEta } from '../lib/api'
import { getGmbPath, type LatLng } from '../lib/shapes'
import type { BusStop, Lang } from '../types'
import type { FavGmb } from '../lib/favorites'

export interface GmbTarget {
  region: GmbRegion
  code: string
  routeId: number
  routeSeq: number
  stopSeq: number
  nonce: number
}

interface Props {
  lang: Lang
  favGmb: FavGmb[]
  isGmbFav: (v: { routeId: number; routeSeq: number; stopId: number }) => boolean
  toggleGmb: (item: Omit<FavGmb, 'savedAt'>) => void
  removeGmb: (v: { routeId: number; routeSeq: number; stopId: number }) => void
  target: GmbTarget | null
  onOpenFavorites: () => void
  showToast: (msg: string) => void
}

const QUICK_GMB: GmbRouteRef[] = [
  { code: '1A', region: 'HKI' },
  { code: '11M', region: 'NT' },
  { code: '20M', region: 'KLN' },
  { code: '102', region: 'NT' },
]

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

export default function GmbPanel({
  lang,
  favGmb,
  isGmbFav,
  toggleGmb,
  removeGmb,
  target,
  onOpenFavorites,
  showToast,
}: Props) {
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [refs, setRefs] = useState<GmbRouteRef[]>([])
  const [activeRef, setActiveRef] = useState<GmbRouteRef | null>(null)
  const [variants, setVariants] = useState<GmbRouteVariant[]>([])
  const [variant, setVariant] = useState<GmbRouteVariant | null>(null)
  const [directions, setDirections] = useState<GmbDirection[]>([])
  const [direction, setDirection] = useState<GmbDirection | null>(null)
  const [stops, setStops] = useState<GmbRouteStop[]>([])
  /** 真實小巴行車軌跡（運輸署 GMB 路線幾何） */
  const [gmbPath, setGmbPath] = useState<LatLng[] | null>(null)
  const [stopsLoading, setStopsLoading] = useState(false)
  const [fare, setFare] = useState<number | null>(null)
  const [etaBySeq, setEtaBySeq] = useState<Record<number, GmbEtaItem[]>>({})
  const [etaLoading, setEtaLoading] = useState(false)
  const [etaNote, setEtaNote] = useState('')
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [selectedSeq, setSelectedSeq] = useState<number | null>(null)
  const [mapOpen, setMapOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const etaRef = useRef<Record<number, GmbEtaItem[]>>({})
  const rowRefs = useRef<Record<number, HTMLDivElement | null>>({})
  const mapRef = useRef<HTMLDivElement | null>(null)

  const t = useCallback(
    (tc: string, en: string) => (lang === 'tc' ? tc : en),
    [lang]
  )

  const loadDirection = useCallback(
    async (v: GmbRouteVariant, dir: GmbDirection, focusSeq?: number | null) => {
      setDirection(dir)
      setSelectedSeq(null)
      setStops([])
      setStopsLoading(true)
      setEtaBySeq({})
      etaRef.current = {}
      setFare(null)
      setError(null)
      try {
        const [list, fullFare] = await Promise.all([
          getGmbRouteStops(v.routeId, dir.routeSeq),
          getGmbFare(v.routeId, dir.routeSeq).catch(() => null),
        ])
        setStops(list)
        setFare(fullFare)
        if (!list.length) {
          setError(
            lang === 'tc'
              ? '呢個方向暫時未有站點資料，試另一個方向'
              : 'No stops for this direction — try the other one'
          )
        }
        if (focusSeq != null && list.some((s) => s.stopSeq === focusSeq)) {
          setSelectedSeq(focusSeq)
          window.setTimeout(() => {
            rowRefs.current[focusSeq]?.scrollIntoView({
              behavior: 'smooth',
              block: 'center',
            })
          }, 450)
        }
        if (typeof window !== 'undefined' && window.innerWidth >= 768) {
          setMapOpen(true)
        }
      } catch (e: any) {
        setError(e?.message || 'Failed to load stops')
      } finally {
        setStopsLoading(false)
      }
    },
    [lang]
  )

  const loadRef = useCallback(
    async (
      ref: GmbRouteRef,
      prefer?: { routeId?: number; routeSeq?: number; stopSeq?: number }
    ) => {
      setActiveRef(ref)
      setQuery(ref.code)
      setRefs([])
      setSearching(true)
      setError(null)
      setVariants([])
      setVariant(null)
      setDirections([])
      setDirection(null)
      setStops([])
      setEtaBySeq({})
      etaRef.current = {}
      setFare(null)
      setSelectedSeq(null)
      try {
        const list = await getGmbRouteVariants(ref)
        if (!list.length) {
          setError(
            t(
              `搵唔到 ${ref.code}（${regionLabel(ref.region, 'tc')}）`,
              `Route ${ref.code} not found (${regionLabel(ref.region, 'en')})`
            )
          )
          return
        }
        setVariants(list)
        const v =
          (prefer?.routeId != null && list.find((x) => x.routeId === prefer.routeId)) ||
          list[0]
        setVariant(v)
        setDirections(v.directions)
        const dir =
          (prefer?.routeSeq != null &&
            v.directions.find((d) => d.routeSeq === prefer.routeSeq)) ||
          v.directions[0]
        if (dir) {
          await loadDirection(v, dir, prefer?.stopSeq ?? null)
        } else {
          setError(t('此路線暫時未有方向資料', 'No direction data for this route'))
        }
      } catch (e: any) {
        setError(e?.message || 'Search failed')
      } finally {
        setSearching(false)
      }
    },
    [loadDirection, t]
  )

  const onSearch = useCallback(
    async (codeArg?: string, regionArg?: GmbRegion) => {
      const q = (codeArg ?? query).trim().toUpperCase()
      if (!q) return
      setQuery(q)
      setError(null)
      if (regionArg) {
        await loadRef({ region: regionArg, code: q })
        return
      }
      setSearching(true)
      setRefs([])
      try {
        const found = await searchGmbRoutes(q)
        if (!found.length) {
          setError(
            t(
              `搵唔到小巴路線 ${q}`,
              `Green minibus route ${q} not found`
            )
          )
          return
        }
        if (found.length === 1) {
          await loadRef(found[0])
        } else {
          setRefs(found)
        }
      } catch (e: any) {
        setError(e?.message || 'Search failed')
      } finally {
        setSearching(false)
      }
    },
    [query, loadRef, t]
  )

  // 由「收藏」總覽跳入嚟
  const lastTarget = useRef<number>(0)
  useEffect(() => {
    if (!target || target.nonce === lastTarget.current) return
    lastTarget.current = target.nonce
    loadRef(
      { region: target.region, code: target.code },
      { routeId: target.routeId, routeSeq: target.routeSeq, stopSeq: target.stopSeq }
    )
  }, [target, loadRef])

  // 各站實時到站：載入後每 30 秒自動更新
  const routeId = variant?.routeId ?? null
  const routeSeq = direction?.routeSeq ?? null
  const stopSeqsKey = useMemo(
    () => stops.map((s) => s.stopSeq).join(','),
    [stops]
  )

  useEffect(() => {
    if (routeId == null || routeSeq == null || !stops.length) return
    let cancelled = false
    const seqs = stops.map((s) => s.stopSeq)

    const run = async (first: boolean) => {
      if (first) setEtaLoading(true)
      try {
        const res = await getGmbRouteEtas(routeId, routeSeq, seqs)
        if (cancelled) return
        etaRef.current = res.map
        setEtaBySeq(res.map)
        setEtaNote(
          lang === 'tc' ? res.note_tc : res.note_en
        )
        const now = new Date()
        setUpdatedAt(
          `${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(
            now.getSeconds()
          )}`
        )
      } catch {
        /* 下一輪再試 */
      } finally {
        if (!cancelled && first) setEtaLoading(false)
      }
    }

    run(true)
    const timer = window.setInterval(() => {
      if (!cancelled) run(false)
    }, 30000)

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [routeId, routeSeq, stopSeqsKey, stops, lang])

  const mapStops: BusStop[] = useMemo(
    () =>
      stops
        .filter((s) => s.lat && s.lng)
        .map((s) => ({
          id: String(s.stopId),
          name_tc: s.name_tc,
          name_en: s.name_en,
          lat: s.lat,
          lng: s.lng,
          operator: 'GMB' as const,
        })),
    [stops]
  )

  // 真實小巴走線：載入後貼住馬路畫，冇資料就保持站點連線
  useEffect(() => {
    setGmbPath(null)
    if (!variant || !direction || stops.length < 2) return
    const first = stops[0]
    const last = stops[stops.length - 1]
    let cancelled = false
    getGmbPath(
      variant.code,
      [first.lat, first.lng],
      [last.lat, last.lng]
    )
      .then((p) => {
        if (!cancelled) setGmbPath(p)
      })
      .catch(() => {
        /* 降級用站點連線 */
      })
    return () => {
      cancelled = true
    }
  }, [variant, direction, stops])

  const region = activeRef ? regionMeta(activeRef.region) : null
  const headway = direction ? todayHeadway(direction) : null
  const headwayText = headway
    ? headway.min === headway.max
      ? t(`約 ${headway.min} 分鐘一班`, `Every ${headway.min} min`)
      : t(
          `約 ${headway.min}–${headway.max} 分鐘一班`,
          `Every ${headway.min}–${headway.max} min`
        )
    : ''

  const routeTitle = useMemo(() => {
    if (!variant || !direction) return ''
    const orig = lang === 'tc' ? direction.orig_tc : direction.orig_en
    const dest = lang === 'tc' ? direction.dest_tc : direction.dest_en
    return `${variant.code} · ${orig} → ${dest}`
  }, [variant, direction, lang])

  const dirLabel = (d: GmbDirection) =>
    d.routeSeq === 1 ? t('上行', 'UP') : t('下行', 'DOWN')

  const pickDirection = async (d: GmbDirection) => {
    if (!variant) return
    await loadDirection(variant, d)
  }

  const pickVariant = async (v: GmbRouteVariant) => {
    setVariant(v)
    setDirections(v.directions)
    const dir = v.directions[0]
    if (dir) await loadDirection(v, dir)
  }

  const onToggleFavStop = (s: GmbRouteStop) => {
    if (!variant || !direction || !activeRef) return
    const key = { routeId: variant.routeId, routeSeq: direction.routeSeq, stopId: s.stopId }
    const wasFav = isGmbFav(key)
    toggleGmb({
      region: activeRef.region,
      routeId: variant.routeId,
      routeSeq: direction.routeSeq,
      routeCode: variant.code,
      dest_tc: direction.dest_tc,
      dest_en: direction.dest_en,
      orig_tc: direction.orig_tc,
      orig_en: direction.orig_en,
      stopId: s.stopId,
      stopSeq: s.stopSeq,
      stopName_tc: s.name_tc,
      stopName_en: s.name_en,
      fare,
    })
    showToast(wasFav ? t('已取消收藏', 'Removed favourite') : t('已收藏小巴站', 'Saved minibus stop'))
  }

  const gotoFav = (f: FavGmb) => {
    loadRef(
      { region: f.region as GmbRegion, code: f.routeCode },
      { routeId: f.routeId, routeSeq: f.routeSeq, stopSeq: f.stopSeq }
    )
  }

  /* ------------------------------ UI pieces ------------------------------ */

  const searchBox = (
    <div className="flex gap-2">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && onSearch()}
        placeholder={t('小巴路線號碼，例如 1A、11M', 'e.g. 1A, 11M, 20M')}
        className="input-base h-11 flex-1 font-semibold uppercase tracking-wide"
        autoCapitalize="characters"
        aria-label={t('小巴路線號碼', 'Green minibus route number')}
      />
      <button
        type="button"
        onClick={() => onSearch()}
        disabled={searching || !query.trim()}
        className="inline-flex h-11 w-14 items-center justify-center rounded-xl bg-[#0B7A3B] text-sm font-semibold text-white shadow-sm transition hover:bg-[#096730] disabled:opacity-40"
      >
        {searching ? '…' : t('查', 'Go')}
      </button>
    </div>
  )

  const quickChips = (compact?: boolean) => (
    <div className="flex flex-wrap gap-1.5">
      {QUICK_GMB.map((r) => {
        const meta = regionMeta(r.region)
        const active =
          activeRef?.code === r.code && activeRef?.region === r.region
        return (
          <button
            key={`${r.region}-${r.code}`}
            type="button"
            onClick={() => onSearch(r.code, r.region)}
            className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-bold transition ${
              active
                ? 'border-[#0B7A3B] bg-[#0B7A3B] text-white'
                : 'border-stone-200 bg-stone-50 text-stone-700 hover:border-stone-400 hover:bg-white'
            }`}
            title={regionLabel(r.region, lang)}
          >
            {r.code}
            {!compact && (
              <span
                className={`rounded px-1 py-px text-[8px] font-bold ${
                  active ? 'bg-white/20 text-white' : 'text-white'
                }`}
                style={active ? undefined : { backgroundColor: meta.color }}
              >
                {regionLabel(r.region, lang)}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )

  const dirCard = directions.length > 0 && (
    <div className="border-b border-stone-200/70 bg-[#f5f4f2] px-3 py-2.5 md:rounded-2xl md:border md:border-stone-200/80 md:bg-white md:p-3 md:shadow-card">
      <p className="label-cap mb-1.5">{t('方向', 'Direction')}</p>
      <div className="grid grid-cols-2 gap-1.5 md:grid-cols-1">
        {directions.map((d) => {
          const active = direction?.routeSeq === d.routeSeq
          return (
            <button
              key={d.routeSeq}
              type="button"
              onClick={() => pickDirection(d)}
              className={`flex min-w-0 flex-col rounded-xl border px-2.5 py-2 text-left transition ${
                active
                  ? 'border-[#0B7A3B] bg-[#0B7A3B] text-white shadow-sm'
                  : 'border-stone-200 bg-white text-stone-800 hover:border-stone-300'
              }`}
            >
              <span
                className={`text-[9px] font-bold uppercase tracking-wider ${
                  active ? 'text-white/70' : 'text-stone-400'
                }`}
              >
                {dirLabel(d)}
              </span>
              <span className="mt-0.5 truncate text-[12px] font-bold">
                {lang === 'tc' ? d.orig_tc : d.orig_en}
              </span>
              <span
                className={`truncate text-[11px] ${
                  active ? 'text-white/85' : 'text-stone-500'
                }`}
              >
                → {lang === 'tc' ? d.dest_tc : d.dest_en}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )

  const variantChips = variants.length > 1 && (
    <div className="border-b border-stone-200/70 bg-[#f5f4f2] px-3 py-2 md:rounded-2xl md:border md:border-stone-200/80 md:bg-white md:p-3 md:shadow-card">
      <p className="label-cap mb-1.5">{t('班次種類', 'Service type')}</p>
      <div className="flex flex-wrap gap-1.5">
        {variants.map((v) => {
          const active = variant?.routeId === v.routeId
          return (
            <button
              key={v.routeId}
              type="button"
              onClick={() => pickVariant(v)}
              className={`rounded-lg border px-2 py-1 text-[11px] font-semibold transition ${
                active
                  ? 'border-[#0B7A3B] bg-[#0B7A3B] text-white'
                  : 'border-stone-200 bg-white text-stone-700 hover:border-stone-400'
              }`}
            >
              {lang === 'tc' ? v.desc_tc : v.desc_en}
            </button>
          )
        })}
      </div>
    </div>
  )

  const favCard = (
    <div
      className={`border-b border-stone-200/70 px-3 py-3 md:rounded-2xl md:border md:border-stone-200/80 md:bg-white md:p-3 md:shadow-card ${
        favGmb.length === 0 ? 'hidden md:block' : ''
      }`}
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="label-cap flex items-center gap-1.5">
          <IconStar className="h-3.5 w-3.5" filled />
          {t('收藏小巴站', 'Saved minibus stops')}
        </p>
        <button
          type="button"
          onClick={onOpenFavorites}
          className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-stone-500 transition hover:text-stone-900"
        >
          {t('全部收藏', 'All')}
          <IconChevron className="h-3 w-3" />
        </button>
      </div>
      {favGmb.length === 0 ? (
        <p className="text-[11px] leading-relaxed text-stone-500">
          {t(
            '喺站旁撳 ☆ 就可以收藏呢條小巴線嘅站。',
            'Tap ☆ next to a stop to save this minibus route stop.'
          )}
        </p>
      ) : (
        <div className="max-h-[26vh] space-y-1 overflow-y-auto pr-1 md:max-h-[30vh]">
          {favGmb.map((f) => {
            const meta = regionMeta(f.region)
            const active =
              variant?.routeId === f.routeId &&
              direction?.routeSeq === f.routeSeq
            return (
              <div
                key={`${f.routeId}-${f.routeSeq}-${f.stopId}`}
                className={`flex items-center gap-1 rounded-lg border ${
                  active && selectedSeq === f.stopSeq
                    ? 'border-emerald-300 bg-emerald-50'
                    : 'border-transparent hover:border-stone-200 hover:bg-stone-50'
                }`}
              >
                <button
                  type="button"
                  onClick={() => gotoFav(f)}
                  className="flex min-w-0 flex-1 items-center gap-1.5 px-2 py-1.5 text-left"
                >
                  <span
                    className="flex-shrink-0 rounded px-1 py-0.5 text-[8px] font-bold text-white"
                    style={{ backgroundColor: meta.color }}
                  >
                    {regionLabel(f.region, lang)}
                  </span>
                  <span className="flex-shrink-0 text-[12px] font-bold">
                    {f.routeCode}
                  </span>
                  <span className="truncate text-[11px] text-stone-600">
                    {lang === 'tc' ? f.stopName_tc : f.stopName_en}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => removeGmb(f)}
                  className="px-1.5 py-1 text-[11px] text-stone-300 transition hover:text-stone-700"
                  title={t('移除', 'Remove')}
                  aria-label={t('移除收藏', 'Remove favourite')}
                >
                  ✕
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )

  const regionPicker = refs.length > 0 && (
    <div className="border-b border-stone-200/70 bg-[#f5f4f2] px-3 py-2.5 md:rounded-2xl md:border md:border-stone-200/80 md:bg-white md:p-3 md:shadow-card">
      <p className="label-cap mb-1.5">
        {t('同一個號碼有幾個地區，揀一個', 'Same number, pick a region')}
      </p>
      <div className="space-y-1">
        {refs.map((r) => {
          const meta = regionMeta(r.region)
          return (
            <button
              key={`${r.region}-${r.code}`}
              type="button"
              onClick={() => loadRef(r)}
              className="flex w-full items-center gap-2 rounded-xl border border-stone-200 bg-white px-2.5 py-2 text-left transition hover:border-stone-400"
            >
              <span
                className="rounded px-1.5 py-0.5 text-[9px] font-bold text-white"
                style={{ backgroundColor: meta.color }}
              >
                {regionLabel(r.region, lang)}
              </span>
              <span className="text-[13px] font-bold">{r.code}</span>
              <span className="truncate text-[11px] text-stone-500">
                {t('綠色專線小巴', 'Green minibus')}
              </span>
              <IconChevron className="ml-auto h-3.5 w-3.5 flex-shrink-0 text-stone-300" />
            </button>
          )
        })}
      </div>
    </div>
  )

  const emptyState = (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center md:py-16">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-[#0B7A3B]">
        <IconMinibus className="h-7 w-7" />
      </div>
      <h3 className="text-base font-bold tracking-tight">
        {t('查綠色專線小巴，睇實時到站', 'Green minibus live arrivals')}
      </h3>
      <p className="mt-1 max-w-sm text-sm leading-relaxed text-stone-500">
        {t(
          '輸入路線號碼（港島／九龍／新界），揀方向，即刻見到全線各站同到站時間。',
          'Enter a route number (Hong Kong Island / Kowloon / New Territories), pick a direction, and see every stop with live ETAs.'
        )}
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {QUICK_GMB.map((r) => (
          <button
            key={`${r.region}-${r.code}`}
            type="button"
            onClick={() => onSearch(r.code, r.region)}
            className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-white px-3.5 py-1.5 text-xs font-bold text-stone-700 shadow-sm transition hover:border-stone-400 hover:text-stone-900"
          >
            {r.code}
            <span className="text-[9px] font-semibold text-stone-400">
              {regionLabel(r.region, lang)}
            </span>
          </button>
        ))}
      </div>
    </div>
  )

  return (
    <div data-testid="gmb-panel" className="flex min-h-0 flex-none flex-col md:h-full md:flex-1 md:flex-row md:gap-3 md:overflow-hidden md:p-4 xl:grid xl:grid-cols-[320px_minmax(0,1fr)_minmax(360px,31%)] xl:grid-rows-1">
      {/* ─────────── 左欄：搜尋 / 方向 / 熱門 / 收藏 ─────────── */}
        {/* 手機頂部 */}
        <div className="sticky top-0 z-30 border-b border-stone-200/70 bg-[#f5f4f2]/95 px-3 pb-2.5 pt-2.5 backdrop-blur md:hidden">
          {searchBox}
          <div className="mt-2 flex items-center justify-between gap-2">
            <div className="min-w-0">
              {activeRef ? (
                <>
                  <p className="flex items-center gap-1.5 truncate text-[13px] font-bold">
                    <span
                      className="flex-shrink-0 rounded px-1 py-0.5 text-[8px] font-bold text-white"
                      style={{ background: region?.color }}
                    >
                      {regionLabel(activeRef.region, lang)}
                    </span>
                    {routeTitle || activeRef.code}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-[10px] text-stone-500">
                    {updatedAt && (
                      <span className="tabular-nums">
                        {t('更新 ', 'Updated ')}
                        {updatedAt}
                      </span>
                    )}
                    {fare != null && <span>{t('全程', 'Full fare')} ${fare.toFixed(1)}</span>}
                  </p>
                </>
              ) : (
                <p className="text-[12px] font-semibold text-stone-500">
                  {t('綠色專線小巴', 'Green minibus')}
                </p>
              )}
            </div>
            <div className="flex flex-shrink-0 items-center gap-1.5">
              {direction && variant && (
                <button
                  type="button"
                  onClick={() => {
                    const stops2 = stops
                    if (!stops2.length) return
                    const seq = selectedSeq ?? stops2[0].stopSeq
                    // 收藏目前選中（或第一）站
                    const s = stops2.find((x) => x.stopSeq === seq)
                    if (s) onToggleFavStop(s)
                  }}
                  className={`inline-flex items-center gap-1 rounded-xl border px-2 py-2 text-[11px] font-semibold transition ${
                    selectedSeq != null &&
                    isGmbFav({
                      routeId: variant.routeId,
                      routeSeq: direction.routeSeq,
                      stopId: stops.find((s) => s.stopSeq === selectedSeq)?.stopId ?? 0,
                    })
                      ? 'border-amber-300 bg-amber-50 text-amber-700'
                      : 'border-stone-200 bg-white text-stone-600'
                  }`}
                  aria-label={t('收藏', 'Favourite')}
                >
                  <IconStar className="h-3.5 w-3.5" filled />
                </button>
              )}
              <button
                type="button"
                onClick={() =>
                  setMapOpen((v) => {
                    const next = !v
                    if (next) {
                      window.setTimeout(() => {
                        mapRef.current?.scrollIntoView({
                          behavior: 'smooth',
                          block: 'center',
                        })
                      }, 180)
                    }
                    return next
                  })
                }
                className={`inline-flex items-center gap-1 rounded-xl border px-2.5 py-2 text-[11px] font-semibold transition ${
                  mapOpen
                    ? 'border-stone-900 bg-stone-900 text-white'
                    : 'border-stone-200 bg-white text-stone-700'
                }`}
              >
                <IconMap className="h-3.5 w-3.5" />
                {t('地圖', 'Map')}
              </button>
            </div>
          </div>
        </div>

      <aside data-testid="gmb-aside" className="flex flex-shrink-0 flex-col md:min-h-0 md:w-[300px] md:gap-3 md:overflow-y-auto xl:w-auto">
        {/* 電腦搜尋卡 */}
        <div className="hidden border-b border-stone-200/70 px-3 py-3.5 md:block md:rounded-2xl md:border md:border-stone-200/80 md:bg-white md:p-3.5 md:shadow-card">
          <p className="label-cap mb-2 flex items-center gap-1.5">
            <IconMinibus className="h-3.5 w-3.5" />
            {t('小巴路線號碼', 'Minibus route')}
          </p>
          {searchBox}
          {error && (
            <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs font-medium leading-relaxed text-amber-800">
              {error}
            </p>
          )}
          {!activeRef && (
            <div className="mt-3">
              <p className="label-cap mb-1.5">{t('熱門小巴線', 'Popular routes')}</p>
              {quickChips()}
            </div>
          )}
        </div>

        {/* 手機錯誤 */}
        {error && (
          <p className="mx-3 mt-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs font-medium leading-relaxed text-amber-800 md:hidden">
            {error}
          </p>
        )}

        {/* 手機熱門線（未揀路線時） */}
        {!activeRef && (
          <div className="border-b border-stone-200/70 px-3 py-2.5 md:hidden">
            <p className="label-cap mb-1.5">{t('熱門小巴線', 'Popular routes')}</p>
            {quickChips()}
          </div>
        )}

        {regionPicker}
        {variantChips}
        {dirCard}
        {favCard}
      </aside>

      <div data-testid="gmb-body" className="flex flex-none flex-col md:min-h-0 md:flex-1 xl:contents">
        {/* ─────────── 中間：各站實時到站 ─────────── */}
        <section data-testid="gmb-board" className="flex min-h-0 flex-col px-3 pt-3 md:overflow-hidden md:px-0 md:pt-0">
          <div className="flex min-h-0 flex-col md:flex-1 md:overflow-hidden md:rounded-2xl md:border md:border-stone-200/80 md:bg-white md:shadow-card">
            <div className="hidden items-center justify-between gap-3 border-b border-stone-200/70 px-4 py-3 md:flex">
              <div className="min-w-0">
                <p className="label-cap flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#0B7A3B]" />
                  {t('小巴路線', 'Green minibus')}
                </p>
                <h2 className="truncate text-[17px] font-bold tracking-tight">
                  {routeTitle || t('搵小巴路線', 'Find a minibus route')}
                </h2>
                {(region || fare != null || headway || stops.length > 0) && (
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    {region && activeRef && (
                      <span
                        className="rounded-md px-1.5 py-0.5 text-[10px] font-bold text-white"
                        style={{ backgroundColor: region.color }}
                      >
                        {regionLabel(activeRef.region, lang)}
                      </span>
                    )}
                    {variant && variants.length > 1 && (
                      <span className="rounded-md bg-stone-100 px-1.5 py-0.5 text-[10px] font-semibold text-stone-600">
                        {lang === 'tc' ? variant.desc_tc : variant.desc_en}
                      </span>
                    )}
                    {fare != null && (
                      <span className="rounded-md border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">
                        {t('全程', 'Full')} ${fare.toFixed(1)}
                      </span>
                    )}
                    {headwayText && (
                      <span className="rounded-md border border-stone-200 bg-stone-50 px-1.5 py-0.5 text-[10px] font-semibold text-stone-600">
                        {headwayText}
                      </span>
                    )}
                    {stops.length > 0 && (
                      <span className="rounded-md border border-stone-200 bg-stone-50 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-stone-600">
                        {stops.length} {t('站', 'stops')}
                      </span>
                    )}
                  </div>
                )}
              </div>
              <div className="flex flex-shrink-0 items-center gap-1.5">
                {(etaLoading || searching || stopsLoading) && (
                  <span className="text-[11px] font-medium text-stone-500">
                    {t('更新中…', 'Updating…')}
                  </span>
                )}
                {updatedAt && !etaLoading && (
                  <span className="hidden items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-800 sm:flex">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    </span>
                    {t('實時 · 每 30 秒更新', 'Live · every 30s')}
                  </span>
                )}
              </div>
            </div>

            <div className="min-h-0 flex-1 md:overflow-y-auto">
              {/* 手機：目前路線摘要 */}
              {activeRef && (
                <div className="flex items-center justify-between gap-2 border-b border-stone-200/70 bg-white px-3 py-2 md:hidden">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-bold">
                      {routeTitle || activeRef.code}
                    </p>
                    <p className="text-[10px] text-stone-500">
                      {stops.length} {t('站', 'stops')}
                      {headwayText ? ` · ${headwayText}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (!stops.length) return
                      // 重新載入到站
                      const v = variant
                      const d = direction
                      if (v && d) loadDirection(v, d, selectedSeq)
                    }}
                    className="inline-flex flex-shrink-0 items-center gap-1 rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-[10px] font-semibold text-stone-600"
                  >
                    <IconRefresh className="h-3 w-3" />
                    {t('更新', 'Refresh')}
                  </button>
                </div>
              )}

              {stopsLoading && (
                <div className="space-y-2 p-3 md:p-4">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div
                      key={i}
                      className="h-14 animate-pulse rounded-xl border border-stone-100 bg-stone-50"
                    />
                  ))}
                </div>
              )}

              {!stopsLoading && stops.length > 0 && (
                <>
                  <div className="flex flex-wrap items-center gap-2 border-b border-stone-200/70 px-3 py-2 md:px-4">
                    <p className="label-cap">{t('各站到站', 'Live arrivals')}</p>
                    {direction && (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                        {dirLabel(direction)}
                      </span>
                    )}
                    {etaNote && (
                      <span className="text-[10px] font-medium text-amber-700">
                        {etaNote}
                      </span>
                    )}
                  </div>
                  <div>
                    {stops.map((s) => {
                      const times = etaBySeq[s.stopSeq] ?? []
                      const selected = selectedSeq === s.stopSeq
                      const fav = variant && direction
                        ? isGmbFav({
                            routeId: variant.routeId,
                            routeSeq: direction.routeSeq,
                            stopId: s.stopId,
                          })
                        : false
                      return (
                        <div
                          key={s.stopSeq}
                          ref={(el) => {
                            rowRefs.current[s.stopSeq] = el
                          }}
                          className={`fade-up grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1.5 border-b border-stone-100 px-3 py-2.5 transition last:border-0 md:px-4 lg:grid-cols-[2.5rem_minmax(0,1fr)_13rem_4.5rem] lg:gap-x-3 ${
                            selected
                              ? 'bg-emerald-50/70 shadow-[inset_3px_0_0_0_#0B7A3B]'
                              : 'hover:bg-stone-50'
                          }`}
                        >
                          <span
                            className={`col-start-1 row-start-1 flex h-6 w-6 items-center justify-center justify-self-center rounded-md text-[11px] font-bold tabular-nums ${
                              selected
                                ? 'bg-[#0B7A3B] text-white'
                                : 'bg-stone-100 text-stone-600'
                            }`}
                          >
                            {s.stopSeq}
                          </span>

                          <button
                            type="button"
                            onClick={() => setSelectedSeq(s.stopSeq)}
                            className="col-start-2 row-start-1 min-w-0 self-stretch text-left"
                          >
                            <span className="block truncate text-[13px] font-semibold md:text-sm">
                              {lang === 'tc' ? s.name_tc : s.name_en}
                            </span>
                          </button>

                          <div className="col-span-2 col-start-2 row-start-2 flex flex-wrap items-center gap-1.5 lg:col-span-1 lg:col-start-3 lg:row-start-1 lg:flex-nowrap">
                            {times.length === 0 ? (
                              <span className="text-[11px] text-stone-400">
                                {etaLoading || !updatedAt
                                  ? t('載入中…', 'Loading…')
                                  : t('暫無到站', 'No ETA')}
                              </span>
                            ) : (
                              times.slice(0, 3).map((tm, i) => (
                                <span
                                  key={i}
                                  className={`inline-flex min-w-[4rem] flex-col items-center justify-center rounded-lg px-1.5 py-1 leading-tight ${
                                    i === 0
                                      ? 'bg-emerald-100 text-emerald-900'
                                      : 'bg-stone-100 text-stone-700'
                                  }`}
                                  title={
                                    lang === 'tc'
                                      ? tm.remarks_tc || ''
                                      : tm.remarks_en || ''
                                  }
                                >
                                  <span className="text-[13px] font-bold tabular-nums">
                                    {formatEta(tm.timestamp, lang)}
                                  </span>
                                  <span className="mt-0.5 text-[9px] font-semibold text-emerald-700/80">
                                    {tm.remarks_tc === '最後一班'
                                      ? t('最後', 'Last')
                                      : tm.remarks_tc === '未開出'
                                      ? t('預定', 'Sched')
                                      : t('小巴', 'GMB')}
                                  </span>
                                </span>
                              ))
                            )}
                          </div>

                          <div className="col-start-3 row-start-1 flex items-center justify-end gap-0.5 lg:col-start-4">
                            <button
                              type="button"
                              onClick={() => onToggleFavStop(s)}
                              className={`rounded-md px-1 py-1 transition ${
                                fav
                                  ? 'text-amber-500'
                                  : 'text-stone-300 hover:text-stone-500'
                              }`}
                              title={
                                fav
                                  ? t('取消收藏', 'Remove favourite')
                                  : t('收藏此站', 'Save this stop')
                              }
                              aria-label={t('收藏此站', 'Save this stop')}
                            >
                              <IconStar className="h-4 w-4" filled={fav} />
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <p className="px-4 py-3 text-center text-xs text-stone-500">
                    {t(
                      '撳站名可喺地圖定位；☆ 收藏呢條線嘅站。',
                      'Tap a stop to locate it on the map; ☆ saves the stop.'
                    )}
                  </p>
                </>
              )}

              {!stopsLoading && !stops.length && !activeRef && emptyState}

              {!stopsLoading && !stops.length && activeRef && (
                <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-stone-100 text-stone-400">
                    <IconSearch className="h-6 w-6" />
                  </div>
                  <h3 className="text-sm font-bold">
                    {t('揀方向，睇全線到站', 'Pick a direction')}
                  </h3>
                  <p className="mt-1 max-w-xs text-xs leading-relaxed text-stone-500">
                    {t(
                      '左邊揀上行或下行，就會列出全線各站同實時到站。',
                      'Choose up or down on the left to list every stop with live ETAs.'
                    )}
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ─────────── 右邊：地圖 ─────────── */}
        <div
          ref={mapRef}
          data-testid="gmb-map"
          className={`${
            mapOpen ? 'block' : 'hidden'
          } flex-shrink-0 px-3 pb-3 pt-3 md:block md:min-h-[220px] md:flex-1 md:px-0 md:pb-0 md:pt-0 xl:flex-none`}
        >
          <div className="relative h-56 overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-card md:h-full">
            <div className="pointer-events-none absolute left-3 top-3 z-10 flex items-center gap-2 rounded-xl border border-stone-200/70 bg-white/92 px-2.5 py-1.5 shadow-sm backdrop-blur">
              <IconMap className="h-3.5 w-3.5 text-[#0B7A3B]" />
              <span className="text-[11px] font-semibold text-stone-800">
                {t('小巴路線圖', 'Minibus map')}
              </span>
              <span className="text-[10px] font-medium tabular-nums text-stone-500">
                {mapStops.length} {t('站', 'stops')}
              </span>
            </div>
            {mapStops.length > 0 ? (
              <MapView
                userLat={null}
                userLng={null}
                stops={mapStops}
                selectedStopId={
                  selectedSeq != null
                    ? String(stops.find((s) => s.stopSeq === selectedSeq)?.stopId ?? '')
                    : null
                }
                onSelectStop={(stop) => {
                  const hit = stops.find((s) => String(s.stopId) === stop.id)
                  if (hit) setSelectedSeq(hit.stopSeq)
                }}
                lang={lang}
                height="100%"
                fitToStops={true}
                fitKey={`gmb-${routeId}-${routeSeq}-${stops.length}${gmbPath ? '-shape' : ''}`}
                showRouteLine={mapStops.length > 1}
                routeColor="#0B7A3B"
                paths={gmbPath ? [gmbPath] : null}
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center text-xs text-stone-500">
                <IconMap className="h-6 w-6 text-stone-300" />
                {t('查一條小巴線，就會見到路線圖。', 'Search a route to see its map.')}
              </div>
            )}
            <div className="pointer-events-none absolute bottom-2 left-3 z-10 flex items-center gap-2 rounded-lg border border-stone-200/70 bg-white/92 px-2 py-1 text-[9px] font-medium text-stone-600 shadow-sm">
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-[#0B7A3B]" />
                {t('小巴站', 'GMB')}
              </span>
              <span className="h-2.5 w-px bg-stone-300" />
              <span className="text-stone-400">© OpenStreetMap</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
