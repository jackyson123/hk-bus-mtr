import { useState, useEffect, useCallback, useMemo } from 'react'
import MapView from './components/MapView'
import EtaList from './components/EtaList'
import MtrPanel from './components/MtrPanel'
import { useGeolocation } from './hooks/useGeolocation'
import {
  getKmbStops,
  getKmbStopEta,
  getCtbEta,
  getCtbStop,
  haversine,
} from './lib/api'
import type { BusStop, EtaItem, Lang, NearbyStop } from './types'

type Tab = 'bus' | 'mtr'

export default function App() {
  const [lang, setLang] = useState<Lang>('tc')
  const [tab, setTab] = useState<Tab>('bus')
  const [allKmbStops, setAllKmbStops] = useState<BusStop[]>([])
  const [nearby, setNearby] = useState<NearbyStop[]>([])
  const [selectedStop, setSelectedStop] = useState<BusStop | null>(null)
  const [etas, setEtas] = useState<EtaItem[]>([])
  const [etaLoading, setEtaLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [mapExpanded, setMapExpanded] = useState(true)
  const [stopsLoading, setStopsLoading] = useState(true)
  const [routeInput, setRouteInput] = useState('')
  const [ctbStopId, setCtbStopId] = useState('')

  const { lat, lng, error: geoError, loading: geoLoading, request: requestGeo } =
    useGeolocation(false)

  // Load KMB stops once
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setStopsLoading(true)
        const stops = await getKmbStops()
        if (!cancelled) setAllKmbStops(stops)
      } catch (e) {
        console.error('Failed to load KMB stops', e)
      } finally {
        if (!cancelled) setStopsLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // Compute nearby when location + stops ready
  useEffect(() => {
    if (!lat || !lng || !allKmbStops.length) return
    const list: NearbyStop[] = allKmbStops
      .map((s) => ({
        ...s,
        distance: haversine(lat, lng, s.lat, s.lng),
      }))
      .filter((s) => s.distance < 800)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 30)
    setNearby(list)
    if (!selectedStop && list.length) {
      setSelectedStop(list[0])
    }
  }, [lat, lng, allKmbStops])

  // Load ETA when stop selected
  const loadEta = useCallback(async (stop: BusStop) => {
    setEtaLoading(true)
    setEtas([])
    try {
      if (stop.operator === 'KMB') {
        const data = await getKmbStopEta(stop.id)
        setEtas(data)
      } else if (stop.operator === 'CTB') {
        // For CTB we need route; try common approach: user can enter route
        // For demo we show message
        setEtas([])
      }
    } catch (e) {
      console.error(e)
      setEtas([])
    } finally {
      setEtaLoading(false)
    }
  }, [])

  useEffect(() => {
    if (selectedStop) loadEta(selectedStop)
  }, [selectedStop, loadEta])

  // Auto refresh ETA
  useEffect(() => {
    if (!selectedStop) return
    const t = setInterval(() => loadEta(selectedStop), 30000)
    return () => clearInterval(t)
  }, [selectedStop, loadEta])

  const filteredNearby = useMemo(() => {
    if (!search.trim()) return nearby
    const q = search.trim().toLowerCase()
    return nearby.filter(
      (s) =>
        s.name_tc.includes(q) ||
        s.name_en.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q)
    )
  }, [nearby, search])

  const handleSelectStop = (stop: BusStop) => {
    setSelectedStop(stop)
    setTab('bus')
  }

  // CTB quick lookup by stop + route
  const loadCtb = async () => {
    if (!ctbStopId || !routeInput) return
    setEtaLoading(true)
    try {
      const stopInfo = await getCtbStop(ctbStopId)
      if (stopInfo) setSelectedStop(stopInfo)
      const data = await getCtbEta(ctbStopId, routeInput.toUpperCase())
      setEtas(data)
    } catch (e) {
      console.error(e)
      setEtas([])
    } finally {
      setEtaLoading(false)
    }
  }

  return (
    <div className="h-full flex flex-col bg-slate-950 text-slate-100">
      {/* Header */}
      <header className="flex-shrink-0 border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-3 py-2.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-red-500 to-blue-600 flex items-center justify-center text-sm font-bold">
              巴
            </div>
            <div>
              <h1 className="font-bold text-base leading-tight">
                hk-bus-mtr
              </h1>
              <p className="text-[10px] text-slate-400 leading-none">
                {lang === 'tc' ? '九巴 · 城巴 · 港鐵' : 'KMB · Citybus · MTR'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setLang(lang === 'tc' ? 'en' : 'tc')}
              className="px-2.5 py-1 rounded-lg bg-slate-800 text-xs font-medium hover:bg-slate-700"
            >
              {lang === 'tc' ? 'EN' : '繁'}
            </button>
            <button
              onClick={requestGeo}
              disabled={geoLoading}
              className="px-2.5 py-1 rounded-lg bg-emerald-600/80 hover:bg-emerald-500 text-xs font-medium disabled:opacity-50"
            >
              {geoLoading
                ? '…'
                : lang === 'tc'
                ? '定位'
                : 'Locate'}
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="max-w-7xl mx-auto px-3 flex gap-1 pb-2">
          <button
            onClick={() => setTab('bus')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${
              tab === 'bus'
                ? 'bg-slate-700 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {lang === 'tc' ? '巴士' : 'Bus'}
          </button>
          <button
            onClick={() => setTab('mtr')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${
              tab === 'mtr'
                ? 'bg-slate-700 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {lang === 'tc' ? '港鐵' : 'MTR'}
          </button>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 min-h-0 flex flex-col md:flex-row max-w-7xl w-full mx-auto">
        {/* Map panel — responsive: full on desktop, collapsible on mobile */}
        {tab === 'bus' && (
          <div
            className={`map-panel relative border-b md:border-b-0 md:border-r border-slate-800 md:h-auto md:w-[45%] lg:w-[50%] ${
              mapExpanded ? 'h-52' : 'h-10'
            }`}
          >
            {/* Mobile toggle */}
            <button
              onClick={() => setMapExpanded((v) => !v)}
              className="md:hidden absolute top-2 right-2 z-10 px-2.5 py-1 rounded-lg bg-slate-900/90 text-xs border border-slate-700"
            >
              {mapExpanded
                ? lang === 'tc'
                  ? '收起地圖'
                  : 'Hide map'
                : lang === 'tc'
                ? '顯示地圖'
                : 'Show map'}
            </button>

            <div className={`${mapExpanded ? 'h-full' : 'h-0 overflow-hidden'} md:h-full`}>
              <MapView
                userLat={lat}
                userLng={lng}
                stops={filteredNearby.length ? filteredNearby : nearby}
                selectedStopId={selectedStop?.id ?? null}
                onSelectStop={handleSelectStop}
                lang={lang}
                height="100%"
              />
            </div>
          </div>
        )}

        {/* Content panel */}
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {tab === 'mtr' ? (
            <MtrPanel lang={lang} />
          ) : (
            <>
              {/* Search + nearby list */}
              <div className="flex-shrink-0 p-3 space-y-2 border-b border-slate-800">
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={
                    lang === 'tc'
                      ? '搜尋附近站名…'
                      : 'Search nearby stops…'
                  }
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
                />

                {geoError && (
                  <p className="text-xs text-amber-400">
                    {lang === 'tc'
                      ? '無法取得定位，請允許位置權限或手動選站'
                      : 'Location unavailable. Allow permission or pick a stop.'}
                  </p>
                )}

                {!lat && !geoLoading && (
                  <button
                    onClick={requestGeo}
                    className="w-full py-2 rounded-xl bg-emerald-600/20 border border-emerald-500/30 text-emerald-300 text-sm"
                  >
                    {lang === 'tc'
                      ? '點擊取得附近巴士站'
                      : 'Get nearby bus stops'}
                  </button>
                )}

                {/* CTB manual lookup */}
                <details className="text-sm">
                  <summary className="cursor-pointer text-slate-400 hover:text-slate-200">
                    {lang === 'tc' ? '城巴手動查詢 (Stop ID + 路線)' : 'Citybus manual (Stop ID + Route)'}
                  </summary>
                  <div className="mt-2 flex gap-2">
                    <input
                      value={ctbStopId}
                      onChange={(e) => setCtbStopId(e.target.value)}
                      placeholder="Stop ID e.g. 001027"
                      className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs"
                    />
                    <input
                      value={routeInput}
                      onChange={(e) => setRouteInput(e.target.value)}
                      placeholder="Route e.g. 1"
                      className="w-20 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs"
                    />
                    <button
                      onClick={loadCtb}
                      className="px-3 py-1.5 rounded-lg bg-ctb text-white text-xs font-medium"
                    >
                      {lang === 'tc' ? '查' : 'Go'}
                    </button>
                  </div>
                </details>
              </div>

              {/* Nearby stops chips */}
              {filteredNearby.length > 0 && (
                <div className="flex-shrink-0 px-3 py-2 overflow-x-auto flex gap-2 border-b border-slate-800">
                  {filteredNearby.slice(0, 12).map((s) => (
                    <button
                      key={s.id}
                      onClick={() => handleSelectStop(s)}
                      className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs border transition ${
                        selectedStop?.id === s.id
                          ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                          : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-500'
                      }`}
                    >
                      {lang === 'tc' ? s.name_tc : s.name_en}
                      <span className="ml-1 opacity-60">
                        {Math.round(s.distance)}m
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {/* Selected stop header */}
              {selectedStop && (
                <div className="flex-shrink-0 px-3 py-2 bg-slate-900/50 flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-sm">
                      {lang === 'tc'
                        ? selectedStop.name_tc
                        : selectedStop.name_en}
                    </div>
                    <div className="text-xs text-slate-400">
                      {selectedStop.operator} · {selectedStop.id}
                    </div>
                  </div>
                  <button
                    onClick={() => loadEta(selectedStop)}
                    className="text-xs text-slate-400 hover:text-white"
                  >
                    {lang === 'tc' ? '更新' : 'Refresh'}
                  </button>
                </div>
              )}

              {/* ETA list */}
              <div className="flex-1 overflow-y-auto">
                {stopsLoading ? (
                  <div className="p-6 text-center text-slate-400 text-sm">
                    {lang === 'tc' ? '載入站點資料中…' : 'Loading stops…'}
                  </div>
                ) : (
                  <EtaList etas={etas} lang={lang} loading={etaLoading} />
                )}
              </div>
            </>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="flex-shrink-0 text-center text-[10px] text-slate-500 py-1.5 border-t border-slate-800">
        Data: data.gov.hk · KMB · Citybus · MTR · Not affiliated
      </footer>
    </div>
  )
}
