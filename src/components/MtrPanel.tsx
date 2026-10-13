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
    main = lang === 'tc' ? '—' : '—'
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

  // Infer direction labels from first train destinations
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

  const renderTrains = (list: MtrSchedule[], title: string) => (
    <div className="flex-1 min-w-0">
      <div
        className="text-sm font-semibold mb-2 px-1 flex items-center gap-2"
        style={{ color: currentLine?.color || '#94a3b8' }}
      >
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: currentLine?.color }} />
        {title}
      </div>
      {list.length === 0 ? (
        <div className="rounded-xl bg-stone-50 border border-stone-200 px-4 py-6 text-center text-sm text-stone-400">
          {lang === 'tc' ? '暫時沒有班次' : 'No trains right now'}
        </div>
      ) : (
        <div className="space-y-2">
          {list.map((t, i) => {
            const destName = stationDisplayName(t.dest, lang)
            const { main, sub } = formatArrival(t, lang)
            const isNext = i === 0
            return (
              <div
                key={`${t.direction}-${t.seq}-${i}`}
                className={`rounded-xl px-4 py-3 border transition ${
                  isNext
                    ? 'bg-emerald-500/10 border-emerald-500/30'
                    : 'bg-stone-100 border-stone-200'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold text-base truncate">
                      {lang === 'tc' ? '往' : 'To'} {destName}
                    </div>
                    <div className="text-xs text-stone-500 mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                      {t.plat && (
                        <span>
                          {lang === 'tc' ? '月台' : 'Platform'}{' '}
                          <span className="text-stone-800 font-medium">{t.plat}</span>
                        </span>
                      )}
                      {sub && (
                        <span>
                          {lang === 'tc' ? '預計' : 'ETA'}{' '}
                          <span className="tabular-nums text-stone-800">{sub}</span>
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div
                      className={`text-lg font-bold tabular-nums leading-tight ${
                        isNext ? 'text-emerald-300' : 'text-stone-800'
                      }`}
                    >
                      {main}
                    </div>
                    {isNext && (
                      <div className="text-[10px] text-emerald-400/80 mt-0.5">
                        {lang === 'tc' ? '下一班' : 'Next'}
                      </div>
                    )}
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
    <div className="flex flex-col h-full">
      {/* Line picker */}
      <div className="p-3 space-y-3 border-b border-stone-200">
        <p className="text-[10px] text-stone-400 uppercase tracking-wider px-0.5">
          {lang === 'tc' ? '① 選擇路線' : '① Choose line'}
        </p>
        <div className="flex flex-wrap gap-2">
          {MTR_LINES.map((l) => {
            const active = line === l.code
            return (
              <button
                key={l.code}
                onClick={() => setLine(l.code)}
                className={`px-3 py-2 rounded-xl text-xs font-semibold transition border ${
                  active
                    ? 'text-white border-transparent shadow-md'
                    : 'bg-stone-100 text-stone-700 border-stone-200 hover:border-stone-400'
                }`}
                style={active ? { backgroundColor: l.color } : undefined}
              >
                {lang === 'tc' ? l.name_tc : l.name_en}
              </button>
            )
          })}
        </div>

        <p className="text-[10px] text-stone-400 uppercase tracking-wider px-0.5">
          {lang === 'tc' ? '② 選擇車站' : '② Choose station'}
        </p>
        <select
          value={station}
          onChange={(e) => setStation(e.target.value)}
          className="w-full bg-stone-100 border border-stone-200 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-stone-400"
        >
          {stations.map((s) => (
            <option key={s.code} value={s.code}>
              {lang === 'tc' ? s.name_tc : s.name_en}
            </option>
          ))}
        </select>

        {/* Context banner */}
        <div
          className="rounded-xl px-3 py-2.5 text-sm flex items-center justify-between gap-2 border"
          style={{
            borderColor: (currentLine?.color || '#334155') + '66',
            background: (currentLine?.color || '#334155') + '18',
          }}
        >
          <div className="min-w-0">
            <div className="font-semibold truncate">
              {lang === 'tc' ? currentLine?.name_tc : currentLine?.name_en}
              {' · '}
              {lang === 'tc' ? currentStation?.name_tc : currentStation?.name_en}
            </div>
            <div className="text-[11px] text-stone-500 mt-0.5">
              {lang === 'tc'
                ? '以下為即將到站列車'
                : 'Upcoming trains at this station'}
              {updatedAt && (
                <span className="ml-2 opacity-70">
                  · {lang === 'tc' ? '更新' : 'Updated'} {updatedAt}
                </span>
              )}
            </div>
          </div>
          {isDelay && (
            <span className="flex-shrink-0 text-amber-400 text-xs font-medium">
              ⚠ {lang === 'tc' ? '可能延誤' : 'Delay'}
            </span>
          )}
        </div>
      </div>

      {/* Station map */}
      {(() => {
        const lineStops: BusStop[] = stations
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
          })
        const selected = STATION_COORDS[station]
        if (!lineStops.length) return null
        return (
          <div className="flex-shrink-0 border-b border-stone-200 h-44 md:h-52 relative">
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
            <div className="absolute bottom-2 left-2 z-[500] bg-white/90 text-[10px] text-stone-600 px-2 py-1 rounded-lg border border-stone-200 shadow-sm">
              {lang === 'tc'
                ? '地圖：本線車站（點站可切換）'
                : 'Map: stations on this line (tap to switch)'}
            </div>
          </div>
        )
      })()}

      {/* Train lists */}
      <div className="flex-1 overflow-y-auto p-3">
        {loading && !up.length && !down.length ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-stone-50 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : error ? (
          <div className="text-red-400 text-sm p-4 text-center rounded-xl bg-red-500/10 border border-red-500/20">
            {error}
            <button onClick={load} className="block mx-auto mt-2 text-stone-700 underline text-xs">
              {lang === 'tc' ? '重試' : 'Retry'}
            </button>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row gap-5">
            {renderTrains(up, upLabel)}
            {renderTrains(down, downLabel)}
          </div>
        )}
      </div>

      <div className="p-2 text-center border-t border-stone-200">
        <button
          onClick={load}
          disabled={loading}
          className="text-xs text-stone-500 hover:text-stone-800 disabled:opacity-50 px-3 py-1"
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
  )
}
