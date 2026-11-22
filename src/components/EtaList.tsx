import type { EtaItem, Lang } from '../types'
import { formatEta, sortEtasByTime } from '../lib/api'

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
      <div className="grid gap-2.5 p-3 md:grid-cols-2 md:p-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-[7.5rem] animate-pulse rounded-2xl border border-stone-100 bg-stone-50"
          />
        ))}
      </div>
    )
  }

  if (!etas.length) {
    return (
      <div className="px-6 py-10 text-center">
        <p className="text-sm font-semibold text-stone-700">
          {lang === 'tc' ? '暫時沒有到站資料' : 'No arrival data'}
        </p>
        <p className="mt-1 text-xs text-stone-500">
          {lang === 'tc'
            ? '資料每 30 秒自動更新，請稍等或撳「更新」。'
            : 'Updates every 30 seconds — wait a moment or tap Refresh.'}
        </p>
      </div>
    )
  }

  const grouped = etas.reduce<Record<string, EtaItem[]>>((acc, e) => {
    const key = `${e.operator}-${e.route}`
    if (!acc[key]) acc[key] = []
    acc[key].push(e)
    return acc
  }, {})

  const cards = Object.entries(grouped).map(([key, items]) => {
    const first = items[0]
    return { key, first, sorted: sortEtasByTime(items).slice(0, 3) }
  })

  // Soonest first, like a departure board
  cards.sort((a, b) => {
    const ta = a.sorted[0]?.eta ? new Date(a.sorted[0].eta!).getTime() : Infinity
    const tb = b.sorted[0]?.eta ? new Date(b.sorted[0].eta!).getTime() : Infinity
    return ta - tb
  })

  return (
    <div className="grid gap-2.5 p-3 md:grid-cols-2 md:gap-3 md:p-4">
      {cards.map(({ key, first, sorted }) => (
        <div
          key={key}
          className="fade-up rounded-2xl border border-stone-200/80 bg-white p-3.5 transition hover:border-stone-300 hover:shadow-sm"
        >
          <div className="flex items-start gap-2">
            <span
              className={`mt-0.5 rounded-md px-1.5 py-0.5 text-[9px] font-bold text-white ${
                first.operator === 'KMB' ? 'bg-kmb' : 'bg-ctb'
              }`}
            >
              {first.operator}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="text-lg font-black leading-none tracking-tight">
                  {first.route}
                </span>
                <span className="truncate text-xs font-medium text-stone-600">
                  → {lang === 'tc' ? first.dest_tc : first.dest_en}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-2.5 space-y-1.5">
            {sorted.map((e, i) => (
              <div key={i} className="flex items-center gap-2">
                <span
                  className={`w-[5.2rem] flex-shrink-0 rounded-lg px-2 py-1 text-center text-[13px] font-bold tabular-nums ${
                    i === 0
                      ? 'bg-emerald-100 text-emerald-900'
                      : 'bg-stone-100 text-stone-700'
                  }`}
                >
                  {formatEta(e.eta, lang)}
                </span>
                <span className="min-w-0 flex-1 truncate text-[11px] text-stone-500">
                  {lang === 'tc' ? e.rmk_tc : e.rmk_en}
                </span>
                {onRemind && e.eta && (
                  <span className="flex flex-shrink-0 gap-1">
                    {[3, 5, 10].map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() =>
                          onRemind({
                            route: e.route,
                            dest:
                              lang === 'tc' ? e.dest_tc : e.dest_en,
                            etaIso: e.eta!,
                            minutesBefore: m,
                          })
                        }
                        className="rounded-md border border-stone-200 bg-stone-50 px-1.5 py-0.5 text-[9px] font-semibold text-stone-600 transition hover:border-stone-300 hover:bg-white hover:text-stone-900"
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
                  </span>
                )}
              </div>
            ))}
          </div>

          {stopName && onRemind && (
            <p className="mt-2 text-[10px] text-stone-400">
              {lang === 'tc' ? '🔔 = 到站前提醒' : '🔔 = reminder'}
            </p>
          )}
        </div>
      ))}
    </div>
  )
}
