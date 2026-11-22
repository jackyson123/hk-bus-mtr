import { useState, useEffect, useCallback, useMemo } from 'react'
import { MTR_LINES, MTR_STATIONS, stationDisplayName, STATION_COORDS } from '../lib/mtrData'
import { getMtrSchedule } from '../lib/api'
import MapView from './MapView'
import { IconMap, IconRefresh, IconTrain } from './Icons'
import type { Lang, MtrSchedule, BusStop } from '../types'

interface Props {
  lang: Lang
}

function formatArrival(t: MtrSchedule, lang: Lang): { main: string; sub: string } {
  const ttnt = t.ttnt
  let main: string
  if (!Number.isFinite(ttnt)) {
    main = '—'
  } else if (ttnt <= 0) {
    main = lang === 'tc' ? '即將到達' : 'Arriving'
  } else if (ttnt === 1) {
    main = lang === 'tc' ? '1 分鐘' : '1 min'
  } else {
    main = lang === 'tc' ? `${ttnt} 分鐘` : `${ttnt} mins`
  }

  let sub = ''
  if (t.time) {
    const d = new Date(t.time.replace(' ', 'T') + '+08:00')
    if (!isNaN(d.getTime())) {
      const hh = String(d.getHours()).padStart(2, '0')
      const mm = String(d.getMinutes()).padStart(2, '0')
      sub = `${hh}:${mm}`
    }
  }
  return { main, sub }
}

export default function MtrPanel({ lang }: Props) {
  const [line, setLine] = useState('TCL')
  const [station, setStation] = useState('HOK')
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
        `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`
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
      setStation(list[0].code)
    }
  }, [line])

  const upLabel = useMemo(() => {
    if (up[0]?.dest) {
      return lang === 'tc'
        ? `往 ${stationDisplayName(up[0].dest, lang)}`
        : `To ${stationDisplayName(up[0].dest, lang)}`
    }
    return lang === 'tc' ? '上行' : 'UP'
  }, [up, lang])

  const downLabel = useMemo(() => {
    if (down[0]?.dest) {
      return lang === 'tc'
        ? `往 ${stationDisplayName(down[0].dest, lang)}`
        : `To ${stationDisplayName(down[0].dest, lang)}`
    }
    return lang === 'tc' ? '下行' : 'DOWN'
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

  const renderTrains = (list: MtrSchedule[], title: string) => (
    <section className="w-full">
      <h3 className="mb-2.5 flex items-center gap-2 text-[13px] font-bold tracking-tight text-stone-800">
        <span
          className="h-2.5 w-2.5 rounded-full"
          style={{ background: currentLine?.color || '#57534e' }}
        />
        <span className="truncate">{title}</span>
        <span className="ml-auto rounded-md bg-stone-100 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-stone-500">
          {list.length}
        </span>
      </h3>
      {list.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-200 bg-stone-50 px-4 py-8 text-center text-sm text-stone-500">
          {lang === 'tc' ? '暫時沒有班次' : 'No trains right now'}
        </div>
      ) : (
        <ul className="space-y-2">
          {list.map((t, i) => {
            const destName = stationDisplayName(t.dest, lang)
            const { main, sub } = formatArrival(t, lang)
            const isNext = i === 0
            return (
              <li
                key={`${t.direction}-${t.seq}-${i}`}
                className={`fade-up rounded-2xl border px-3.5 py-3 transition ${
                  isNext
                    ? 'border-emerald-300 bg-emerald-50/80 shadow-[0_0_0_3px_rgba(16,185,129,0.08)]'
                    : 'border-stone-200/80 bg-white hover:border-stone-300'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-bold leading-tight">
                      {lang === 'tc' ? '往' : 'To'} {destName}
                    </p>
                    <p className="mt-1.5 flex items-center gap-2 text-[11px] text-stone-600">
                      {t.plat && (
                        <span>
                          {lang === 'tc' ? '月台' : 'Plat'}{' '}
                          <strong className="text-[13px] font-bold text-stone-900">
                            {t.plat}
                          </strong>
                        </span>
                      )}
                      {sub && (
                        <span className="tabular-nums">
                          {lang === 'tc' ? '預計' : 'ETA'}{' '}
                          <strong className="text-[13px] font-bold text-stone-900">
                            {sub}
                          </strong>
                        </span>
                      )}
                      {isNext && (
                        <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[9px] font-bold text-white">
                          {lang === 'tc' ? '下一班' : 'Next'}
                        </span>
                      )}
                    </p>
                  </div>
                  <p
                    className={`flex-shrink-0 text-right text-2xl font-black tabular-nums leading-none tracking-tight ${
                      isNext ? 'text-emerald-700' : 'text-stone-800'
                    }`}
                  >
                    {main}
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
    <div className="col-span-full flex min-h-0 flex-col md:overflow-hidden xl:grid xl:grid-cols-[330px_minmax(0,1fr)_minmax(360px,31%)]">
      {/* ── Controls ── */}
      <div className="flex-shrink-0 md:overflow-y-auto md:border-r md:border-stone-200/70 md:px-4 md:py-4 md:pr-2">
        <div className="sticky top-[56px] z-30 border-b border-stone-200/70 bg-[#f5f4f2]/95 px-3 pb-2.5 pt-3 backdrop-blur md:static md:rounded-2xl md:border md:border-stone-200/80 md:bg-white md:p-3.5 md:shadow-card md:backdrop-blur-none">
          <p className="label-cap mb-2 hidden items-center gap-1.5 md:flex">
            <IconTrain className="h-3.5 w-3.5" />
            {lang === 'tc' ? '港鐵路線' : 'MTR line'}
          </p>

          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 md:mx-0 md:grid md:grid-cols-2 md:gap-1.5 md:overflow-visible md:px-0 md:pb-0">
            {MTR_LINES.map((l) => {
              const active = line === l.code
              return (
                <button
                  key={l.code}
                  onClick={() => setLine(l.code)}
                  className={`flex flex-shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-2 text-[11px] font-semibold transition md:w-full md:text-xs ${
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

          <div className="mt-2.5 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-[13px] font-bold">
                {lang === 'tc' ? currentLine?.name_tc : currentLine?.name_en}
                <span className="font-medium text-stone-500">
                  {' · '}
                  {lang === 'tc'
                    ? currentStation?.name_tc
                    : currentStation?.name_en}
                </span>
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
                onClick={load}
                className="btn-ghost px-2 py-2"
                title={lang === 'tc' ? '更新' : 'Refresh'}
              >
                <IconRefresh className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setMapOpen((v) => !v)}
                className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-2 text-[11px] font-semibold transition xl:hidden ${
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

      {/* ── Map ── */}
      <div
        className={`${
          mapOpen ? 'block' : 'hidden xl:block'
        } flex-shrink-0 px-3 pt-3 md:px-4 md:pt-4 xl:col-start-3 xl:row-start-1 xl:py-4 xl:pl-0 xl:pr-4`}
      >
        <div className="relative h-44 overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-card md:h-52 xl:h-full">
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
            />
          )}
        </div>
      </div>

      {/* ── Trains ── */}
      <div className="min-h-0 flex-1 px-3 pt-4 md:overflow-y-auto md:px-4 md:py-4 xl:col-start-2 xl:row-start-1">
        <div className="mb-3 hidden items-center justify-between gap-3 border-b border-stone-200/70 pb-2.5 md:flex">
          <div>
            <p className="label-cap">{lang === 'tc' ? '實時班次' : 'Live trains'}</p>
            <h2 className="truncate text-[17px] font-bold tracking-tight">
              {lang === 'tc' ? currentLine?.name_tc : currentLine?.name_en}
              <span className="text-stone-400"> · </span>
              {lang === 'tc' ? currentStation?.name_tc : currentStation?.name_en}
            </h2>
          </div>
          <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-800">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
            </span>
            {lang === 'tc' ? '每 20 秒更新' : 'Every 20s'}
          </span>
        </div>

        {loading && !up.length && !down.length ? (
          <div className="space-y-2.5 md:grid md:grid-cols-2 md:gap-4 md:space-y-0">
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
          <div className="space-y-6 pb-6 md:grid md:grid-cols-2 md:gap-5 md:space-y-0">
            {renderTrains(up, upLabel)}
            {renderTrains(down, downLabel)}
          </div>
        )}
      </div>
    </div>
  )
}
