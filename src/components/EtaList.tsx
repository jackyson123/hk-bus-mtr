import type { EtaItem, Lang } from '../types'
import { formatEta } from '../lib/api'

interface Props {
  etas: EtaItem[]
  lang: Lang
  loading?: boolean
}

export default function EtaList({ etas, lang, loading }: Props) {
  if (loading) {
    return (
      <div className="space-y-2 p-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-14 bg-slate-800/60 rounded-xl animate-pulse" />
        ))}
      </div>
    )
  }

  if (!etas.length) {
    return (
      <div className="p-6 text-center text-slate-400 text-sm">
        {lang === 'tc' ? '暫時沒有到站資料' : 'No arrival data'}
      </div>
    )
  }

  // Group by route
  const grouped = etas.reduce<Record<string, EtaItem[]>>((acc, e) => {
    const key = `${e.operator}-${e.route}`
    if (!acc[key]) acc[key] = []
    acc[key].push(e)
    return acc
  }, {})

  return (
    <div className="space-y-2 p-2">
      {Object.entries(grouped).map(([key, items]) => {
        const first = items[0]
        return (
          <div
            key={key}
            className="bg-slate-800/70 rounded-xl p-3 border border-slate-700/50"
          >
            <div className="flex items-center gap-2 mb-2">
              <span
                className={`text-xs font-bold px-2 py-0.5 rounded ${
                  first.operator === 'KMB'
                    ? 'bg-kmb text-white'
                    : 'bg-ctb text-white'
                }`}
              >
                {first.operator}
              </span>
              <span className="font-bold text-lg tracking-wide">{first.route}</span>
              <span className="text-slate-400 text-sm truncate">
                → {lang === 'tc' ? first.dest_tc : first.dest_en}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {items
                .sort((a, b) => a.eta_seq - b.eta_seq)
                .slice(0, 3)
                .map((e, i) => (
                  <div
                    key={i}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                      i === 0
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'bg-slate-700/60 text-slate-300'
                    }`}
                  >
                    {formatEta(e.eta, lang)}
                    {e.rmk_tc || e.rmk_en ? (
                      <span className="ml-1 text-xs opacity-70">
                        ({lang === 'tc' ? e.rmk_tc : e.rmk_en})
                      </span>
                    ) : null}
                  </div>
                ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
