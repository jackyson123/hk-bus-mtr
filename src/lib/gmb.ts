import { fetchJson } from './api'

/**
 * 綠色專線小巴（GMB）— 運輸署 data.etagmb.gov.hk 開放數據
 *  - 路線清單：/route/{region}
 *  - 路線詳情：/route/{region}/{route_code}（含正常／短程班次同方向）
 *  - 站序：/route-stop/{route_id}/{route_seq}
 *  - 每站到站：/eta/route-stop/{route_id}/{route_seq}/{stop_seq}
 *  - 站點座標：/stop/{stop_id}（我哋用 public/gmb-stops.json 先查，查唔到才逐個請求）
 *  - 全程車費：public/gmb-fares.json（由 TD routes-fares GeoJSON 抽出來）
 */

const GMB_BASE = 'https://data.etagmb.gov.hk'

export type GmbRegion = 'HKI' | 'KLN' | 'NT'

export interface GmbRegionMeta {
  code: GmbRegion
  label_tc: string
  label_en: string
  color: string
}

export const GMB_REGIONS: GmbRegionMeta[] = [
  { code: 'HKI', label_tc: '港島', label_en: 'Hong Kong Island', color: '#007DC5' },
  { code: 'KLN', label_tc: '九龍', label_en: 'Kowloon', color: '#D7261E' },
  { code: 'NT', label_tc: '新界', label_en: 'New Territories', color: '#0B7A3B' },
]

export function regionMeta(code: string): GmbRegionMeta {
  return GMB_REGIONS.find((r) => r.code === code) || GMB_REGIONS[0]
}

export function regionLabel(code: string, lang: 'tc' | 'en'): string {
  const m = regionMeta(code)
  return lang === 'tc' ? m.label_tc : m.label_en
}

export interface GmbRouteRef {
  region: GmbRegion
  code: string
}

export interface GmbHeadway {
  weekdays?: boolean[]
  public_holiday?: boolean
  start_time: string
  end_time: string
  frequency: number
  frequency_upper?: number | null
}

export interface GmbDirection {
  routeSeq: number
  orig_tc: string
  orig_en: string
  dest_tc: string
  dest_en: string
  remarks_tc: string
  remarks_en: string
  headways: GmbHeadway[]
}

export interface GmbRouteVariant {
  routeId: number
  region: GmbRegion
  code: string
  desc_tc: string
  desc_en: string
  directions: GmbDirection[]
}

export interface GmbRouteStop {
  stopSeq: number
  stopId: number
  name_tc: string
  name_en: string
  lat: number
  lng: number
}

export interface GmbEtaItem {
  etaSeq: number
  diff: number
  timestamp: string | null
  remarks_tc: string
  remarks_en: string
}

export interface GmbStopEtaResult {
  enabled: boolean
  etas: GmbEtaItem[]
  note_tc: string
  note_en: string
}

/* ------------------------------------------------------------------ */
/* Caches                                                              */
/* ------------------------------------------------------------------ */

const regionRoutesCache = new Map<GmbRegion, Promise<string[]>>()
const routeDetailCache = new Map<string, Promise<GmbRouteVariant[]>>()
const routeStopsCache = new Map<string, Promise<GmbRouteStop[]>>()

let stopCoordMapPromise: Promise<Record<string, [number, number]>> | null = null
let faresPromise: Promise<Record<string, number>> | null = null

/** 路線號碼清單（每個地區一次，之後記憶體快取） */
export function getGmbRegionRouteCodes(region: GmbRegion): Promise<string[]> {
  const hit = regionRoutesCache.get(region)
  if (hit) return hit
  const p = fetchJson<{ data: { routes?: string[] } }>(
    `${GMB_BASE}/route/${region}`
  )
    .then((d) => d?.data?.routes ?? [])
    .catch((e) => {
      // 失敗唔好快取，下次再試
      regionRoutesCache.delete(region)
      throw e
    })
  regionRoutesCache.set(region, p)
  return p
}

/** 三個地區一齊搵同一個號碼（同號路線唔同地區好常見） */
export async function searchGmbRoutes(query: string): Promise<GmbRouteRef[]> {
  const q = query.trim().toUpperCase()
  if (!q) return []
  const results = await Promise.all(
    GMB_REGIONS.map(async (r) => {
      try {
        const codes = await getGmbRegionRouteCodes(r.code)
        return codes
          .filter((c) => c.toUpperCase() === q)
          .map((c) => ({ region: r.code, code: c }))
      } catch {
        return [] as GmbRouteRef[]
      }
    })
  )
  const exact = results.flat()
  if (exact.length) return exact

  // 冇完全一樣：用前綴提示（例如打「10」會見到 10、10P、102）
  const prefix = await Promise.all(
    GMB_REGIONS.map(async (r) => {
      try {
        const codes = await getGmbRegionRouteCodes(r.code)
        return codes
          .filter((c) => c.toUpperCase().startsWith(q))
          .slice(0, 8)
          .map((c) => ({ region: r.code, code: c }))
      } catch {
        return [] as GmbRouteRef[]
      }
    })
  )
  return prefix.flat().slice(0, 24)
}

/** 路線詳情：可能有多個「正常班次／短程班次／特別班次」 */
export function getGmbRouteVariants(ref: GmbRouteRef): Promise<GmbRouteVariant[]> {
  const key = `${ref.region}|${ref.code.toUpperCase()}`
  const hit = routeDetailCache.get(key)
  if (hit) return hit
  const p = fetchJson<{ data: any[] }>(
    `${GMB_BASE}/route/${ref.region}/${encodeURIComponent(ref.code)}`
  )
    .then((d) =>
      (d?.data ?? []).map((r: any) => ({
        routeId: Number(r.route_id),
        region: ref.region,
        code: String(r.route_code ?? ref.code),
        desc_tc: r.description_tc || '正常班次',
        desc_en: r.description_en || 'Normal Route',
        directions: (r.directions ?? []).map((x: any) => ({
          routeSeq: Number(x.route_seq),
          orig_tc: x.orig_tc || '',
          orig_en: x.orig_en || '',
          dest_tc: x.dest_tc || '',
          dest_en: x.dest_en || '',
          remarks_tc: x.remarks_tc || '',
          remarks_en: x.remarks_en || '',
          headways: Array.isArray(x.headways) ? x.headways : [],
        })),
      }))
    )
    .catch((e) => {
      routeDetailCache.delete(key)
      throw e
    })
  routeDetailCache.set(key, p)
  return p
}

/** 一次過攞站點座標（靜態檔，避免逐個 stop 請求） */
function loadStopCoords(): Promise<Record<string, [number, number]>> {
  if (stopCoordMapPromise) return stopCoordMapPromise
  stopCoordMapPromise = fetch('/gmb-stops.json')
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}))
  return stopCoordMapPromise
}

async function getStopCoord(stopId: number): Promise<[number, number] | null> {
  try {
    const d = await fetchJson<{ data: any }>(`${GMB_BASE}/stop/${stopId}`)
    const c = d?.data?.coordinates?.wgs84
    if (c?.latitude && c?.longitude) {
      return [Number(c.latitude), Number(c.longitude)]
    }
  } catch {
    /* ignore */
  }
  return null
}

/** 站序 + 站名 + 座標（站序唔會經常變，快取） */
export function getGmbRouteStops(routeId: number, routeSeq: number): Promise<GmbRouteStop[]> {
  const key = `${routeId}|${routeSeq}`
  const hit = routeStopsCache.get(key)
  if (hit) return hit
  const p = (async () => {
    const [raw, coords] = await Promise.all([
      fetchJson<{ data: { route_stops?: any[] } }>(
        `${GMB_BASE}/route-stop/${routeId}/${routeSeq}`
      ),
      loadStopCoords(),
    ])
    const rows = raw?.data?.route_stops ?? []
    const missing: number[] = []
    const stops: GmbRouteStop[] = rows.map((s: any) => {
      const id = Number(s.stop_id)
      const c = coords[String(id)]
      if (!c) missing.push(id)
      return {
        stopSeq: Number(s.stop_seq),
        stopId: id,
        name_tc: s.name_tc || '',
        name_en: s.name_en || '',
        lat: c ? c[0] : 0,
        lng: c ? c[1] : 0,
      }
    })
    // 靜態座標檔冇嘅站（新站）：逐個補（最多 12 個，免得太多請求）
    if (missing.length && missing.length <= 12) {
      const uniq = [...new Set(missing)]
      await Promise.all(
        uniq.map(async (id) => {
          const c = await getStopCoord(id)
          if (!c) return
          for (const s of stops) {
            if (s.stopId === id) {
              s.lat = c[0]
              s.lng = c[1]
            }
          }
        })
      )
    }
    return stops.sort((a, b) => a.stopSeq - b.stopSeq)
  })().catch((e) => {
    routeStopsCache.delete(key)
    throw e
  })
  routeStopsCache.set(key, p)
  return p
}

/** 全程車費（由 TD 路線及收費資料抽出；冇資料就 null） */
export async function getGmbFare(routeId: number, routeSeq: number): Promise<number | null> {
  if (!faresPromise) {
    faresPromise = fetch('/gmb-fares.json')
      .then((r) => (r.ok ? r.json() : {}))
      .catch(() => ({}))
  }
  try {
    const fares = await faresPromise
    const v = fares[`${routeId}|${routeSeq}`]
    return typeof v === 'number' ? v : null
  } catch {
    return null
  }
}

/* ------------------------------------------------------------------ */
/* Real-time ETA                                                       */
/* ------------------------------------------------------------------ */

function parseEtaRows(rows: any[]): GmbEtaItem[] {
  return (rows ?? [])
    .map((e: any) => ({
      etaSeq: Number(e.eta_seq) || 0,
      diff: Number(e.diff ?? NaN),
      timestamp: e.timestamp ?? null,
      remarks_tc: e.remarks_tc || '',
      remarks_en: e.remarks_en || '',
    }))
    .sort((a, b) => {
      const ta = a.timestamp ? new Date(a.timestamp).getTime() : Infinity
      const tb = b.timestamp ? new Date(b.timestamp).getTime() : Infinity
      return ta - tb
    })
}

export async function getGmbStopEta(
  routeId: number,
  routeSeq: number,
  stopSeq: number
): Promise<GmbStopEtaResult> {
  const d = await fetchJson<{ data: any }>(
    `${GMB_BASE}/eta/route-stop/${routeId}/${routeSeq}/${stopSeq}`
  )
  const data = d?.data
  if (!data) return { enabled: false, etas: [], note_tc: '', note_en: '' }
  return {
    enabled: data.enabled !== false,
    etas: parseEtaRows(data.eta ?? []),
    note_tc: data.description_tc || '',
    note_en: data.description_en || '',
  }
}

/** 逐站攞到站（同時最多 6 個請求），返回 stopSeq → 班次 */
export async function getGmbRouteEtas(
  routeId: number,
  routeSeq: number,
  stopSeqs: number[]
): Promise<{
  map: Record<number, GmbEtaItem[]>
  note_tc: string
  note_en: string
  enabled: boolean
}> {
  const map: Record<number, GmbEtaItem[]> = {}
  let note_tc = ''
  let note_en = ''
  let enabled = true
  let cursor = 0
  const worker = async () => {
    while (cursor < stopSeqs.length) {
      const i = cursor++
      const seq = stopSeqs[i]
      try {
        const res = await getGmbStopEta(routeId, routeSeq, seq)
        map[seq] = res.etas
        if (!res.enabled) {
          enabled = false
          if (res.note_tc) note_tc = res.note_tc
          if (res.note_en) note_en = res.note_en
        }
      } catch {
        map[seq] = []
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(6, stopSeqs.length) }, () => worker())
  )
  return { map, note_tc, note_en, enabled }
}

/** 班次間距（今日）— 用嚟顯示「約 5–8 分鐘一班」 */
export function todayHeadway(direction: GmbDirection): {
  min: number
  max: number
} | null {
  const headways = direction.headways
  if (!headways?.length) return null
  const dow = new Date().getDay() // 0 = Sunday
  const idx = (dow + 6) % 7 // 0 = Monday
  const nowMins = new Date().getHours() * 60 + new Date().getMinutes()
  const toMins = (t: string) => {
    const [h, m] = t.split(':').map(Number)
    return h * 60 + (m || 0)
  }
  const today = headways.filter((h) => {
    if (Array.isArray(h.weekdays) && h.weekdays.length === 7) {
      return Boolean(h.weekdays[idx])
    }
    return true
  })
  const active = today.filter(
    (h) => nowMins >= toMins(h.start_time) && nowMins < toMins(h.end_time)
  )
  const pool = active.length ? active : today
  if (!pool.length) return null
  const mins = pool.map((h) => Number(h.frequency)).filter((n) => n > 0)
  const maxs = pool
    .map((h) => Number(h.frequency_upper ?? h.frequency))
    .filter((n) => n > 0)
  if (!mins.length) return null
  return { min: Math.min(...mins), max: Math.max(...maxs) }
}
