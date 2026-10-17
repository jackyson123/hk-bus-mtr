import type { BusRoute, BusStop, EtaItem, MtrSchedule } from '../types'

const KMB_BASE = 'https://data.etabus.gov.hk/v1/transport/kmb'
const CTB_BASE = 'https://rt.data.gov.hk/v2/transport/citybus'
const MTR_BASE = 'https://rt.data.gov.hk/v1/transport/mtr/getSchedule.php'

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`)
  return res.json()
}

// ---------- KMB ----------
export async function getKmbRoutes(): Promise<BusRoute[]> {
  const data = await fetchJson<{ data: any[] }>(`${KMB_BASE}/route/`)
  return (data.data || []).map((r) => ({
    route: r.route,
    dest_tc: r.dest_tc,
    dest_en: r.dest_en,
    orig_tc: r.orig_tc,
    orig_en: r.orig_en,
    service_type: String(r.service_type ?? '1'),
    bound: r.bound, // O / I
    operator: 'KMB' as const,
  }))
}

export async function getKmbStops(): Promise<BusStop[]> {
  const data = await fetchJson<{ data: any[] }>(`${KMB_BASE}/stop`)
  return (data.data || []).map((s) => ({
    id: s.stop,
    name_tc: s.name_tc,
    name_en: s.name_en,
    lat: parseFloat(s.lat),
    lng: parseFloat(s.long),
    operator: 'KMB' as const,
  }))
}

export async function getKmbStopById(stopId: string): Promise<BusStop | null> {
  try {
    const data = await fetchJson<{ data: any }>(`${KMB_BASE}/stop/${stopId}`)
    const s = data.data
    if (!s) return null
    return {
      id: s.stop,
      name_tc: s.name_tc,
      name_en: s.name_en,
      lat: parseFloat(s.lat),
      lng: parseFloat(s.long),
      operator: 'KMB',
    }
  } catch {
    return null
  }
}

/** Route-stop list: returns [{ seq, stop }] */
export async function getKmbRouteStops(
  route: string,
  direction: string,
  serviceType: string | number
) {
  const dir =
    direction === 'I' || direction === 'inbound' || direction === '1'
      ? 'inbound'
      : 'outbound'
  const data = await fetchJson<{ data: any[] }>(
    `${KMB_BASE}/route-stop/${route}/${dir}/${serviceType}`
  )
  return data.data || []
}

export async function getKmbStopEta(stopId: string): Promise<EtaItem[]> {
  const data = await fetchJson<{ data: any[] }>(`${KMB_BASE}/stop-eta/${stopId}`)
  return (data.data || []).map((e) => ({
    route: e.route,
    dest_tc: e.dest_tc,
    dest_en: e.dest_en,
    eta: e.eta,
    eta_seq: e.eta_seq,
    rmk_tc: e.rmk_tc,
    rmk_en: e.rmk_en,
    operator: 'KMB' as const,
    co: e.co,
  }))
}

export async function getKmbEta(
  stopId: string,
  route: string,
  serviceType: string | number
): Promise<EtaItem[]> {
  const data = await fetchJson<{ data: any[] }>(
    `${KMB_BASE}/eta/${stopId}/${route}/${serviceType}`
  )
  return (data.data || []).map((e) => ({
    route: e.route,
    dest_tc: e.dest_tc,
    dest_en: e.dest_en,
    eta: e.eta,
    eta_seq: e.eta_seq,
    rmk_tc: e.rmk_tc,
    rmk_en: e.rmk_en,
    operator: 'KMB' as const,
    co: e.co,
  }))
}

/** ETA for every stop on a KMB route (by service_type). Groups by seq. */
export async function getKmbRouteEta(
  route: string,
  serviceType: string | number
): Promise<
  {
    seq: number
    dir: string
    etas: { eta: string | null; eta_seq: number; rmk_tc?: string; rmk_en?: string }[]
  }[]
> {
  const data = await fetchJson<{ data: any[] }>(
    `${KMB_BASE}/route-eta/${route}/${serviceType}`
  )
  const bySeq = new Map<
    number,
    {
      seq: number
      dir: string
      etas: { eta: string | null; eta_seq: number; rmk_tc?: string; rmk_en?: string }[]
    }
  >()
  for (const row of data.data || []) {
    const seq = Number(row.seq)
    if (!bySeq.has(seq)) {
      bySeq.set(seq, { seq, dir: row.dir || '', etas: [] })
    }
    bySeq.get(seq)!.etas.push({
      eta: row.eta ?? null,
      eta_seq: row.eta_seq,
      rmk_tc: row.rmk_tc,
      rmk_en: row.rmk_en,
    })
  }
  return Array.from(bySeq.values())
    .map((g) => ({
      ...g,
      etas: g.etas.sort((a, b) => a.eta_seq - b.eta_seq),
    }))
    .sort((a, b) => a.seq - b.seq)
}

// ---------- Citybus ----------
export async function getCtbRoutes(): Promise<BusRoute[]> {
  const data = await fetchJson<{ data: any[] }>(`${CTB_BASE}/route/CTB`)
  return (data.data || []).map((r) => ({
    route: r.route,
    dest_tc: r.dest_tc,
    dest_en: r.dest_en,
    orig_tc: r.orig_tc,
    orig_en: r.orig_en,
    operator: 'CTB' as const,
  }))
}

export async function getCtbStop(stopId: string): Promise<BusStop | null> {
  try {
    const data = await fetchJson<{ data: any }>(`${CTB_BASE}/stop/${stopId}`)
    const s = data.data
    if (!s) return null
    return {
      id: s.stop,
      name_tc: s.name_tc,
      name_en: s.name_en,
      lat: parseFloat(s.lat),
      lng: parseFloat(s.long),
      operator: 'CTB',
    }
  } catch {
    return null
  }
}

export async function getCtbRouteStops(
  route: string,
  direction: 'inbound' | 'outbound'
) {
  const data = await fetchJson<{ data: any[] }>(
    `${CTB_BASE}/route-stop/CTB/${route}/${direction}`
  )
  return data.data || []
}

export async function getCtbEta(stopId: string, route: string): Promise<EtaItem[]> {
  const data = await fetchJson<{ data: any[] }>(
    `${CTB_BASE}/eta/CTB/${stopId}/${route}`
  )
  return (data.data || []).map((e) => ({
    route: e.route,
    dest_tc: e.dest_tc,
    dest_en: e.dest_en,
    eta: e.eta,
    eta_seq: e.eta_seq,
    rmk_tc: e.rmk_tc,
    rmk_en: e.rmk_en,
    operator: 'CTB' as const,
    co: e.co,
  }))
}

// ---------- Combined route lookup ----------
export interface RouteVariant {
  operator: 'KMB' | 'CTB'
  route: string
  bound: string // O / I or outbound / inbound
  service_type: string
  dest_tc: string
  dest_en: string
  orig_tc: string
  orig_en: string
  label_tc: string
  label_en: string
}

export interface RouteStopItem {
  seq: number
  stopId: string
  name_tc: string
  name_en: string
  lat: number
  lng: number
  operator: 'KMB' | 'CTB'
}

/** Search KMB + CTB by route number, return variants (direction / service type) */
export async function searchRouteVariants(routeNo: string): Promise<RouteVariant[]> {
  const q = routeNo.trim().toUpperCase()
  if (!q) return []

  const variants: RouteVariant[] = []

  // KMB
  try {
    const kmbAll = await getKmbRoutes()
    const kmbMatched = kmbAll.filter((r) => r.route.toUpperCase() === q)
    for (const r of kmbMatched) {
      const bound = r.bound === 'I' ? 'I' : 'O'
      variants.push({
        operator: 'KMB',
        route: r.route,
        bound,
        service_type: String(r.service_type ?? '1'),
        dest_tc: r.dest_tc,
        dest_en: r.dest_en,
        orig_tc: r.orig_tc,
        orig_en: r.orig_en,
        label_tc: `${r.route} → ${r.dest_tc}`,
        label_en: `${r.route} → ${r.dest_en}`,
      })
    }
  } catch (e) {
    console.error('KMB route search failed', e)
  }

  // CTB
  try {
    const ctbAll = await getCtbRoutes()
    const ctbMatched = ctbAll.filter((r) => r.route.toUpperCase() === q)
    for (const r of ctbMatched) {
      // CTB route list may not include bound; we add both directions
      for (const bound of ['outbound', 'inbound'] as const) {
        variants.push({
          operator: 'CTB',
          route: r.route,
          bound,
          service_type: '1',
          dest_tc: bound === 'outbound' ? r.dest_tc : r.orig_tc,
          dest_en: bound === 'outbound' ? r.dest_en : r.orig_en,
          orig_tc: bound === 'outbound' ? r.orig_tc : r.dest_tc,
          orig_en: bound === 'outbound' ? r.orig_en : r.dest_en,
          label_tc: `城巴 ${r.route} ${bound === 'outbound' ? r.orig_tc + '→' + r.dest_tc : r.dest_tc + '→' + r.orig_tc}`,
          label_en: `CTB ${r.route} ${bound === 'outbound' ? r.orig_en + '→' + r.dest_en : r.dest_en + '→' + r.orig_en}`,
        })
      }
    }
  } catch (e) {
    console.error('CTB route search failed', e)
  }

  return variants
}

/** Load ordered stops for a route variant, with names & coords */

/** 同一方向嘅九巴/城巴聯營（唔使用戶再揀營辦商） */
export interface DirectionGroup {
  key: string
  route: string
  dest_tc: string
  dest_en: string
  orig_tc: string
  orig_en: string
  label_tc: string
  label_en: string
  /** 主用（優先九巴，有完整站序） */
  primary: RouteVariant
  partners: RouteVariant[]
  isJoint: boolean
}

function normDest(s: string): string {
  return (s || '')
    .replace(/\s+/g, '')
    .replace(/[()（）]/g, '')
    .toLowerCase()
}

/** 將 search 結果合併成「方向」列表；聯營線唔分開九巴/城巴 */
export function groupVariantsByDirection(list: RouteVariant[]): DirectionGroup[] {
  const map = new Map<string, RouteVariant[]>()
  for (const v of list) {
    // 以路線 + 終點分組（忽略營辦商）
    const key = `${v.route.toUpperCase()}|${normDest(v.dest_tc) || normDest(v.dest_en)}`
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(v)
  }
  const groups: DirectionGroup[] = []
  for (const [, arr] of map) {
    // 同一方向可能有多個 service_type，保留全部 partners，primary 優先 KMB + service_type 1
    const sorted = [...arr].sort((a, b) => {
      if (a.operator !== b.operator) return a.operator === 'KMB' ? -1 : 1
      return String(a.service_type).localeCompare(String(b.service_type))
    })
    const primary = sorted[0]
    const operators = new Set(sorted.map((x) => x.operator))
    const isJoint = operators.has('KMB') && operators.has('CTB')
    const coLabel = isJoint
      ? '九巴·城巴'
      : primary.operator === 'KMB'
      ? '九巴'
      : '城巴'
    groups.push({
      key: `${primary.route}|${normDest(primary.dest_tc)}|${sorted.map((x) => x.operator).join(',')}`,
      route: primary.route,
      dest_tc: primary.dest_tc,
      dest_en: primary.dest_en,
      orig_tc: primary.orig_tc,
      orig_en: primary.orig_en,
      label_tc: `${coLabel} ${primary.route} → ${primary.dest_tc}`,
      label_en: `${isJoint ? 'KMB·CTB' : primary.operator} ${primary.route} → ${primary.dest_en}`,
      primary,
      partners: sorted,
      isJoint,
    })
  }
  // stable: outbound-ish first by label
  return groups
}

export async function loadRouteStops(
  variant: RouteVariant,
  kmbStopMap?: Map<string, BusStop>
): Promise<RouteStopItem[]> {
  if (variant.operator === 'KMB') {
    const raw = await getKmbRouteStops(
      variant.route,
      variant.bound,
      variant.service_type
    )
    const items: RouteStopItem[] = []
    for (const row of raw) {
      const stopId = row.stop
      let name_tc = stopId
      let name_en = stopId
      let lat = 0
      let lng = 0
      const cached = kmbStopMap?.get(stopId)
      if (cached) {
        name_tc = cached.name_tc
        name_en = cached.name_en
        lat = cached.lat
        lng = cached.lng
      } else {
        const s = await getKmbStopById(stopId)
        if (s) {
          name_tc = s.name_tc
          name_en = s.name_en
          lat = s.lat
          lng = s.lng
        }
      }
      items.push({
        seq: Number(row.seq) || items.length + 1,
        stopId,
        name_tc,
        name_en,
        lat,
        lng,
        operator: 'KMB',
      })
    }
    return items.sort((a, b) => a.seq - b.seq)
  }

  // CTB
  const dir = variant.bound === 'inbound' ? 'inbound' : 'outbound'
  const raw = await getCtbRouteStops(variant.route, dir)
  const items: RouteStopItem[] = []
  for (const row of raw) {
    const stopId = row.stop
    let name_tc = stopId
    let name_en = stopId
    let lat = 0
    let lng = 0
    const s = await getCtbStop(stopId)
    if (s) {
      name_tc = s.name_tc
      name_en = s.name_en
      lat = s.lat
      lng = s.lng
    }
    items.push({
      seq: Number(row.seq) || items.length + 1,
      stopId,
      name_tc,
      name_en,
      lat,
      lng,
      operator: 'CTB',
    })
  }
  return items.sort((a, b) => a.seq - b.seq)
}

// ---------- MTR ----------
export async function getMtrSchedule(
  line: string,
  station: string,
  lang: 'TC' | 'EN' = 'TC'
): Promise<{
  up: MtrSchedule[]
  down: MtrSchedule[]
  isDelay: boolean
}> {
  const url = `${MTR_BASE}?line=${encodeURIComponent(line)}&sta=${encodeURIComponent(station)}&lang=${lang}`
  const data = await fetchJson<any>(url)
  const key = `${line}-${station}`
  const raw = data?.data?.[key]
  if (!raw) return { up: [], down: [], isDelay: data?.isdelay === 'Y' }

  const parse = (arr: any[] = [], dir: 'UP' | 'DOWN'): MtrSchedule[] =>
    (arr || []).map((t, i) => ({
      dest: t.dest || t.dest_tc || '',
      destName: t.dest || '',
      time: t.time || '',
      ttnt: Number(t.ttnt ?? NaN),
      plat: String(t.plat ?? ''),
      seq: Number(t.seq) || i + 1,
      direction: dir,
    }))

  return {
    up: parse(raw.UP, 'UP'),
    down: parse(raw.DOWN, 'DOWN'),
    isDelay: data?.isdelay === 'Y',
  }
}

// ---------- Helpers ----------
/** Display as clock time HH:mm (Hong Kong local), not minutes */
export function formatEta(eta: string | null, lang: 'tc' | 'en'): string {
  if (!eta) return lang === 'tc' ? '—' : '—'
  const d = new Date(eta)
  if (isNaN(d.getTime())) return eta
  const now = Date.now()
  // 已到或 1 分鐘內 → 即將到
  if (d.getTime() - now <= 60_000) {
    return lang === 'tc' ? '即將到' : 'Due'
  }
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

/** 按實際到站時間由近到遠排序 */
export function sortEtasByTime<T extends { eta: string | null }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const ta = a.eta ? new Date(a.eta).getTime() : Number.POSITIVE_INFINITY
    const tb = b.eta ? new Date(b.eta).getTime() : Number.POSITIVE_INFINITY
    const sa = isNaN(ta) ? Number.POSITIVE_INFINITY : ta
    const sb = isNaN(tb) ? Number.POSITIVE_INFINITY : tb
    return sa - sb
  })
}

export function haversine(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000
  const toRad = (x: number) => (x * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// ---------- Fares (TD open data slim map) ----------
let fareCache: Record<string, number> | null = null

export async function loadRouteFares(): Promise<Record<string, number>> {
  if (fareCache) return fareCache
  try {
    const res = await fetch('/route-fares.json')
    fareCache = await res.json()
    return fareCache!
  } catch {
    fareCache = {}
    return fareCache
  }
}

/** Full adult fare if known. bound: O/I or outbound/inbound */
export async function getFullFare(
  operator: 'KMB' | 'CTB',
  route: string,
  bound?: string
): Promise<number | null> {
  const fares = await loadRouteFares()
  const r = route.toUpperCase().trim()
  const seq =
    bound === 'I' || bound === 'inbound' ? '2' : bound === 'O' || bound === 'outbound' ? '1' : null
  const keys = [
    seq ? `${operator}|${r}|${seq}` : null,
    `${operator}|${r}|1`,
    `${operator}|${r}|2`,
    `${operator}|${r}`,
  ].filter(Boolean) as string[]
  for (const k of keys) {
    if (fares[k] != null) return fares[k]
  }
  return null
}

export function formatFare(n: number | null, lang: 'tc' | 'en'): string {
  if (n == null) return lang === 'tc' ? '票價 —' : 'Fare —'
  return lang === 'tc' ? `全程 $${n.toFixed(1)}` : `Full fare $${n.toFixed(1)}`
}


// ---------- Sectional fares ----------
let sectionFareCache: Record<string, number[]> | null = null

export async function loadSectionFares(): Promise<Record<string, number[]>> {
  if (sectionFareCache) return sectionFareCache
  try {
    const res = await fetch('/route-section-fares.json')
    sectionFareCache = await res.json()
    return sectionFareCache!
  } catch {
    sectionFareCache = {}
    return sectionFareCache
  }
}

/** Fares by boarding stop index (0-based, aligned with route stop order). */
export async function getSectionFares(
  operator: 'KMB' | 'CTB',
  route: string,
  bound?: string,
  serviceType?: string
): Promise<number[] | null> {
  const data = await loadSectionFares()
  const r = route.toUpperCase().trim()
  let b = (bound || '').toUpperCase()
  if (b === 'OUTBOUND' || b === '1') b = 'O'
  if (b === 'INBOUND' || b === '2') b = 'I'
  const st = String(serviceType || '1')
  const keys = [
    `${operator}|${r}|${b}|${st}`,
    `${operator}|${r}|${b}`,
    `${operator}|${r}||${st}`,
    `${operator}|${r}|`,
  ]
  for (const k of keys) {
    if (data[k]?.length) return data[k]
  }
  return null
}
