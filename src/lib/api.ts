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
      time: t.ttnt || t.time || '-',
      plat: t.plat || '',
      seq: i + 1,
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
  if (d.getTime() - now <= 0) {
    return lang === 'tc' ? '即將到' : 'Due'
  }
  // Asia/Hong_Kong style 24h clock
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
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
