import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  MTR_LINES,
  MTR_STATIONS,
  stationDisplayName,
  STATION_COORDS,
} from '../lib/mtrData'
import { getMtrSchedule } from '../lib/api'
import MapView from './MapView'
import { IconMap, IconRefresh, IconTrain, IconStar, IconChevron } from './Icons'
import type { Lang, MtrSchedule, BusStop } from '../types'
import type { FavMtr } from '../lib/favorites'

interface Props {
  lang: Lang
  /** 目前選中嘅線／站（由 App 控制，方便由收藏一鍵跳入） */
  line: string
  station: string
  onSelect: (line: string, station: string) => void
  favMtr: FavMtr[]
  isMtrFav: (v: { line: string; station: string }) => boolean
  toggleMtrFav: (item: Omit<FavMtr, 'savedAt'>) => void
  removeMtrFav: (v: { line: string; station: string }) => void
  showToast: (msg: string) => void
  onOpenFavorites: () => void
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** 把班次資料拆成「到站分鐘 / 即將到達 / 預計時鐘」 */
function arrival(t: MtrSchedule): {
  arriving: boolean
  minutes: number | null
  clock: string
} {
  const ttnt = t.ttnt
  const known = Number.isFinite(ttnt)
  const arriving = known && ttnt <= 0
  const minutes = known && ttnt > 0 ? Math.round(ttnt) : null
  let clock = ''
  if (t.time) {
    const d = new Date(t.time.replace(' ', 'T') + '+08:00')
    if (!isNaN(d.getTime())) {
      clock = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
    }
  }
  return { arriving, minutes, clock }
}

export default function MtrPanel({
  lang,
  line,
  station,
  onSelect,
  favMtr,
  isMtrFav,
  toggleMtrFav,
  removeMtrFav,
  showToast,
  onOpenFavorites,
}: Props) {
  const [up, setUp] = useState<MtrSchedule[]>([])
  const [down, setDown] = useState<MtrSchedule[]>([])
  const [isDelay, setIsDelay] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [mapOpen, setMapOpen] = useState(false)

  const stations = MTR_STATIONS[line] || []
  const currentLine = MTR_LINES.find((l) => l.code === line)
  const currentStation = stations.find((s) => s.code === station)
  const lineColor = currentLine?.color || '#57534e'
  const lineName = currentLine ? (lang === 'tc' ? currentLine.name_tc : currentLine.name_en) : ''
  const stationName = currentStation
    ? lang === 'tc'
      ? currentStation.name_tc
      : currentStation.name_en
    : ''

  const setLine = useCallback(
    (code: string) => {
      const list = MTR_STATIONS[code] || []
      const keep = list.some((s) => s.code === station) ? station : list[0]?.code
      if (keep) onSelect(code, keep)
    },
    [onSelect, station]
  )

  const setStation = useCallback(
    (code: string) => {
      onSelect(line, code)
    },
    [onSelect, line]
  )

  const load = useCallback(async (): Promise<boolean> => {
    if (!line || !station) return false
    setLoading(true)
    setError(null)
    try {
      const res = await getMtrSchedule(line, station, lang === 'tc' ? 'TC' : 'EN')
      setUp(res.up)
      setDown(res.down)
      setIsDelay(res.isDelay)
      const now = new Date()
      setUpdatedAt(
        `${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`
      )
      setLoading(false)
      // 有資料或明確無班次都算成功
      return true
    } catch (e: any) {
      setError(e.message || 'Failed to load')
      setLoading(false)
      return false
    }
  }, [line, station, lang])

  useEffect(() => {
    let cancelled = false
    let retryTimer: number | undefined
    let intervalTimer: number | undefined

    const run = async () => {
      let ok = await load()
      // 失敗自動重試最多 4 次，唔使用家撳
      for (let i = 0; !ok && !cancelled && i < 4; i++) {
        await new Promise<void>((resolve) => {
          retryTimer = window.setTimeout(resolve, 1200 * (i + 1))
        })
        if (cancelled) return
        ok = await load()
      }
      if (!cancelled) {
        intervalTimer = window.setInterval(() => {
          load()
        }, 20000)
      }
    }
    run()
    return () => {
      cancelled = true
      if (retryTimer) window.clearTimeout(retryTimer)
      if (intervalTimer) window.clearInterval(intervalTimer)
    }
  }, [load])

  useEffect(() => {
    const list = MTR_STATIONS[line] || []
    if (list.length && !list.find((s) => s.code === station)) {
      onSelect(line, list[0].code)
    }
  }, [line, station, onSelect])

  const upLabel = useMemo(() => {
    const dests = [...new Set(up.map((t) => t.dest).filter(Boolean))]
    if (!dests.length) return lang === 'tc' ? '上行' : 'UP'
    const names = dests.map((d) => stationDisplayName(d, lang))
    const label =
      names.length === 1
        ? names[0]
        : names.length === 2
        ? `${names[0]}／${names[1]}`
        : `${names[0]} ${lang === 'tc' ? '等' : '& more'}`
    return lang === 'tc' ? `往 ${label}` : `To ${label}`
  }, [up, lang])

  const downLabel = useMemo(() => {
    const dests = [...new Set(down.map((t) => t.dest).filter(Boolean))]
    if (!dests.length) return lang === 'tc' ? '下行' : 'DOWN'
    const names = dests.map((d) => stationDisplayName(d, lang))
    const label =
      names.length === 1
        ? names[0]
        : names.length === 2
        ? `${names[0]}／${names[1]}`
        : `${names[0]} ${lang === 'tc' ? '等' : '& more'}`
    return lang === 'tc' ? `往 ${label}` : `To ${label}`
  }, [down, lang])

  const lineStops: BusStop[] = useMemo(
    () =>
      stations
        .filter((s) => STATION_COORDS[s.code])
        .map((s) => {
          const c = STATION_COORDS[s.code]
          return {
            id: s.code,
            name_tc: s.name_tc,
            name_en: s.name_en,
            lat: c.lat,
            lng: c.lng,
            operator: 'MTR' as const,
          }
        }),
    [stations]
  )

  const isCurrentFav = isMtrFav({ line, station })

  const toggleCurrentFav = () => {
    if (!currentLine || !currentStation) return
    toggleMtrFav({
      line,
      station,
      line_tc: currentLine.name_tc,
      line_en: currentLine.name_en,
      station_tc: currentStation.name_tc,
      station_en: currentStation.name_en,
      color: currentLine.color,
    })
    showToast(
      isCurrentFav
        ? lang === 'tc'
          ? '已取消收藏'
          : 'Removed favourite'
        : lang === 'tc'
        ? '已收藏港鐵站'
        : 'Saved MTR station'
    )
  }

  const gotoFav = (f: FavMtr) => {
    onSelect(f.line, f.station)
    showToast(
      lang === 'tc'
        ? `已跳去 ${f.line_tc} · ${f.station_tc}`
        : `Jumped to ${f.line_en} · ${f.station_en}`
    )
  }

  /** 收藏車站嘅小晶片（線色點 + 線名簡寫 · 站名） */
  const renderFavChip = (f: FavMtr, compact?: boolean) => {
    const activeFav = f.line === line && f.station === station
    return (
      <div
        key={`${f.line}-${f.station}`}
        className={`flex items-center gap-0.5 rounded-lg border pr-0.5 transition ${
          activeFav
            ? 'border-stone-900 bg-stone-900 text-white'
            : 'border-stone-200 bg-white text-stone-700 hover:border-stone-300'
        }`}
      >
        <button
          type="button"
          onClick={() => gotoFav(f)}
          className="flex min-w-0 items-center gap-1.5 px-2 py-1.5 text-left text-[11px] font-semibold"
          title={`${f.line_tc} · ${f.station_tc}`}
        >
          <span
            className="h-2 w-2 flex-shrink-0 rounded-full"
            style={{ background: activeFav ? '#fff' : f.color }}
          />
          <span className="truncate">
            {compact
              ? lang === 'tc'
                ? f.station_tc
                : f.station_en
              : lang === 'tc'
              ? `${f.line_tc.replace('綫', '')} · ${f.station_tc}`
              : `${f.line_en} · ${f.station_en}`}
          </span>
        </button>
        <button
          type="button"
          onClick={() => removeMtrFav({ line: f.line, station: f.station })}
          className={`px-1 py-1 text-[10px] transition ${
            activeFav
              ? 'text-white/60 hover:text-white'
              : 'text-stone-300 hover:text-stone-700'
          }`}
          title={lang === 'tc' ? '移除' : 'Remove'}
          aria-label={lang === 'tc' ? '移除收藏' : 'Remove favourite'}
        >
          ✕
        </button>
      </div>
    )
  }

  /** 一個方向：標題 + 班次卡（手機單欄、電腦兩欄） */
  const renderDirection = (list: MtrSchedule[], title: string) => (
    <section className="min-w-0 md:rounded-2xl md:border md:border-stone-200/80 md:bg-white md:p-3.5 md:shadow-card">
      <h3 className="mb-2 flex items-center gap-2 md:mb-2.5">
        <span
          className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
          style={{ background: lineColor }}
        />
        <span className="truncate text-[13px] font-bold tracking-tight text-stone-800">
          {title}
        </span>
        <span className="ml-auto rounded-md bg-stone-100 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-stone-500">
          {list.length} {lang === 'tc' ? '班' : 'trains'}
        </span>
      </h3>

      {list.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-200 bg-stone-50 px-4 py-7 text-center text-[13px] text-stone-500 md:py-8">
          {lang === 'tc' ? '此方向暫時沒有班次' : 'No trains this direction'}
        </div>
      ) : (
        <ul className="space-y-2">
          {list.map((t, i) => {
            const destName = stationDisplayName(t.dest, lang)
            const { arriving, minutes, clock } = arrival(t)
            const isNext = i === 0
            return (
              <li
                key={`${t.direction}-${t.seq}-${i}`}
                className={`fade-up rounded-2xl border px-3.5 py-2.5 transition md:px-4 md:py-3 ${
                  isNext
                    ? 'border-emerald-300 bg-emerald-50/80 shadow-[0_0_0_3px_rgba(16,185,129,0.08)]'
                    : 'border-stone-200/80 bg-white hover:border-stone-300'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-[14px] font-bold leading-tight">
                      <span className="truncate">
                        {lang === 'tc' ? '往' : 'To'} {destName}
                      </span>
                      {isNext && (
                        <span className="flex-shrink-0 rounded-full bg-emerald-600 px-1.5 py-0.5 text-[9px] font-bold text-white">
                          {lang === 'tc' ? '下一班' : 'Next'}
                        </span>
                      )}
                    </p>
                    <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-stone-600">
                      {t.plat && (
                        <span>
                          {lang === 'tc' ? '月台' : 'Plat'}{' '}
                          <strong className="text-[12px] font-bold text-stone-900">
                            {t.plat}
                          </strong>
                        </span>
                      )}
                      {clock && (
                        <span className="tabular-nums">
                          {lang === 'tc' ? '預計' : 'ETA'}{' '}
                          <strong className="text-[12px] font-bold text-stone-900">
                            {clock}
                          </strong>
                        </span>
                      )}
                    </p>
                  </div>
                  <p className="flex flex-shrink-0 items-baseline gap-0.5 whitespace-nowrap leading-none">
                    {arriving ? (
                      <span
                        className={`text-[15px] font-black tracking-tight ${
                          isNext ? 'text-emerald-700' : 'text-stone-700'
                        }`}
                      >
                        {lang === 'tc' ? '即將到達' : 'Arriving'}
                      </span>
                    ) : minutes != null ? (
                      <>
                        <span
                          className={`text-2xl font-black tabular-nums tracking-tight ${
                            isNext ? 'text-emerald-700' : 'text-stone-800'
                          }`}
                        >
                          {minutes}
                        </span>
                        <span className="text-[10px] font-bold text-stone-500">
                          {lang === 'tc' ? '分鐘' : 'min'}
                        </span>
                      </>
                    ) : (
                      <span className="text-lg font-black text-stone-400">—</span>
                    )}
                  </p>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )

  return (
    <div data-testid="mtr-panel" className="flex min-h-0 flex-1 flex-col md:h-full md:flex-row md:gap-3 md:overflow-hidden md:p-4 xl:grid xl:grid-cols-[310px_minmax(0,1fr)_minmax(360px,30%)] xl:grid-rows-1">
      {/* ─────────── 路線／車站選擇 ─────────── */}
      <aside data-testid="mtr-aside" className="flex-shrink-0 md:flex md:w-[286px] md:min-h-0 md:flex-col md:gap-3 md:overflow-hidden xl:w-auto">
        {/* 手機：沿用原有操作條 */}
        <div className="md:hidden">
          <div className="sticky top-0 z-30 border-b border-stone-200/70 bg-[#f5f4f2]/95 px-3 pb-2.5 pt-3 backdrop-blur">
            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
              {MTR_LINES.map((l) => {
                const active = line === l.code
                return (
                  <button
                    key={l.code}
                    onClick={() => setLine(l.code)}
                    className={`flex flex-shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-2 text-[11px] font-semibold transition ${
                      active
                        ? 'border-transparent text-white shadow-sm'
                        : 'border-stone-200 bg-stone-50 text-stone-700 hover:bg-white'
                    }`}
                    style={active ? { backgroundColor: l.color } : undefined}
                  >
                    <span
                      className="h-2 w-2 flex-shrink-0 rounded-full"
                      style={{ background: active ? '#fff' : l.color }}
                    />
                    <span className="truncate">
                      {lang === 'tc' ? l.name_tc : l.name_en}
                    </span>
                  </button>
                )
              })}
            </div>

            <select
              value={station}
              onChange={(e) => setStation(e.target.value)}
              className="mt-2.5 h-11 w-full rounded-xl border border-stone-200 bg-stone-50 px-3 text-sm font-semibold text-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-300"
            >
              {stations.map((s) => (
                <option key={s.code} value={s.code}>
                  {lang === 'tc' ? s.name_tc : s.name_en}
                </option>
              ))}
            </select>

            {favMtr.length > 0 && (
              <div className="-mx-1 mt-2 flex gap-1.5 overflow-x-auto px-1 pb-1">
                {favMtr.map((f) => (
                  <div key={`${f.line}-${f.station}`} className="flex-shrink-0">
                    {renderFavChip(f)}
                  </div>
                ))}
              </div>
            )}

            <div className="mt-2.5 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-[13px] font-bold">
                  {lineName}
                  <span className="font-medium text-stone-500"> · {stationName}</span>
                </p>
                <p className="mt-0.5 flex items-center gap-1.5 text-[10px] text-stone-500">
                  {updatedAt && (
                    <span className="tabular-nums">
                      {lang === 'tc' ? '更新 ' : 'Updated '}
                      {updatedAt}
                    </span>
                  )}
                  {isDelay && (
                    <span className="rounded-full bg-amber-100 px-1.5 py-0.5 font-bold text-amber-800">
                      ⚠ {lang === 'tc' ? '延誤' : 'Delay'}
                    </span>
                  )}
                </p>
              </div>
              <div className="flex flex-shrink-0 gap-1.5">
                <button
                  type="button"
                  onClick={toggleCurrentFav}
                  className={`inline-flex items-center justify-center rounded-xl border px-2 py-2 transition ${
                    isCurrentFav
                      ? 'border-amber-300 bg-amber-50 text-amber-600'
                      : 'border-stone-200 bg-white text-stone-500'
                  }`}
                  title={
                    isCurrentFav
                      ? lang === 'tc'
                        ? '已收藏，撳一下取消'
                        : 'Saved — tap to remove'
                      : lang === 'tc'
                      ? '收藏此站'
                      : 'Save this station'
                  }
                  aria-label={lang === 'tc' ? '收藏此站' : 'Save this station'}
                >
                  <IconStar className="h-4 w-4" filled={isCurrentFav} />
                </button>
                <button
                  type="button"
                  onClick={load}
                  className="btn-ghost px-2 py-2"
                  title={lang === 'tc' ? '更新' : 'Refresh'}
                >
                  <IconRefresh className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setMapOpen((v) => !v)}
                  className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-2 text-[11px] font-semibold transition ${
                    mapOpen
                      ? 'border-stone-900 bg-stone-900 text-white'
                      : 'border-stone-200 bg-white text-stone-700'
                  }`}
                >
                  <IconMap className="h-3.5 w-3.5" />
                  {lang === 'tc' ? '地圖' : 'Map'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 電腦：路線卡 + 全部車站按鈕 */}
        <div className="hidden md:flex md:min-h-0 md:flex-1 md:flex-col md:gap-3">
          <section className="rounded-2xl border border-stone-200/80 bg-white p-3 shadow-card">
            <p className="label-cap mb-2 flex items-center gap-1.5">
              <IconTrain className="h-3.5 w-3.5" />
              {lang === 'tc' ? '港鐵路線' : 'MTR line'}
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {MTR_LINES.map((l) => {
                const active = line === l.code
                return (
                  <button
                    key={l.code}
                    onClick={() => setLine(l.code)}
                    className={`flex items-center gap-1.5 rounded-lg border px-2 py-2 text-left text-[11px] font-semibold transition ${
                      active
                        ? 'border-transparent text-white shadow-sm'
                        : 'border-stone-200 bg-stone-50 text-stone-700 hover:bg-white'
                    }`}
                    style={active ? { backgroundColor: l.color } : undefined}
                  >
                    <span
                      className="h-2 w-2 flex-shrink-0 rounded-full"
                      style={{ background: active ? '#fff' : l.color }}
                    />
                    <span className="truncate">
                      {lang === 'tc' ? l.name_tc : l.name_en}
                    </span>
                  </button>
                )
              })}
            </div>
          </section>

          <section className="rounded-2xl border border-stone-200/80 bg-white p-3 shadow-card">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="label-cap flex items-center gap-1.5">
                <IconStar className="h-3.5 w-3.5" filled />
                {lang === 'tc' ? '收藏車站' : 'Saved stations'}
              </p>
              <button
                type="button"
                onClick={onOpenFavorites}
                className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-stone-500 transition hover:text-stone-900"
              >
                {lang === 'tc' ? '全部收藏' : 'All'}
                <IconChevron className="h-3 w-3" />
              </button>
            </div>
            {favMtr.length === 0 ? (
              <p className="text-[11px] leading-relaxed text-stone-500">
                {lang === 'tc'
                  ? '揀好線同站之後，撳站名旁邊嘅 ☆ 就可以收藏，下次一撳跳返嚟。'
                  : 'Pick a line and station, then tap ☆ to save it for one-tap access.'}
              </p>
            ) : (
              <div className="flex max-h-[22vh] flex-wrap gap-1.5 overflow-y-auto pr-0.5">
                {favMtr.map((f) => renderFavChip(f))}
              </div>
            )}
          </section>

          <section className="flex min-h-0 flex-1 flex-col rounded-2xl border border-stone-200/80 bg-white p-3 shadow-card">
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <p className="label-cap flex items-center gap-1.5">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: lineColor }}
                />
                {lang === 'tc' ? '車站' : 'Station'}
              </p>
              <span className="text-[10px] font-semibold tabular-nums text-stone-400">
                {stations.length} {lang === 'tc' ? '站' : 'stops'}
              </span>
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-2 content-start gap-1.5 overflow-y-auto pr-0.5">
              {stations.map((s) => {
                const active = station === s.code
                return (
                  <button
                    key={s.code}
                    onClick={() => setStation(s.code)}
                    className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-left text-[12px] font-semibold transition ${
                      active
                        ? 'border-transparent text-white shadow-sm'
                        : 'border-stone-200 bg-stone-50 text-stone-700 hover:border-stone-300 hover:bg-white'
                    }`}
                    style={active ? { backgroundColor: lineColor } : undefined}
                    aria-pressed={active}
                  >
                    <span
                      className="h-1.5 w-1.5 flex-shrink-0 rounded-full"
                      style={{ background: active ? '#fff' : lineColor }}
                    />
                    <span className="truncate">
                      {lang === 'tc' ? s.name_tc : s.name_en}
                    </span>
                  </button>
                )
              })}
            </div>

            <p className="mt-2 border-t border-stone-100 pt-2 text-[10px] leading-relaxed text-stone-500">
              {lang === 'tc'
                ? '撳任何一個站，即刻睇該站上／下行實時班次。'
                : 'Tap any station for its live up / down trains.'}
            </p>
          </section>
        </div>
      </aside>

      <div data-testid="mtr-body" className="flex min-h-0 flex-1 flex-col xl:contents">
        {/* ─────────── 實時班次 ─────────── */}
        <section data-testid="mtr-board" className="flex min-h-0 flex-col px-3 pt-4 md:overflow-y-auto md:px-0 md:pr-1 md:pt-0">
        <div className="mb-3 hidden items-center justify-between gap-3 rounded-2xl border border-stone-200/80 bg-white px-4 py-3 shadow-card md:flex">
          <div className="flex min-w-0 items-center gap-3">
            <span
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-[12px] font-black text-white shadow-sm"
              style={{ background: lineColor }}
            >
              {line}
            </span>
            <div className="min-w-0">
              <p className="label-cap truncate">{lineName}</p>
              <h2 className="truncate text-[19px] font-bold leading-tight tracking-tight">
                {stationName}
              </h2>
            </div>
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            <div className="text-right">
              <span className="flex items-center justify-end gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-800">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                </span>
                {lang === 'tc' ? '實時 · 每 20 秒更新' : 'Live · every 20s'}
              </span>
              <p className="mt-1 flex items-center justify-end gap-1.5 text-[10px] tabular-nums text-stone-500">
                {updatedAt && (
                  <span>
                    {lang === 'tc' ? '更新 ' : 'Updated '}
                    {updatedAt}
                  </span>
                )}
                {isDelay && (
                  <span className="rounded-full bg-amber-100 px-1.5 py-0.5 font-bold text-amber-800">
                    ⚠ {lang === 'tc' ? '延誤' : 'Delay'}
                  </span>
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={toggleCurrentFav}
              className={`inline-flex flex-shrink-0 items-center gap-1.5 rounded-xl border px-2.5 py-2 text-[11px] font-semibold transition ${
                isCurrentFav
                  ? 'border-amber-300 bg-amber-50 text-amber-700'
                  : 'border-stone-200 bg-white text-stone-600 hover:border-stone-300'
              }`}
              title={
                isCurrentFav
                  ? lang === 'tc'
                    ? '已收藏，撳一下取消'
                    : 'Saved — tap to remove'
                  : lang === 'tc'
                  ? '收藏此站'
                  : 'Save this station'
              }
              aria-label={lang === 'tc' ? '收藏此站' : 'Save this station'}
            >
              <IconStar className="h-4 w-4" filled={isCurrentFav} />
              {lang === 'tc'
                ? isCurrentFav
                  ? '已收藏'
                  : '收藏'
                : isCurrentFav
                ? 'Saved'
                : 'Save'}
            </button>
            <button
              type="button"
              onClick={load}
              className="btn-ghost px-2.5 py-2"
              title={lang === 'tc' ? '更新' : 'Refresh'}
            >
              <IconRefresh className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {loading && !up.length && !down.length ? (
          <div className="space-y-2.5 md:grid md:grid-cols-2 md:gap-2.5 md:space-y-0">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-20 animate-pulse rounded-2xl border border-stone-100 bg-stone-50"
              />
            ))}
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-center text-sm text-red-700">
            {error}
            <button
              onClick={load}
              className="mx-auto mt-2 block text-xs font-semibold text-stone-700 underline"
            >
              {lang === 'tc' ? '重試' : 'Retry'}
            </button>
          </div>
        ) : (
          <div className="space-y-5 pb-6 md:space-y-3 md:pb-0">
            {renderDirection(up, upLabel)}
            {renderDirection(down, downLabel)}
          </div>
        )}
      </section>

      {/* ─────────── 路綫圖 ─────────── */}
      <div
        data-testid="mtr-map"
        className={`${
          mapOpen ? 'block' : 'hidden'
        } flex-shrink-0 px-3 pt-3 md:block md:min-h-[220px] md:flex-1 md:px-0 md:pt-0 xl:flex-none`}
      >
        <div className="relative h-48 overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-card md:h-full">
          <div className="pointer-events-none absolute left-3 top-3 z-10 flex items-center gap-2 rounded-xl border border-stone-200/70 bg-white/92 px-2.5 py-1.5 shadow-sm backdrop-blur">
            <IconMap className="h-3.5 w-3.5 text-stone-500" />
            <span className="text-[11px] font-semibold text-stone-800">
              {lang === 'tc' ? '路綫圖' : 'Line map'}
            </span>
            <span className="text-[10px] font-medium tabular-nums text-stone-500">
              {lineStops.length} {lang === 'tc' ? '站' : 'stops'}
            </span>
          </div>
          {lineStops.length > 0 && (
            <MapView
              userLat={null}
              userLng={null}
              stops={lineStops}
              selectedStopId={station}
              onSelectStop={(s) => setStation(s.id)}
              lang={lang}
              height="100%"
              fitToStops={true}
              fitKey={`mtr-${line}-${station}`}
              showRouteLine={lineStops.length > 1}
              routeColor={lineColor}
            />
          )}
        </div>
      </div>
      </div>
    </div>
  )
}
