import { useState, useCallback, useEffect, useRef } from 'react'

export interface Reminder {
  id: string
  route: string
  dest: string
  stopName: string
  etaIso: string
  notifyAt: number // timestamp when to fire
  minutesBefore: number
}

const STORAGE_KEY = 'hk-bus-mtr-reminders'

function load(): Reminder[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const list = JSON.parse(raw) as Reminder[]
    const now = Date.now()
    return list.filter((r) => r.notifyAt > now - 60000)
  } catch {
    return []
  }
}

function save(list: Reminder[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch {
    /* ignore */
  }
}

export async function ensureNotificationPermission(): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  const result = await Notification.requestPermission()
  return result === 'granted'
}

export function useReminders(lang: 'tc' | 'en') {
  const [reminders, setReminders] = useState<Reminder[]>([])
  const timers = useRef<Map<string, number>>(new Map())

  const clearTimer = (id: string) => {
    const t = timers.current.get(id)
    if (t != null) {
      window.clearTimeout(t)
      timers.current.delete(id)
    }
  }

  const scheduleOne = useCallback(
    (r: Reminder) => {
      clearTimer(r.id)
      const delay = r.notifyAt - Date.now()
      if (delay <= 0) {
        // fire soon
        try {
          if (Notification.permission === 'granted') {
            new Notification(
              lang === 'tc' ? `巴士快到：${r.route}` : `Bus arriving: ${r.route}`,
              {
                body:
                  lang === 'tc'
                    ? `${r.stopName} → ${r.dest}（約 ${r.minutesBefore} 分鐘前設定）`
                    : `${r.stopName} → ${r.dest} (set ${r.minutesBefore} min before)`,
                tag: r.id,
              }
            )
          }
        } catch {
          /* ignore */
        }
        setReminders((prev) => {
          const next = prev.filter((x) => x.id !== r.id)
          save(next)
          return next
        })
        return
      }
      const handle = window.setTimeout(() => {
        try {
          if (Notification.permission === 'granted') {
            new Notification(
              lang === 'tc' ? `巴士快到：${r.route}` : `Bus arriving: ${r.route}`,
              {
                body:
                  lang === 'tc'
                    ? `${r.stopName}\n往 ${r.dest}`
                    : `${r.stopName}\nTo ${r.dest}`,
                tag: r.id,
              }
            )
          }
        } catch {
          /* ignore */
        }
        setReminders((prev) => {
          const next = prev.filter((x) => x.id !== r.id)
          save(next)
          return next
        })
        timers.current.delete(r.id)
      }, delay)
      timers.current.set(r.id, handle)
    },
    [lang]
  )

  useEffect(() => {
    const list = load()
    setReminders(list)
    list.forEach(scheduleOne)
    return () => {
      timers.current.forEach((t) => window.clearTimeout(t))
      timers.current.clear()
    }
  }, [scheduleOne])

  const addReminder = useCallback(
    async (opts: {
      route: string
      dest: string
      stopName: string
      etaIso: string
      minutesBefore: number
    }): Promise<{ ok: boolean; message: string }> => {
      const okPerm = await ensureNotificationPermission()
      if (!okPerm) {
        return {
          ok: false,
          message:
            lang === 'tc'
              ? '請允許瀏覽器通知權限'
              : 'Please allow notification permission',
        }
      }
      const etaMs = new Date(opts.etaIso).getTime()
      if (isNaN(etaMs)) {
        return {
          ok: false,
          message: lang === 'tc' ? '無效到站時間' : 'Invalid ETA',
        }
      }
      const notifyAt = etaMs - opts.minutesBefore * 60_000
      if (notifyAt <= Date.now()) {
        return {
          ok: false,
          message:
            lang === 'tc'
              ? '到站時間太近，無法設定提醒'
              : 'ETA too soon for this reminder',
        }
      }
      const id = `${opts.route}-${opts.etaIso}-${opts.minutesBefore}-${Date.now()}`
      const item: Reminder = {
        id,
        route: opts.route,
        dest: opts.dest,
        stopName: opts.stopName,
        etaIso: opts.etaIso,
        notifyAt,
        minutesBefore: opts.minutesBefore,
      }
      setReminders((prev) => {
        const next = [...prev, item].slice(-20)
        save(next)
        return next
      })
      scheduleOne(item)
      const clock = new Date(notifyAt)
      const hh = String(clock.getHours()).padStart(2, '0')
      const mm = String(clock.getMinutes()).padStart(2, '0')
      return {
        ok: true,
        message:
          lang === 'tc'
            ? `已設定：${hh}:${mm} 提醒（到站前 ${opts.minutesBefore} 分鐘）`
            : `Set: notify at ${hh}:${mm} (${opts.minutesBefore} min before)`,
      }
    },
    [lang, scheduleOne]
  )

  const cancelReminder = useCallback((id: string) => {
    clearTimer(id)
    setReminders((prev) => {
      const next = prev.filter((r) => r.id !== id)
      save(next)
      return next
    })
  }, [])

  return { reminders, addReminder, cancelReminder }
}
