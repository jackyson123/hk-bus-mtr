import { useState, useCallback, useEffect } from 'react'
import type { BusStop } from '../types'
import type { RouteVariant } from '../lib/api'
import {
  loadFavStops,
  loadFavRoutes,
  loadFavRouteStops,
  loadFavGmb,
  loadFavMtr,
  loadFavLr,
  saveFavStops,
  saveFavRoutes,
  saveFavRouteStops,
  saveFavGmb,
  saveFavMtr,
  saveFavLr,
  stopToFav,
  variantToFav,
  favKeyStop,
  favKeyRoute,
  favKeyRouteStop,
  favKeyGmb,
  favKeyMtr,
  favKeyLr,
  type FavStop,
  type FavRoute,
  type FavRouteStop,
  type FavGmb,
  type FavMtr,
  type FavLr,
} from '../lib/favorites'

export function useFavorites() {
  const [favStops, setFavStops] = useState<FavStop[]>([])
  const [favRoutes, setFavRoutes] = useState<FavRoute[]>([])
  const [favRouteStops, setFavRouteStops] = useState<FavRouteStop[]>([])
  const [favGmb, setFavGmb] = useState<FavGmb[]>([])
  const [favMtr, setFavMtr] = useState<FavMtr[]>([])
  const [favLr, setFavLr] = useState<FavLr[]>([])

  useEffect(() => {
    setFavStops(loadFavStops())
    setFavRoutes(loadFavRoutes())
    setFavRouteStops(loadFavRouteStops())
    setFavGmb(loadFavGmb())
    setFavMtr(loadFavMtr())
    setFavLr(loadFavLr())
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

  const isGmbFav = useCallback(
    (v: { routeId: number; routeSeq: number; stopId: number }) =>
      favGmb.some((r) => favKeyGmb(r) === favKeyGmb(v)),
    [favGmb]
  )

  const isMtrFav = useCallback(
    (v: { line: string; station: string }) =>
      favMtr.some((r) => favKeyMtr(r) === favKeyMtr(v)),
    [favMtr]
  )

  const isLrFav = useCallback(
    (v: { route: string; stopId: number }) =>
      favLr.some((r) => favKeyLr(r) === favKeyLr(v)),
    [favLr]
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

  const toggleGmb = useCallback((item: Omit<FavGmb, 'savedAt'>) => {
    setFavGmb((prev) => {
      const key = favKeyGmb(item)
      const exists = prev.some((r) => favKeyGmb(r) === key)
      const next = exists
        ? prev.filter((r) => favKeyGmb(r) !== key)
        : [{ ...item, savedAt: Date.now() }, ...prev].slice(0, 40)
      saveFavGmb(next)
      return next
    })
  }, [])

  const toggleMtr = useCallback((item: Omit<FavMtr, 'savedAt'>) => {
    setFavMtr((prev) => {
      const key = favKeyMtr(item)
      const exists = prev.some((r) => favKeyMtr(r) === key)
      const next = exists
        ? prev.filter((r) => favKeyMtr(r) !== key)
        : [{ ...item, savedAt: Date.now() }, ...prev].slice(0, 40)
      saveFavMtr(next)
      return next
    })
  }, [])

  const toggleLr = useCallback((item: Omit<FavLr, 'savedAt'>) => {
    setFavLr((prev) => {
      const key = favKeyLr(item)
      const exists = prev.some((r) => favKeyLr(r) === key)
      const next = exists
        ? prev.filter((r) => favKeyLr(r) !== key)
        : [{ ...item, savedAt: Date.now() }, ...prev].slice(0, 40)
      saveFavLr(next)
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

  const removeGmb = useCallback(
    (v: { routeId: number; routeSeq: number; stopId: number }) => {
      setFavGmb((prev) => {
        const next = prev.filter((r) => favKeyGmb(r) !== favKeyGmb(v))
        saveFavGmb(next)
        return next
      })
    },
    []
  )

  const removeMtr = useCallback((v: { line: string; station: string }) => {
    setFavMtr((prev) => {
      const next = prev.filter((r) => favKeyMtr(r) !== favKeyMtr(v))
      saveFavMtr(next)
      return next
    })
  }, [])

  const removeLr = useCallback((v: { route: string; stopId: number }) => {
    setFavLr((prev) => {
      const next = prev.filter((r) => favKeyLr(r) !== favKeyLr(v))
      saveFavLr(next)
      return next
    })
  }, [])

  return {
    favStops,
    favRoutes,
    favRouteStops,
    favGmb,
    favMtr,
    favLr,
    isStopFav,
    isRouteFav,
    isRouteStopFav,
    isGmbFav,
    isMtrFav,
    isLrFav,
    toggleStop,
    toggleRoute,
    toggleRouteStop,
    toggleGmb,
    toggleMtr,
    toggleLr,
    removeStop,
    removeRoute,
    removeRouteStop,
    removeGmb,
    removeMtr,
    removeLr,
  }
}
