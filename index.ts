export type Lang = 'tc' | 'en'

export type Operator = 'KMB' | 'CTB' | 'MTR'

export interface BusStop {
  id: string
  name_tc: string
  name_en: string
  lat: number
  lng: number
  operator: Operator
}

export interface BusRoute {
  route: string
  dest_tc: string
  dest_en: string
  orig_tc: string
  orig_en: string
  service_type?: string | number
  bound?: string // O / I
  operator: Operator
}

export interface EtaItem {
  route: string
  dest_tc: string
  dest_en: string
  eta: string | null // ISO or null
  eta_seq: number
  rmk_tc?: string
  rmk_en?: string
  operator: Operator
  co?: string
}

export interface MtrLine {
  code: string
  name_tc: string
  name_en: string
  color: string
}

export interface MtrStation {
  code: string
  name_tc: string
  name_en: string
  line: string
}

export interface MtrSchedule {
  dest: string       // station code e.g. TUC
  destName: string   // display name
  time: string       // ISO-ish or raw
  ttnt: number       // minutes until arrival
  plat: string
  seq: number
  direction: 'UP' | 'DOWN'
}

export interface NearbyStop extends BusStop {
  distance: number // meters
}
