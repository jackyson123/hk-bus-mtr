import type { BusStop } from '../types'
import type { RouteVariant } from './api'

const STOPS_KEY = 'hk-bus-mtr-fav-stops'
const ROUTES_KEY = 'hk-bus-mtr-fav-routes'
const ROUTE_STOPS_KEY = 'hk-bus-mtr-fav-route-stops'
const GMB_KEY = 'hk-bus-mtr-fav-gmb'
const MTR_KEY = 'hk-bus-mtr-fav-mtr'

export interface FavStop {
  id: string
  name_tc: string
  name_en: string
  lat: number
  lng: number
  operator: 'KMB' | 'CTB' | 'MTR'
  savedAt: number
}

export interface FavRoute {
  operator: 'KMB' | 'CTB'
  route: string
  bound: string
  service_type: string
  dest_tc: string
  dest_en: string
  orig_tc: string
  orig_en: string
  label_tc: string
  label_en: string
  savedAt: number
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* quota / private mode */
  }
}

export function loadFavStops(): FavStop[] {
  return readJson<FavStop[]>(STOPS_KEY, [])
}

export function loadFavRoutes(): FavRoute[] {
  return readJson<FavRoute[]>(ROUTES_KEY, [])
}

export function saveFavStops(list: FavStop[]) {
  writeJson(STOPS_KEY, list)
}

export function saveFavRoutes(list: FavRoute[]) {
  writeJson(ROUTES_KEY, list)
}

export function stopToFav(stop: BusStop): FavStop {
  return {
    id: stop.id,
    name_tc: stop.name_tc,
    name_en: stop.name_en,
    lat: stop.lat,
    lng: stop.lng,
    operator: stop.operator as FavStop['operator'],
    savedAt: Date.now(),
  }
}

export function variantToFav(v: RouteVariant): FavRoute {
  return {
    operator: v.operator,
    route: v.route,
    bound: v.bound,
    service_type: v.service_type,
    dest_tc: v.dest_tc,
    dest_en: v.dest_en,
    orig_tc: v.orig_tc,
    orig_en: v.orig_en,
    label_tc: v.label_tc,
    label_en: v.label_en,
    savedAt: Date.now(),
  }
}

export function favKeyStop(operator: string, id: string) {
  return `${operator}:${id}`
}

export function favKeyRoute(v: {
  operator: string
  route: string
  bound: string
  service_type: string
}) {
  return `${v.operator}:${v.route}:${v.bound}:${v.service_type}`
}

export interface FavRouteStop {
  operator: string
  route: string
  bound: string
  service_type: string
  dest_tc: string
  dest_en: string
  orig_tc: string
  orig_en: string
  stopId: string
  stopName_tc: string
  stopName_en: string
  stopLat: number
  stopLng: number
  seq: number
  /** 聯營 partners 序列化 */
  partnersJson?: string
  savedAt: number
}

export function loadFavRouteStops(): FavRouteStop[] {
  return readJson<FavRouteStop[]>(ROUTE_STOPS_KEY, [])
}

export function saveFavRouteStops(list: FavRouteStop[]) {
  writeJson(ROUTE_STOPS_KEY, list)
}

export function favKeyRouteStop(v: {
  operator: string
  route: string
  bound: string
  service_type: string
  stopId: string
}) {
  return `${v.operator}:${v.route}:${v.bound}:${v.service_type}:${v.stopId}`
}

/* ------------------------------------------------------------------ */
/* 綠色專線小巴（小巴路線 + 方向 + 站）                                  */
/* ------------------------------------------------------------------ */

export interface FavGmb {
  region: string // HKI / KLN / NT
  routeId: number
  routeSeq: number
  routeCode: string
  dest_tc: string
  dest_en: string
  orig_tc: string
  orig_en: string
  stopId: number
  stopSeq: number
  stopName_tc: string
  stopName_en: string
  fare: number | null
  savedAt: number
}

export function loadFavGmb(): FavGmb[] {
  return readJson<FavGmb[]>(GMB_KEY, [])
}

export function saveFavGmb(list: FavGmb[]) {
  writeJson(GMB_KEY, list)
}

export function favKeyGmb(v: { routeId: number; routeSeq: number; stopId: number }) {
  return `${v.routeId}:${v.routeSeq}:${v.stopId}`
}

/* ------------------------------------------------------------------ */
/* 港鐵（線 + 站）                                                      */
/* ------------------------------------------------------------------ */

export interface FavMtr {
  line: string
  station: string
  line_tc: string
  line_en: string
  station_tc: string
  station_en: string
  color: string
  savedAt: number
}

export function loadFavMtr(): FavMtr[] {
  return readJson<FavMtr[]>(MTR_KEY, [])
}

export function saveFavMtr(list: FavMtr[]) {
  writeJson(MTR_KEY, list)
}

export function favKeyMtr(v: { line: string; station: string }) {
  return `${v.line}:${v.station}`
}
