import { useState, useEffect, useCallback, useRef } from 'react'
import { LR_ROUTES, type LrRoute, type LrStop } from '../lib/lrData'
import { getLrSchedule, type LrPlatformGroup, type LrDeparture } from '../lib/lr'
import { IconRefresh, IconTrain } from './Icons'
import type { Lang } from '../types'

interface Props {
  lang: Lang
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

const LR_COLOR = '#0099A8'

export default function LrPanel({ lang }: Props) {
  const [route, setRoute] = useState<LrRoute>(LR_ROUTES[0])
  const [stop, setStop] = useState<LrStop>(LR_ROUTES[0].stops[0])
  const [groups, setGroups] = useState<LrPlatformGroup[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const stopRef = useRef<HTMLDivElement | null>(null)

  const t = useCallback(
    (tc: string, en: string) => (lang === 'tc' ? tc : en),
    [lang]
  )

  const load = useCallback(
    async (s: LrStop, first = false) => {
      if (first) setLoading(true)
      setError(null)
      try {
        const res = await getLrSchedule(s.id, lang)
        setGroups(res)
        const now = new Date()
        setUpdatedAt(
          `${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`
        )
      } catch (e: any) {
        setError(e?.message || 'Failed to load')
      } finally {
        if (first) setLoading(false)
      }
    },
    [lang]
  )

  // 揀站即查；之後每 20 秒自動更新
  useEffect(() => {
    let cancelled = false
    load(stop, true).catch(() => {
      /* error state 已處理 */
    })
    const timer = window.setInterval(() => {
      if (!cancelled) load(stop).catch(() => {})
    }, 20000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [stop, load])

  const pickRoute = (r: LrRoute) => {
    setRoute(r)
    const first = r.stops[0]
    if (first) {
      setStop(first)
      setGroups([])
    }
  }

  const pickStop = (s: LrStop) => {
    setStop(s)
    setGroups([])
    window.setTimeout(() => {
      stopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }, 120)
  }

  const timeText = (d: LrDeparture): string => {
    if (d.status === 'departing') return t('正在離開', 'Departing')
    if (d.status === 'arriving') return t('即將到達', 'Arriving')
    const raw = lang === 'tc' ? d.timeText_tc : d.timeText_en
    if (raw) return raw
    if (d.minutes != null) return t(`${d.minutes} 分鐘`, `${d.minutes} mins`)
    return '—'
  }

  const hasDepartures = groups.some((g) => g.departures.length > 0)
  const stopName = lang === 'tc' ? stop.name_tc : stop.name_en
  const routeTitle = `${route.code} · ${
    lang === 'tc' ? route.orig_tc : route.orig_en
  } → ${lang === 'tc' ? route.dest_tc : route.dest_en}`

  return (
    <div className="flex min-h-0 flex-none flex-col md:h-full md:flex-1 md:flex-row md:gap-3 md:overflow-hidden md:p-4">
      {/* ─────────── 左欄：路線 + 車站 ─────────── */}
      <aside className="flex flex-shrink-0 flex-col md:min-h-0 md:w-[300px] md:gap-3 md:overflow-y-auto xl:w-[320px]">
        {/* 路線 */}
        <div className="border-b border-stone-200/70 px-3 py-3 md:rounded-2xl md:border md:border-stone-200/80 md:bg-white md:p-3.5 md:shadow-sm">
          <p className="label-cap mb-2 flex items-center gap-1.5">
            <IconTrain className="h-3.5 w-3.5" />
            {t('輕鐵路線', 'Light Rail routes')}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {LR_ROUTES.map((r) => {
              const active = route.code === r.code
              return (
                <button
                  key={r.code}
                  type="button"
                  onClick={() => pickRoute(r)}
                  title={`${r.code} · ${lang === 'tc' ? r.orig_tc : r.orig_en} → ${
                    lang === 'tc' ? r.dest_tc : r.dest_en
                  }`}
                  className={`rounded-lg border px-2.5 py-1.5 text-left transition ${
                    active
                      ? 'border-[#0099A8] bg-[#0099A8] text-white shadow-sm'
                      : 'border-stone-200 bg-white text-stone-700 hover:border-stone-400'
                  }`}
                >
                  <span className="block text-[13px] font-bold leading-tight">
                    {r.code}
                  </span>
                  <span
                    className={`block truncate text-[10px] leading-tight ${
                      active ? 'text-white/85' : 'text-stone-500'
                    }`}
                  >
                    {lang === 'tc' ? r.orig_tc : r.orig_en} →{' '}
                    {lang === 'tc' ? r.dest_tc : r.dest_en}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* 車站列表 */}
        <div className="border-b border-stone-200/70 px-3 py-3 md:rounded-2xl md:border md:border-stone-200/80 md:bg-white md:p-3.5 md:shadow-sm">
          <p className="label-cap mb-2">
            {routeTitle}
            <span className="ml-2 normal-case tracking-normal text-stone-400">
              {route.stops.length} {t('站', 'stops')}
            </span>
          </p>
          <div className="max-h-[32vh] space-y-0.5 overflow-y-auto pr-1 md:max-h-none">
            {route.stops.map((s, i) => {
              const active = stop.id === s.id
              return (
                <button
                  key={`${s.id}-${i}`}
                  type="button"
                  onClick={() => pickStop(s)}
                  className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left transition ${
                    active
                      ? 'bg-[#0099A8]/10 font-bold text-stone-900 shadow-[inset_3px_0_0_0_#0099A8]'
                      : 'text-stone-700 hover:bg-stone-50'
                  }`}
                >
                  <span
                    className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md text-[11px] font-bold tabular-nums ${
                      active ? 'bg-[#0099A8] text-white' : 'bg-stone-100 text-stone-600'
                    }`}
                  >
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px]">
                    {lang === 'tc' ? s.name_tc : s.name_en}
                  </span>
                  <span className="flex-shrink-0 text-[10px] font-semibold uppercase tracking-wide text-stone-400">
                    {s.code}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </aside>

      {/* ─────────── 右邊：實時班次板 ─────────── */}
      <div className="flex min-h-0 flex-1 flex-col px-3 pt-3 md:overflow-hidden md:px-0 md:pt-0">
        <div className="flex min-h-0 flex-col md:flex-1 md:overflow-hidden md:rounded-2xl md:border md:border-stone-200/80 md:bg-white md:shadow-sm">
          {/* 板頭 */}
          <div className="flex items-center justify-between gap-3 border-b border-stone-200/70 px-4 py-3">
            <div className="min-w-0">
              <p className="label-cap flex items-center gap-1.5">
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: LR_COLOR }}
                />
                {t('輕鐵實時班次', 'Light Rail live departures')}
              </p>
              <h2 className="truncate text-[17px] font-bold tracking-tight">
                {stopName}
              </h2>
              <p className="mt-0.5 truncate text-[11px] text-stone-500">
                {routeTitle}
              </p>
            </div>
            <div className="flex flex-shrink-0 items-center gap-1.5">
              {loading && (
                <span className="text-[11px] font-medium text-stone-500">
                  {t('更新中…', 'Updating…')}
                </span>
              )}
              {updatedAt && !loading && (
                <span className="hidden items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-800 sm:flex">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  </span>
                  {t('實時 · 每 20 秒更新', 'Live · every 20s')}
                </span>
              )}
              <button
                type="button"
                onClick={() => load(stop, true)}
                disabled={loading}
                className="inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-[11px] font-semibold text-stone-600 transition hover:border-stone-400 disabled:opacity-40"
              >
                <IconRefresh className="h-3 w-3" />
                {t('更新', 'Refresh')}
              </button>
            </div>
          </div>

          {/* 板身 */}
          <div ref={stopRef} className="min-h-0 flex-1 md:overflow-y-auto">
            {loading && (
              <div className="space-y-2 p-3 md:p-4">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div
                    key={i}
                    className="h-14 animate-pulse rounded-xl border border-stone-100 bg-stone-50"
                  />
                ))}
              </div>
            )}

            {!loading && error && (
              <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
                <p className="text-sm font-bold">{t('載入失敗', 'Failed to load')}</p>
                <p className="mt-1 max-w-xs break-words text-xs leading-relaxed text-stone-500">
                  {error}
                </p>
                <button
                  type="button"
                  onClick={() => load(stop, true)}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-stone-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-stone-700"
                >
                  <IconRefresh className="h-3.5 w-3.5" />
                  {t('再試一次', 'Retry')}
                </button>
              </div>
            )}

            {!loading && !error && !hasDepartures && (
              <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-stone-100 text-stone-400">
                  <IconTrain className="h-6 w-6" />
                </div>
                <h3 className="text-sm font-bold">
                  {t('呢個站暫時冇班次', 'No departures right now')}
                </h3>
                <p className="mt-1 max-w-xs text-xs leading-relaxed text-stone-500">
                  {t(
                    '可能係尾班車已開出，或者服務未開始。試下另一個站，或者遲啲再睇。',
                    'The last train may have left, or service has not started yet. Try another stop or check again later.'
                  )}
                </p>
              </div>
            )}

            {!loading &&
              !error &&
              groups.map((g) => {
                if (!g.departures.length) return null
                return (
                  <div key={g.platform} className="border-b border-stone-100 last:border-0">
                    <div className="flex items-center gap-2 border-b border-stone-200/70 bg-stone-50/70 px-3 py-2 md:px-4">
                      <p className="label-cap">
                        {t(`${g.platform} 號月台`, `Platform ${g.platform}`)}
                      </p>
                      <span className="text-[10px] font-medium tabular-nums text-stone-400">
                        {g.departures.length} {t('班', 'trains')}
                      </span>
                      {updatedAt && (
                        <span className="ml-auto text-[10px] tabular-nums text-stone-400">
                          {t('更新 ', 'Updated ')}
                          {updatedAt}
                        </span>
                      )}
                    </div>
                    <div>
                      {g.departures.map((d, i) => (
                        <div
                          key={`${d.routeNo}-${d.dest_en}-${i}`}
                          className="fade-up grid grid-cols-[3rem_minmax(0,1fr)_auto] items-center gap-x-2 border-b border-stone-100 px-3 py-2.5 last:border-0 hover:bg-stone-50 md:px-4"
                        >
                          <span
                            className="flex h-8 items-center justify-center rounded-lg text-[13px] font-black tabular-nums text-white"
                            style={{ backgroundColor: LR_COLOR }}
                          >
                            {d.routeNo}
                          </span>
                          <div className="min-w-0">
                            <span className="block truncate text-[13px] font-semibold md:text-sm">
                              {t('往 ', 'To ')}
                              {lang === 'tc' ? d.dest_tc : d.dest_en}
                            </span>
                            {d.cars != null && (
                              <span className="mt-0.5 block text-[10px] font-medium text-stone-400">
                                {t(`${d.cars} 卡`, `${d.cars} car${d.cars > 1 ? 's' : ''}`)}
                              </span>
                            )}
                          </div>
                          <span
                            className={`inline-flex min-w-[4.5rem] flex-col items-center justify-center rounded-lg px-2 py-1 leading-tight ${
                              d.status === 'departing'
                                ? 'bg-amber-100 text-amber-900'
                                : d.status === 'arriving'
                                ? 'bg-emerald-100 text-emerald-900'
                                : 'bg-stone-100 text-stone-700'
                            }`}
                          >
                            <span className="text-[13px] font-bold tabular-nums">
                              {timeText(d)}
                            </span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
          </div>
        </div>
        <p className="px-4 py-3 text-center text-xs text-stone-500">
          {t(
            '班次資料嚟自港鐵開放數據，每 20 秒自動更新。',
            'Departure data from MTR open data, auto-refreshed every 20 seconds.'
          )}
        </p>
      </div>
    </div>
  )
}
