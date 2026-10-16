import { useState, useEffect, useCallback } from 'react'
import { MTR_LINES, MTR_STATIONS } from '../lib/mtrData'
import { getMtrSchedule } from '../lib/api'
import type { Lang, MtrSchedule } from '../types'

interface Props {
  lang: Lang
}

export default function MtrPanel({ lang }: Props) {
  const [line, setLine] = useState('TWL')
  const [station, setStation] = useState('TST')
  const [up, setUp] = useState<MtrSchedule[]>([])
  const [down, setDown] = useState<MtrSchedule[]>([])
  const [isDelay, setIsDelay] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const stations = MTR_STATIONS[line] || []
  const currentLine = MTR_LINES.find((l) => l.code === line)

  const load = useCallback(async () => {
    if (!line || !station) return
    setLoading(true)
    setError(null)
    try {
      const res = await getMtrSchedule(line, station, lang === 'tc' ? 'TC' : 'EN')
      setUp(res.up)
      setDown(res.down)
      setIsDelay(res.isDelay)
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
    // Reset station when line changes
    const list = MTR_STATIONS[line] || []
    if (list.length && !list.find((s) => s.code === station)) {
      setStation(list[0].code)
    }
  }, [line])

  const renderDir = (list: MtrSchedule[], label: string) => (
    <div className="flex-1 min-w-0">
      <div className="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider">
        {label}
      </div>
      {list.length === 0 ? (
        <div className="text-sm text-slate-500 py-2">
          {lang === 'tc' ? '沒有班次' : 'No trains'}
        </div>
      ) : (
        <div className="space-y-1.5">
          {list.map((t, i) => (
            <div
              key={i}
              className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm ${
                i === 0
                  ? 'bg-emerald-500/15 border border-emerald-500/25'
                  : 'bg-slate-800/50'
              }`}
            >
              <div className="truncate">
                <span className="font-medium">{t.dest}</span>
                {t.plat && (
                  <span className="ml-2 text-xs text-slate-400">
                    {lang === 'tc' ? '月台' : 'Plat'} {t.plat}
                  </span>
                )}
              </div>
              <div
                className={`font-bold tabular-nums ${
                  i === 0 ? 'text-emerald-300' : 'text-slate-300'
                }`}
              >
                {t.time}
                {typeof t.time === 'string' && !t.time.includes('min') && !t.time.includes('分')
                  ? ''
                  : ''}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 space-y-3 border-b border-slate-800">
        <div className="flex flex-wrap gap-2">
          {MTR_LINES.map((l) => (
            <button
              key={l.code}
              onClick={() => setLine(l.code)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
                line === l.code
                  ? 'text-white shadow-lg'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
              style={
                line === l.code
                  ? { backgroundColor: l.color }
                  : undefined
              }
            >
              {lang === 'tc' ? l.name_tc : l.name_en}
            </button>
          ))}
        </div>

        <select
          value={station}
          onChange={(e) => setStation(e.target.value)}
          className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
        >
          {stations.map((s) => (
            <option key={s.code} value={s.code}>
              {lang === 'tc' ? s.name_tc : s.name_en} ({s.code})
            </option>
          ))}
        </select>

        {isDelay && (
          <div className="text-amber-400 text-xs font-medium px-1">
            ⚠ {lang === 'tc' ? '服務可能延誤' : 'Service may be delayed'}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {loading && !up.length && !down.length ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 bg-slate-800/60 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : error ? (
          <div className="text-red-400 text-sm p-4 text-center">{error}</div>
        ) : (
          <div className="flex flex-col sm:flex-row gap-4">
            {renderDir(up, lang === 'tc' ? '上行 UP' : 'UP')}
            {renderDir(down, lang === 'tc' ? '下行 DOWN' : 'DOWN')}
          </div>
        )}
      </div>

      <div className="p-2 text-center">
        <button
          onClick={load}
          disabled={loading}
          className="text-xs text-slate-400 hover:text-slate-200 disabled:opacity-50"
        >
          {loading
            ? lang === 'tc'
              ? '更新中…'
              : 'Refreshing…'
            : lang === 'tc'
            ? '手動更新'
            : 'Refresh'}
        </button>
      </div>
    </div>
  )
}
