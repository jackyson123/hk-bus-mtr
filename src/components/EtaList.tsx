import type { EtaItem, Lang } from '../types'
import { formatEta } from '../lib/api'

interface Props {
  etas: EtaItem[]
  lang: Lang
  loading?: boolean
  stopName?: string
  onRemind?: (opts: {
    route: string
    dest: string
    etaIso: string
    minutesBefore: number
  }) => void
}

export default function EtaList({
  etas,
  lang,
  loading,
  stopName,
  onRemind,
}: Props) {
  if (loading) {
    return (
      <div className="space-y-2 p-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-14 bg-stone-50 rounded-xl animate-pulse" />
        ))}
      </div>
    )
  }

  if (!etas.length) {
    return (
      <div className="p-6 text-center text-stone-500 text-sm">
        {lang === 'tc' ? '暫時沒有到站資料' : 'No arrival data'}
      </div>
    )
  }

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
        const sorted = [...items].sort((a, b) => a.eta_seq - b.eta_seq).slice(0, 3)
        return (
          <div
            key={key}
            className="bg-white rounded-xl p-3 border border-stone-200"
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
              <span className="text-stone-700 text-sm truncate">
                → {lang === 'tc' ? first.dest_tc : first.dest_en}
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {sorted.map((e, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between gap-2 flex-wrap"
                >
                  <div
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium tabular-nums ${
                      i === 0
                        ? 'bg-emerald-100 text-emerald-900 border border-emerald-600 font-bold'
                        : 'bg-stone-100 text-stone-900 border border-stone-300 font-semibold'
                    }`}
                  >
                    {formatEta(e.eta, lang)}
                    {e.rmk_tc || e.rmk_en ? (
                      <span className="ml-1 text-xs text-stone-600">
                        ({lang === 'tc' ? e.rmk_tc : e.rmk_en})
                      </span>
                    ) : null}
                  </div>
                  {onRemind && e.eta && (
                    <div className="flex gap-1">
                      {[3, 5, 10].map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() =>
                            onRemind({
                              route: e.route,
                              dest: lang === 'tc' ? e.dest_tc : e.dest_en,
                              etaIso: e.eta!,
                              minutesBefore: m,
                            })
                          }
                          className="text-[10px] px-2 py-1 rounded-md bg-amber-100 text-amber-900 border border-amber-400 hover:bg-amber-200 font-medium"
                          title={
                            lang === 'tc'
                              ? `到站前 ${m} 分鐘提醒`
                              : `Remind ${m} min before`
                          }
                        >
                          🔔{m}
                          {lang === 'tc' ? '分' : 'm'}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
            {stopName && onRemind && (
              <p className="text-[10px] text-stone-600 mt-2">
                {lang === 'tc'
                  ? '撳 🔔 設定到站前提醒（需允許通知）'
                  : 'Tap 🔔 to set arrival reminder (needs notification permission)'}
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}
