import { useState, useEffect, useCallback, useMemo } from 'react'
import { MTR_LINES, MTR_STATIONS, stationDisplayName, STATION_COORDS } from '../lib/mtrData'
import { getMtrSchedule } from '../lib/api'
import MapView from './MapView'
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
      <h3
        className="text-base font-bold mb-3 flex items-center gap-2"
        style={{ color: currentLine?.color || '#57534e' }}
      >
        <span
          className="w-3 h-3 rounded-full"
          style={{ background: currentLine?.color }}
        />
        {title}
      </h3>
      {list.length === 0 ? (
        <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-8 text-center text-stone-600 text-base">
          {lang === 'tc' ? '暫時沒有班次' : 'No trains right now'}
        </div>
      ) : (
        <ul className="space-y-3">
          {list.map((t, i) => {
            const destName = stationDisplayName(t.dest, lang)
            const { main, sub } = formatArrival(t, lang)
            const isNext = i === 0
            return (
              <li
                key={`${t.direction}-${t.seq}-${i}`}
                className={`rounded-2xl px-4 py-4 border-2 ${
                  isNext
                    ? 'bg-emerald-50 border-emerald-500'
                    : 'bg-white border-stone-200'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-xl leading-tight">
                      {lang === 'tc' ? '往' : 'To'} {destName}
                    </p>
                    <p className="mt-2 text-base text-stone-600">
                      {t.plat && (
                        <>
                          {lang === 'tc' ? '月台' : 'Plat'}{' '}
                          <strong className="text-stone-900 text-lg">{t.plat}</strong>
                          {'  ·  '}
                        </>
                      )}
                      {sub && (
                        <>
                          {lang === 'tc' ? '預計' : 'ETA'}{' '}
                          <strong className="text-stone-900 text-lg tabular-nums">{sub}</strong>
                        </>
                      )}
                    </p>
                    {isNext && (
                      <span className="inline-block mt-2 text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-600 text-white">
                        {lang === 'tc' ? '下一班' : 'Next'}
                      </span>
                    )}
                  </div>
                  <div
                    className={`text-right flex-shrink-0 ${
                      isNext ? 'text-emerald-700' : 'text-stone-800'
                    }`}
                  >
                    <p className="text-3xl font-black tabular-nums leading-none whitespace-nowrap">
                      {main}
                    </p>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )

  return (
    <div className="pb-8">
      {/* Sticky compact header */}
      <div className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-stone-200 px-3 pt-3 pb-2 space-y-2">
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
          {MTR_LINES.map((l) => {
            const active = line === l.code
            return (
              <button
                key={l.code}
                onClick={() => setLine(l.code)}
                className={`flex-shrink-0 px-3 py-2 rounded-lg text-xs font-semibold border ${
                  active ? 'text-white border-transparent' : 'bg-stone-50 text-stone-700 border-stone-200'
                }`}
                style={active ? { backgroundColor: l.color } : undefined}
              >
                {lang === 'tc' ? l.name_tc : l.name_en}
              </button>
            )
          })}
        </div>

        <select
          value={station}
          onChange={(e) => setStation(e.target.value)}
          className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-3 text-base font-semibold"
        >
          {stations.map((s) => (
            <option key={s.code} value={s.code}>
              {lang === 'tc' ? s.name_tc : s.name_en}
            </option>
          ))}
        </select>

        <div className="flex items-center justify-between gap-2 text-sm">
          <div className="min-w-0 font-bold truncate">
            {lang === 'tc' ? currentLine?.name_tc : currentLine?.name_en}
            {' · '}
            {lang === 'tc' ? currentStation?.name_tc : currentStation?.name_en}
            {updatedAt && (
              <span className="font-normal text-stone-600 text-xs ml-2">
                {updatedAt}
              </span>
            )}
            {isDelay && (
              <span className="text-amber-600 text-xs ml-1">⚠</span>
            )}
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={load}
              className="px-2.5 py-1.5 rounded-lg border border-stone-200 text-xs"
            >
              🔄
            </button>
            <button
              type="button"
              onClick={() => setMapOpen((v) => !v)}
              className="px-2.5 py-1.5 rounded-lg border border-stone-200 text-xs font-medium"
            >
              {mapOpen
                ? lang === 'tc'
                  ? '收地圖'
                  : 'Hide map'
                : lang === 'tc'
                ? '地圖'
                : 'Map'}
            </button>
          </div>
        </div>
      </div>

      {/* MAP optional — after controls, before trains, only if open */}
      {mapOpen && lineStops.length > 0 && (
        <div className="mx-3 mt-3 h-36 rounded-xl overflow-hidden border border-stone-200 relative">
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
        </div>
      )}

      {/* TRAINS — full natural height, page scrolls */}
      <div className="px-3 pt-4 space-y-8">
        {loading && !up.length && !down.length ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 bg-stone-100 rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : error ? (
          <div className="text-center text-red-600 p-6 bg-red-50 rounded-2xl">
            {error}
            <button onClick={load} className="block mx-auto mt-2 underline text-sm text-stone-700">
              {lang === 'tc' ? '重試' : 'Retry'}
            </button>
          </div>
        ) : (
          <>
            {renderTrains(up, upLabel)}
            {renderTrains(down, downLabel)}
          </>
        )}
      </div>
    </div>
  )
}
