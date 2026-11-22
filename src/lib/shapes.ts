/**
 * 真實路線軌跡（route shapes）
 *
 * 巴士／小巴：運輸署「公共交通路線及收費資料」嘅路線幾何（CSDI `FB_ROUTE_LINE`
 * ／`GMB_ROUTE_LINE` layer，WGS84），預先簡化成每條路線一個 JSON，按需要在
 * 前端 fetch。港鐵：OpenStreetMap route=subway 關聯嘅真實路軌（含過海隧道）。
 *
 * 檔名：
 *   /route-shapes/bus/{KMB|CTB}-{route}.json
 *   /route-shapes/gmb/{routeCode}.json
 *   /route-shapes/mtr.json
 *
 * 一條路線可能有多個方向／班次變體；本檔會用車站位置比對變體嘅頭尾座標，
 * 揀最貼合當前方向嘅一條，需要時反轉，令方向同站序一致。
 */

export type LatLng = [number, number]

export interface ShapeVariant {
  /** O / I / C（循環線），只作後備判斷 */
  b?: string
  /** 服務類型（巴士） */
  st?: string
  /** 方向序（小巴 1/2） */
  s?: number
  o?: string
  d?: string
  len?: number
  p: LatLng[]
}

export interface ShapeFile {
  co?: string
  route: string
  v: ShapeVariant[]
}

export type MtrShapes = Record<string, LatLng[][]>

const BASE = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '')

function url(path: string) {
  return `${BASE}/route-shapes/${path}`
}

/** 大圓距離（米） */
export function hav(a: LatLng, b: LatLng): number {
  const R = 6371000
  const la1 = (a[0] * Math.PI) / 180
  const la2 = (b[0] * Math.PI) / 180
  const dLa = la2 - la1
  const dLo = ((b[1] - a[1]) * Math.PI) / 180
  const h =
    Math.sin(dLa / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLo / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

const busCache = new Map<string, Promise<ShapeFile | null>>()
const gmbCache = new Map<string, Promise<ShapeFile | null>>()
let mtrCache: Promise<MtrShapes | null> | null = null

async function loadJson<T>(u: string): Promise<T | null> {
  try {
    const res = await fetch(u)
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

function loadBusFile(operator: string, route: string): Promise<ShapeFile | null> {
  const key = `${operator}-${route}`
  const hit = busCache.get(key)
  if (hit) return hit
  const p = loadJson<ShapeFile>(url(`bus/${encodeURIComponent(key)}.json`))
  busCache.set(key, p)
  p.then((d) => {
    if (!d) busCache.delete(key) // 下次再試，唔好記住失敗
  })
  return p
}

function loadGmbFile(code: string): Promise<ShapeFile | null> {
  const hit = gmbCache.get(code)
  if (hit) return hit
  const p = loadJson<ShapeFile>(url(`gmb/${encodeURIComponent(code)}.json`))
  gmbCache.set(code, p)
  p.then((d) => {
    if (!d) gmbCache.delete(code)
  })
  return p
}

export function getMtrShapes(): Promise<MtrShapes | null> {
  if (!mtrCache) mtrCache = loadJson<MtrShapes>(url('mtr.json'))
  return mtrCache
}

/** Pick the variant that best matches the first/last stop, reversing if needed. */
export function pickPath(
  variants: ShapeVariant[] | undefined,
  first?: LatLng | null,
  last?: LatLng | null,
  preferBound?: string | null
): LatLng[] | null {
  if (!variants || !variants.length) return null
  let best: { score: number; path: LatLng[] } | null = null
  for (const v of variants) {
    const p = v.p
    if (!p || p.length < 2) continue
    const a = p[0]
    const z = p[p.length - 1]
    let score: number
    let reverse = false
    if (first && last) {
      const fwd = hav(first, a) + hav(last, z)
      const rev = hav(first, z) + hav(last, a)
      reverse = rev < fwd
      score = Math.min(fwd, rev)
    } else if (first) {
      const fwd = hav(first, a)
      const rev = hav(first, z)
      reverse = rev < fwd
      score = Math.min(fwd, rev)
    } else {
      score = 0
    }
    // 同方向優先，避免頭尾站幾乎一樣（循環線）時揀錯
    if (preferBound && v.b && v.b !== 'C') {
      score += v.b === preferBound ? 0 : 60
    }
    if (!best || score < best.score) {
      best = { score, path: reverse ? [...p].reverse() : p }
    }
  }
  // 頭站離兩端都太遠，即係呢條線唔啱用（例如資料係另一區同名路線）
  if (!best || (first && best.score > 800 && hav(first, best.path[0]) > 800)) return null
  return best.path
}

/** 巴士路線軌跡（KMB / CTB），冇資料時回 null */
export async function getBusPath(
  operator: string,
  route: string,
  first?: LatLng | null,
  last?: LatLng | null,
  preferBound?: string | null,
  serviceType?: string | null
): Promise<LatLng[] | null> {
  // 聯營過海線（KMB+CTB）兩邊都有機會有檔案，是但一邊搵到就用
  const ops = [operator, operator === 'KMB' ? 'CTB' : 'KMB'].filter(Boolean)
  for (const op of ops) {
    const d = await loadBusFile(op, route)
    if (!d) continue
    let vs = d.v
    if (serviceType) {
      const same = vs.filter((v) => v.st === serviceType)
      if (same.length) vs = same
    }
    const p = pickPath(vs, first, last, preferBound)
    if (p) return p
  }
  return null
}

/** 綠色專線小巴軌跡，冇資料時回 null */
export async function getGmbPath(
  code: string,
  first?: LatLng | null,
  last?: LatLng | null
): Promise<LatLng[] | null> {
  const d = await loadGmbFile(code)
  if (!d) return null
  return pickPath(d.v, first, last, null)
}
