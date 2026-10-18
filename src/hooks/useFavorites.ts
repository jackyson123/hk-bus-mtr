import { useState, useCallback, useEffect } from 'react'
import type { BusStop } from '../types'
import type { RouteVariant } from '../lib/api'
import {
  loadFavStops,
  loadFavRoutes,
  loadFavRouteStops,
  saveFavStops,
  saveFavRoutes,
  saveFavRouteStops,
  stopToFav,
  variantToFav,
  favKeyStop,
  favKeyRoute,
  favKeyRouteStop,
  type FavStop,
  type FavRoute,
  type FavRouteStop,
} from '../lib/favorites'

export function useFavorites() {
  const [favStops, setFavStops] = useState<FavStop[]>([])
  const [favRoutes, setFavRoutes] = useState<FavRoute[]>([])
  const [favRouteStops, setFavRouteStops] = useState<FavRouteStop[]>([])

  useEffect(() => {
    setFavStops(loadFavStops())
    setFavRoutes(loadFavRoutes())
    setFavRouteStops(loadFavRouteStops())
  }, [])

  const isStopFav = useCallback(
    (operator: string, id: string) =>
      favStops.some((s) => favKeyStop(s.operator, s.id) === favKeyStop(operator, id)),
    [favStops]
  )

  const isRouteFav = useCallback(
    (v: { operator: string; route: string; bound: string; service_type: string }) =>
      favRoutes.some((r) => favKeyRoute(r) === favKeyRoute(v)),
    [favRoutes]
  )

  const isRouteStopFav = useCallback(
    (v: {
      operator: string
      route: string
      bound: string
      service_type: string
      stopId: string
    }) =>
      favRouteStops.some((r) => favKeyRouteStop(r) === favKeyRouteStop(v)),
    [favRouteStops]
  )

  const toggleStop = useCallback((stop: BusStop) => {
    setFavStops((prev) => {
      const key = favKeyStop(stop.operator, stop.id)
      const exists = prev.some((s) => favKeyStop(s.operator, s.id) === key)
      const next = exists
        ? prev.filter((s) => favKeyStop(s.operator, s.id) !== key)
        : [stopToFav(stop), ...prev].slice(0, 50)
      saveFavStops(next)
      return next
    })
  }, [])

  const toggleRoute = useCallback((v: RouteVariant) => {
    setFavRoutes((prev) => {
      const key = favKeyRoute(v)
      const exists = prev.some((r) => favKeyRoute(r) === key)
      const next = exists
        ? prev.filter((r) => favKeyRoute(r) !== key)
        : [variantToFav(v), ...prev].slice(0, 30)
      saveFavRoutes(next)
      return next
    })
  }, [])

  const toggleRouteStop = useCallback((item: FavRouteStop) => {
    setFavRouteStops((prev) => {
      const key = favKeyRouteStop(item)
      const exists = prev.some((r) => favKeyRouteStop(r) === key)
      const next = exists
        ? prev.filter((r) => favKeyRouteStop(r) !== key)
        : [{ ...item, savedAt: Date.now() }, ...prev].slice(0, 40)
      saveFavRouteStops(next)
      return next
    })
  }, [])

  const removeStop = useCallback((operator: string, id: string) => {
    setFavStops((prev) => {
      const next = prev.filter(
        (s) => favKeyStop(s.operator, s.id) !== favKeyStop(operator, id)
      )
      saveFavStops(next)
      return next
    })
  }, [])

  const removeRoute = useCallback(
    (v: { operator: string; route: string; bound: string; service_type: string }) => {
      setFavRoutes((prev) => {
        const next = prev.filter((r) => favKeyRoute(r) !== favKeyRoute(v))
        saveFavRoutes(next)
        return next
      })
    },
    []
  )

  const removeRouteStop = useCallback(
    (v: {
      operator: string
      route: string
      bound: string
      service_type: string
      stopId: string
    }) => {
      setFavRouteStops((prev) => {
        const next = prev.filter((r) => favKeyRouteStop(r) !== favKeyRouteStop(v))
        saveFavRouteStops(next)
        return next
      })
    },
    []
  )

  return {
    favStops,
    favRoutes,
    favRouteStops,
    isStopFav,
    isRouteFav,
    isRouteStopFav,
    toggleStop,
    toggleRoute,
    toggleRouteStop,
    removeStop,
    removeRoute,
    removeRouteStop,
  }
}
