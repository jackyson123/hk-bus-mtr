import { fetchJson } from './api'
import type { Lang } from '../types'

/**
 * 輕鐵（Light Rail）— 港鐵實時班次
 *  - GET https://rt.data.gov.hk/v1/transport/mtr/lrt/getSchedule?station_id={id}&with_special=1
 *  - 回傳 { platform_list: [{ platform_id, route_list: [{ route_no, dest_ch, dest_en, time_ch, time_en, train_length, arrival_departure, special }] }], status, system_time }
 *  - 車站 ID 嚟自靜態資料 src/lib/lrData.ts（港鐵開放數據 light_rail_routes_and_stops.csv）
 */

const LR_BASE = 'https://rt.data.gov.hk/v1/transport/mtr/lrt/getSchedule'

export type LrStatus = 'arriving' | 'departing' | 'scheduled'

export interface LrDeparture {
  platform: number
  routeNo: string
  dest_tc: string
  dest_en: string
  minutes: number | null
  status: LrStatus
  timeText_tc: string
  timeText_en: string
  cars?: number
}

export interface LrPlatformGroup {
  platform: number
  departures: LrDeparture[]
}

/** 解析到站文字：含「分鐘」/mins 抽數字；「正在離開」/Departing → departing；
 *  「即將到達」/Arriving / 1 分鐘內 → arriving */
function parseTime(text: string): { minutes: number | null; status: LrStatus } {
  const t = (text || '').trim()
  if (/正在離開|Departing/i.test(t)) return { minutes: 0, status: 'departing' }
  if (/即將到達|正在到達|Arriving/i.test(t)) return { minutes: 0, status: 'arriving' }
  const m = t.match(/(\d+)/)
  if (m) {
    const n = Number(m[1])
    if (n <= 1) return { minutes: n, status: 'arriving' }
    return { minutes: n, status: 'scheduled' }
  }
  return { minutes: null, status: 'scheduled' }
}

/** 某站實時班次，按月台分組，每組班次按分鐘由近到遠排序 */
export async function getLrSchedule(
  stationId: number,
  lang: Lang = 'tc'
): Promise<LrPlatformGroup[]> {
  const d = await fetchJson<{ platform_list?: any[]; status?: number }>(
    `${LR_BASE}?station_id=${stationId}&with_special=1`
  )
  const groups: LrPlatformGroup[] = []
  for (const p of d?.platform_list ?? []) {
    const departures: LrDeparture[] = (p.route_list ?? []).map((r: any) => {
      // 用返目前語言嘅文字嚟解析，另一種語言做後備
      const primary = lang === 'tc' ? r.time_ch : r.time_en
      const fallback = lang === 'tc' ? r.time_en : r.time_ch
      const parsed = parseTime(primary || fallback || '')
      return {
        platform: Number(p.platform_id) || 0,
        routeNo: String(r.route_no ?? ''),
        dest_tc: r.dest_ch || '',
        dest_en: r.dest_en || '',
        minutes: parsed.minutes,
        status: parsed.status,
        timeText_tc: r.time_ch || '',
        timeText_en: r.time_en || '',
        cars: r.train_length != null ? Number(r.train_length) : undefined,
      }
    })
    // 正在離開／即將到達（0 分鐘）先，之後由近到遠；分鐘一樣就 departing 行先
    const statusOrder = (s: LrStatus) => (s === 'departing' ? 0 : s === 'arriving' ? 1 : 2)
    departures.sort((a, b) => {
      const ma = a.minutes ?? Number.POSITIVE_INFINITY
      const mb = b.minutes ?? Number.POSITIVE_INFINITY
      if (ma !== mb) return ma - mb
      return statusOrder(a.status) - statusOrder(b.status)
    })
    groups.push({ platform: Number(p.platform_id) || 0, departures })
  }
  return groups.sort((a, b) => a.platform - b.platform)
}
