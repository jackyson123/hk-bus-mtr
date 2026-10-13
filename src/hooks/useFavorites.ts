import { useState, useCallback, useEffect } from 'react'
import type { BusStop } from '../types'
import type { RouteVariant } from '../lib/api'
import {
  loadFavStops,
  loadFavRoutes,
  saveFavStops,
  saveFavRoutes,
  stopToFav,
  variantToFav,
  favKeyStop,
  favKeyRoute,
  type FavStop,
  type FavRoute,
} from '../lib/favorites'

export function useFavorites() {
  const [favStops, setFavStops] = useState<FavStop[]>([])
  const [favRoutes, setFavRoutes] = useState<FavRoute[]>([])

  useEffect(() => {
    setFavStops(loadFavStops())
    setFavRoutes(loadFavRoutes())
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

  return {
    favStops,
    favRoutes,
    isStopFav,
    isRouteFav,
    toggleStop,
    toggleRoute,
    removeStop,
    removeRoute,
  }
}
