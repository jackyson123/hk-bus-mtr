import type { BusStop } from '../types'
import type { RouteVariant } from './api'

const STOPS_KEY = 'hk-bus-mtr-fav-stops'
const ROUTES_KEY = 'hk-bus-mtr-fav-routes'

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
    operator: stop.operator,
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
