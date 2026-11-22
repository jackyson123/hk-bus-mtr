import { useEffect, useState } from 'react'
import type { Lang } from '../types'

/**
 * Live Hong Kong clock shown in the desktop header.
 * Kept in its own component so the once-a-second tick doesn't re-render the app tree.
 */
export default function LiveClock({ lang }: { lang: Lang }) {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(t)
  }, [])

  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  const ss = String(now.getSeconds()).padStart(2, '0')

  return (
    <div className="hidden items-center gap-2.5 rounded-xl border border-stone-200/80 bg-white px-3 py-1.5 lg:flex">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
      </span>
      <span className="text-[13px] font-semibold tabular-nums tracking-tight text-stone-800">
        {hh}:{mm}
        <span className="text-stone-400">:{ss}</span>
      </span>
      <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-stone-500">
        {lang === 'tc' ? '香港時間' : 'HKT'}
      </span>
    </div>
  )
}
