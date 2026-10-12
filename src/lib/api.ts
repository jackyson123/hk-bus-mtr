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
    service_type: r.service_type,
    bound: r.bound,
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

export async function getKmbRouteStops(route: string, direction: string, serviceType: string | number) {
  const dir = direction === 'I' || direction === 'inbound' ? 'inbound' : 'outbound'
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

export async function getKmbEta(stopId: string, route: string, serviceType: string | number): Promise<EtaItem[]> {
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

export async function getCtbRouteStops(route: string, direction: 'inbound' | 'outbound') {
  const data = await fetchJson<{ data: any[] }>(
    `${CTB_BASE}/route-stop/CTB/${route}/${direction}`
  )
  return data.data || []
}

export async function getCtbEta(stopId: string, route: string): Promise<EtaItem[]> {
  const data = await fetchJson<{ data: any[] }>(`${CTB_BASE}/eta/CTB/${stopId}/${route}`)
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

// ---------- MTR ----------
export async function getMtrSchedule(line: string, station: string, lang: 'TC' | 'EN' = 'TC'): Promise<{
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
export function formatEta(eta: string | null, lang: 'tc' | 'en'): string {
  if (!eta) return lang === 'tc' ? '暫時沒有班次' : 'No ETA'
  const d = new Date(eta)
  if (isNaN(d.getTime())) return eta
  const now = Date.now()
  const diffMin = Math.round((d.getTime() - now) / 60000)
  if (diffMin <= 0) return lang === 'tc' ? '即將到達' : 'Arriving'
  if (diffMin === 1) return lang === 'tc' ? '1 分鐘' : '1 min'
  return lang === 'tc' ? `${diffMin} 分鐘` : `${diffMin} mins`
}

export function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const toRad = (x: number) => (x * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}
