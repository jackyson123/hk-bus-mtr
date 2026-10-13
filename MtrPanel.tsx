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

  const load = useCallback(async () => {
    if (!line || !station) return
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
    } catch (e: any) {
      setError(e.message || 'Failed to load')
      setUp([])
      setDown([])
    } finally {
      setLoading(false)
    }
  }, [line, station, lang])

  useEffect(() => {
    load()
    const t = setInterval(load, 20000)
    return () => clearInterval(t)
  }, [load])

  useEffect(() => {
    const list = MTR_STATIONS[line] || []
    if (list.length && !list.find((s) => s.code === station)) {
      setStation(list[0].code)
    }
  }, [line])

  const upLabel = useMemo(() => {
    if (up[0]?.dest) {
      const name = stationDisplayName(up[0].dest, lang)
      return lang === 'tc' ? `往 ${name}` : `To ${name}`
    }
    return lang === 'tc' ? '上行' : 'UP'
  }, [up, lang])

  const downLabel = useMemo(() => {
    if (down[0]?.dest) {
      const name = stationDisplayName(down[0].dest, lang)
      return lang === 'tc' ? `往 ${name}` : `To ${name}`
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
    <div className="min-w-0 w-full">
      <div
        className="text-base font-bold mb-2.5 px-1 flex items-center gap-2"
        style={{ color: currentLine?.color || '#78716c' }}
      >
        <span
          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
          style={{ background: currentLine?.color }}
        />
        {title}
      </div>
      {list.length === 0 ? (
        <div className="rounded-2xl bg-stone-50 border border-stone-200 px-4 py-8 text-center text-base text-stone-400">
          {lang === 'tc' ? '暫時沒有班次' : 'No trains right now'}
        </div>
      ) : (
        <div className="space-y-3">
          {list.map((t, i) => {
            const destName = stationDisplayName(t.dest, lang)
            const { main, sub } = formatArrival(t, lang)
            const isNext = i === 0
            return (
              <div
                key={`${t.direction}-${t.seq}-${i}`}
                className={`rounded-2xl px-4 py-4 border-2 transition ${
                  isNext
                    ? 'bg-emerald-50 border-emerald-400 shadow-sm'
                    : 'bg-white border-stone-200'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-lg sm:text-xl leading-snug">
                      {lang === 'tc' ? '往' : 'To'} {destName}
                    </div>
                    <div className="text-sm text-stone-600 mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
                      {t.plat && (
                        <span>
                          {lang === 'tc' ? '月台' : 'Plat'}{' '}
                          <span className="text-stone-900 font-bold text-base">{t.plat}</span>
                        </span>
                      )}
                      {sub && (
                        <span>
                          {lang === 'tc' ? '預計' : 'ETA'}{' '}
                          <span className="tabular-nums text-stone-900 font-bold text-base">
                            {sub}
                          </span>
                        </span>
                      )}
                    </div>
                    {isNext && (
                      <span className="inline-block mt-2 text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-500 text-white">
                        {lang === 'tc' ? '下一班' : 'Next'}
                      </span>
                    )}
                  </div>
                  <div
                    className={`flex-shrink-0 text-right min-w-[5.5rem] ${
                      isNext ? 'text-emerald-700' : 'text-stone-800'
                    }`}
                  >
                    <div className="text-2xl sm:text-3xl font-black tabular-nums leading-none">
                      {main}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Compact controls */}
      <div className="flex-shrink-0 p-3 space-y-2 border-b border-stone-200 bg-white">
        <div className="flex flex-wrap gap-1.5">
          {MTR_LINES.map((l) => {
            const active = line === l.code
            return (
              <button
                key={l.code}
                onClick={() => setLine(l.code)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition border ${
                  active
                    ? 'text-white border-transparent shadow'
                    : 'bg-stone-50 text-stone-700 border-stone-200'
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
          className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-3 text-base font-medium focus:outline-none focus:ring-2 focus:ring-stone-400"
        >
          {stations.map((s) => (
            <option key={s.code} value={s.code}>
              {lang === 'tc' ? s.name_tc : s.name_en}
            </option>
          ))}
        </select>

        <div
          className="rounded-xl px-3 py-2 text-sm flex items-center justify-between gap-2 border"
          style={{
            borderColor: (currentLine?.color || '#a8a29e') + '55',
            background: (currentLine?.color || '#a8a29e') + '14',
          }}
        >
          <div className="min-w-0">
            <div className="font-bold truncate text-base">
              {lang === 'tc' ? currentLine?.name_tc : currentLine?.name_en}
              {' · '}
              {lang === 'tc' ? currentStation?.name_tc : currentStation?.name_en}
            </div>
            <div className="text-xs text-stone-500 mt-0.5">
              {updatedAt
                ? `${lang === 'tc' ? '更新' : 'Updated'} ${updatedAt}`
                : lang === 'tc'
                ? '載入中…'
                : 'Loading…'}
              {isDelay && (
                <span className="ml-2 text-amber-600 font-semibold">
                  ⚠ {lang === 'tc' ? '可能延誤' : 'Delay'}
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setMapOpen((v) => !v)}
            className="flex-shrink-0 text-xs font-medium px-3 py-2 rounded-lg bg-white border border-stone-200 text-stone-700"
          >
            {mapOpen
              ? lang === 'tc'
                ? '收起地圖'
                : 'Hide map'
              : lang === 'tc'
              ? '顯示地圖'
              : 'Show map'}
          </button>
        </div>
      </div>

      {/* Collapsible map — default hidden on mobile to leave room for ETAs */}
      {mapOpen && lineStops.length > 0 && (
        <div className="flex-shrink-0 border-b border-stone-200 h-40 relative">
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
          <div className="absolute bottom-2 left-2 z-[500] bg-white/95 text-[10px] text-stone-600 px-2 py-1 rounded-lg border border-stone-200">
            {lang === 'tc' ? '點站可切換車站' : 'Tap station to switch'}
          </div>
        </div>
      )}

      {/* Train lists — primary focus, scrollable */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3 pb-6">
        {loading && !up.length && !down.length ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 bg-stone-100 rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : error ? (
          <div className="text-red-600 text-base p-4 text-center rounded-2xl bg-red-50 border border-red-200">
            {error}
            <button
              onClick={load}
              className="block mx-auto mt-3 text-stone-700 underline text-sm"
            >
              {lang === 'tc' ? '重試' : 'Retry'}
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {renderTrains(up, upLabel)}
            {renderTrains(down, downLabel)}
          </div>
        )}

        <div className="text-center pt-4">
          <button
            onClick={load}
            disabled={loading}
            className="text-sm text-stone-500 hover:text-stone-800 disabled:opacity-50 px-4 py-2"
          >
            {loading
              ? lang === 'tc'
                ? '更新中…'
                : 'Refreshing…'
              : lang === 'tc'
              ? '🔄 手動更新'
              : '🔄 Refresh'}
          </button>
        </div>
      </div>
    </div>
  )
}
