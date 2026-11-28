// 輕鐵路線／車站靜態資料
// 來源：港鐵開放數據 light_rail_routes_and_stops.csv（opendata.mtr.com.hk）
// 車站 ID 用嚟查實時班次：rt.data.gov.hk/v1/transport/mtr/lrt/getSchedule

export interface LrStop {
  code: string
  id: number
  name_tc: string
  name_en: string
  /** WGS84 緯度／經度（政府 geocom 資料轉換；海皇路為前後兩站中點估算） */
  lat: number
  lng: number
}

export interface LrRoute {
  code: string
  orig_tc: string
  orig_en: string
  dest_tc: string
  dest_en: string
  stops: LrStop[]
}

export const LR_ROUTES: LrRoute[] = [
  {
    code: "505",
    orig_tc: "三聖", orig_en: "Sam Shing",
    dest_tc: "兆康", dest_en: "Siu Hong",
    stops: [
      { code: "SAS", id: 920, name_tc: "三聖", name_en: "Sam Shing", lat: 22.3829, lng: 113.97686 },
      { code: "SIL", id: 265, name_tc: "兆麟", name_en: "Siu Lun", lat: 22.38456, lng: 113.97509 },
      { code: "ONT", id: 270, name_tc: "安定", name_en: "On Ting", lat: 22.38764, lng: 113.97507 },
      { code: "TOC", id: 280, name_tc: "市中心", name_en: "Town Centre", lat: 22.39136, lng: 113.97489 },
      { code: "TML", id: 295, name_tc: "屯門", name_en: "Tuen Mun", lat: 22.39372, lng: 113.97331 },
      { code: "KIO", id: 60, name_tc: "建安", name_en: "Kin On", lat: 22.39513, lng: 113.9689 },
      { code: "SKS", id: 190, name_tc: "山景(南)", name_en: "Shan King (South)", lat: 22.39662, lng: 113.96598 },
      { code: "SKN", id: 180, name_tc: "山景(北)", name_en: "Shan King (North)", lat: 22.39851, lng: 113.96662 },
      { code: "SHP", id: 170, name_tc: "石排", name_en: "Shek Pai", lat: 22.40138, lng: 113.96769 },
      { code: "SAW", id: 160, name_tc: "新圍", name_en: "San Wai", lat: 22.40529, lng: 113.96442 },
      { code: "LEK", id: 150, name_tc: "良景", name_en: "Leung King", lat: 22.40669, lng: 113.96363 },
      { code: "TNK", id: 140, name_tc: "田景", name_en: "Tin King", lat: 22.40771, lng: 113.96643 },
      { code: "KIS", id: 130, name_tc: "建生", name_en: "Kin Sang", lat: 22.40673, lng: 113.96918 },
      { code: "CHC", id: 120, name_tc: "青松", name_en: "Ching Chung", lat: 22.40729, lng: 113.97252 },
      { code: "KEL", id: 110, name_tc: "麒麟", name_en: "Kei Lun", lat: 22.41097, lng: 113.97634 },
      { code: "SHL", id: 100, name_tc: "兆康", name_en: "Siu Hong", lat: 22.4119, lng: 113.97822 },
    ],
  },
  {
    code: "507",
    orig_tc: "屯門碼頭", orig_en: "Tuen Mun Ferry Pier",
    dest_tc: "田景", dest_en: "Tin King",
    stops: [
      { code: "FEP", id: 1, name_tc: "屯門碼頭", name_en: "Tuen Mun Ferry Pier", lat: 22.37272, lng: 113.96712 },
      { code: "SHE", id: 240, name_tc: "兆禧", name_en: "Siu Hei", lat: 22.37524, lng: 113.9669 },
      { code: "TSP", id: 250, name_tc: "海皇路", name_en: "Hoi Wong Road", lat: 22.37926, lng: 113.96994 },
      { code: "GOG", id: 260, name_tc: "豐景園", name_en: "Goodview Garden", lat: 22.38327, lng: 113.97299 },
      { code: "SIL", id: 265, name_tc: "兆麟", name_en: "Siu Lun", lat: 22.38456, lng: 113.97509 },
      { code: "ONT", id: 270, name_tc: "安定", name_en: "On Ting", lat: 22.38764, lng: 113.97507 },
      { code: "TOC", id: 280, name_tc: "市中心", name_en: "Town Centre", lat: 22.39136, lng: 113.97489 },
      { code: "TML", id: 295, name_tc: "屯門", name_en: "Tuen Mun", lat: 22.39372, lng: 113.97331 },
      { code: "HOT", id: 70, name_tc: "河田", name_en: "Ho Tin", lat: 22.39738, lng: 113.97313 },
      { code: "CYB", id: 75, name_tc: "蔡意橋", name_en: "Choy Yee Bridge", lat: 22.39993, lng: 113.97417 },
      { code: "NGW", id: 230, name_tc: "銀圍", name_en: "Ngan Wai", lat: 22.40239, lng: 113.97484 },
      { code: "THS", id: 220, name_tc: "大興(南)", name_en: "Tai Hing (South)", lat: 22.40267, lng: 113.97197 },
      { code: "THN", id: 212, name_tc: "大興(北)", name_en: "Tai Hing (North)", lat: 22.4046, lng: 113.96998 },
      { code: "SAW", id: 160, name_tc: "新圍", name_en: "San Wai", lat: 22.40529, lng: 113.96442 },
      { code: "LEK", id: 150, name_tc: "良景", name_en: "Leung King", lat: 22.40669, lng: 113.96363 },
      { code: "TNK", id: 140, name_tc: "田景", name_en: "Tin King", lat: 22.40771, lng: 113.96643 },
    ],
  },
  {
    code: "610",
    orig_tc: "屯門碼頭", orig_en: "Tuen Mun Ferry Pier",
    dest_tc: "元朗", dest_en: "Yuen Long",
    stops: [
      { code: "FEP", id: 1, name_tc: "屯門碼頭", name_en: "Tuen Mun Ferry Pier", lat: 22.37272, lng: 113.96712 },
      { code: "MEG", id: 10, name_tc: "美樂", name_en: "Melody Garden", lat: 22.37505, lng: 113.96111 },
      { code: "BUT", id: 15, name_tc: "蝴蝶", name_en: "Butterfly", lat: 22.37817, lng: 113.96166 },
      { code: "LRD", id: 20, name_tc: "輕鐵車廠", name_en: "Light Rail Depot", lat: 22.38181, lng: 113.96342 },
      { code: "LUM", id: 30, name_tc: "龍門", name_en: "Lung Mun", lat: 22.38526, lng: 113.96498 },
      { code: "TSS", id: 40, name_tc: "青山村", name_en: "Tsing Shan Tsuen", lat: 22.3904, lng: 113.96696 },
      { code: "TWN", id: 50, name_tc: "青雲", name_en: "Tsing Wun", lat: 22.39434, lng: 113.9674 },
      { code: "MIK", id: 200, name_tc: "鳴琴", name_en: "Ming Kum", lat: 22.39706, lng: 113.96734 },
      { code: "SHP", id: 170, name_tc: "石排", name_en: "Shek Pai", lat: 22.40138, lng: 113.96769 },
      { code: "THN", id: 212, name_tc: "大興(北)", name_en: "Tai Hing (North)", lat: 22.4046, lng: 113.96998 },
      { code: "THS", id: 220, name_tc: "大興(南)", name_en: "Tai Hing (South)", lat: 22.40267, lng: 113.97197 },
      { code: "NGW", id: 230, name_tc: "銀圍", name_en: "Ngan Wai", lat: 22.40239, lng: 113.97484 },
      { code: "AFF", id: 80, name_tc: "澤豐", name_en: "Affluence", lat: 22.40349, lng: 113.97589 },
      { code: "TMH", id: 90, name_tc: "屯門醫院", name_en: "Tuen Mun Hospital", lat: 22.40777, lng: 113.97715 },
      { code: "SHL", id: 100, name_tc: "兆康", name_en: "Siu Hong", lat: 22.4119, lng: 113.97822 },
      { code: "LTE", id: 350, name_tc: "藍地", name_en: "Lam Tei", lat: 22.4185, lng: 113.98163 },
      { code: "NAW", id: 360, name_tc: "泥圍", name_en: "Nai Wai", lat: 22.42365, lng: 113.98632 },
      { code: "CUT", id: 370, name_tc: "鍾屋村", name_en: "Chung Uk Tsuen", lat: 22.42966, lng: 113.99223 },
      { code: "HSK", id: 380, name_tc: "洪水橋", name_en: "Hung Shui Kiu", lat: 22.43364, lng: 113.99736 },
      { code: "TOF", id: 390, name_tc: "塘坊村", name_en: "Tong Fong Tsuen", lat: 22.44011, lng: 114.00704 },
      { code: "PIS", id: 400, name_tc: "屏山", name_en: "Ping Shan", lat: 22.44282, lng: 114.01176 },
      { code: "SPW", id: 560, name_tc: "水邊圍", name_en: "Shui Pin Wai", lat: 22.44446, lng: 114.02045 },
      { code: "FNR", id: 570, name_tc: "豐年路", name_en: "Fung Nin Road", lat: 22.44447, lng: 114.0239 },
      { code: "HLR", id: 580, name_tc: "康樂路", name_en: "Hong Lok Road", lat: 22.44455, lng: 114.02661 },
      { code: "TTR", id: 590, name_tc: "大棠路", name_en: "Tai Tong Road", lat: 22.44452, lng: 114.02897 },
      { code: "YLL", id: 600, name_tc: "元朗", name_en: "Yuen Long", lat: 22.44572, lng: 114.03437 },
    ],
  },
  {
    code: "614",
    orig_tc: "屯門碼頭", orig_en: "Tuen Mun Ferry Pier",
    dest_tc: "元朗", dest_en: "Yuen Long",
    stops: [
      { code: "FEP", id: 1, name_tc: "屯門碼頭", name_en: "Tuen Mun Ferry Pier", lat: 22.37272, lng: 113.96712 },
      { code: "SHE", id: 240, name_tc: "兆禧", name_en: "Siu Hei", lat: 22.37524, lng: 113.9669 },
      { code: "TSP", id: 250, name_tc: "海皇路", name_en: "Hoi Wong Road", lat: 22.37926, lng: 113.96994 },
      { code: "GOG", id: 260, name_tc: "豐景園", name_en: "Goodview Garden", lat: 22.38327, lng: 113.97299 },
      { code: "SIL", id: 265, name_tc: "兆麟", name_en: "Siu Lun", lat: 22.38456, lng: 113.97509 },
      { code: "ONT", id: 270, name_tc: "安定", name_en: "On Ting", lat: 22.38764, lng: 113.97507 },
      { code: "TOC", id: 280, name_tc: "市中心", name_en: "Town Centre", lat: 22.39136, lng: 113.97489 },
      { code: "PUT", id: 300, name_tc: "杯渡", name_en: "Pui To", lat: 22.39461, lng: 113.9768 },
      { code: "HFT", id: 310, name_tc: "何福堂", name_en: "Hoh Fuk Tong", lat: 22.39737, lng: 113.9774 },
      { code: "SAH", id: 320, name_tc: "新墟", name_en: "San Hui", lat: 22.40022, lng: 113.97804 },
      { code: "PRV", id: 330, name_tc: "景峰", name_en: "Prime View", lat: 22.40313, lng: 113.9795 },
      { code: "FUT", id: 340, name_tc: "鳳地", name_en: "Fung Tei", lat: 22.40674, lng: 113.97874 },
      { code: "SHL", id: 100, name_tc: "兆康", name_en: "Siu Hong", lat: 22.4119, lng: 113.97822 },
      { code: "LTE", id: 350, name_tc: "藍地", name_en: "Lam Tei", lat: 22.4185, lng: 113.98163 },
      { code: "NAW", id: 360, name_tc: "泥圍", name_en: "Nai Wai", lat: 22.42365, lng: 113.98632 },
      { code: "CUT", id: 370, name_tc: "鍾屋村", name_en: "Chung Uk Tsuen", lat: 22.42966, lng: 113.99223 },
      { code: "HSK", id: 380, name_tc: "洪水橋", name_en: "Hung Shui Kiu", lat: 22.43364, lng: 113.99736 },
      { code: "TOF", id: 390, name_tc: "塘坊村", name_en: "Tong Fong Tsuen", lat: 22.44011, lng: 114.00704 },
      { code: "PIS", id: 400, name_tc: "屏山", name_en: "Ping Shan", lat: 22.44282, lng: 114.01176 },
      { code: "SPW", id: 560, name_tc: "水邊圍", name_en: "Shui Pin Wai", lat: 22.44446, lng: 114.02045 },
      { code: "FNR", id: 570, name_tc: "豐年路", name_en: "Fung Nin Road", lat: 22.44447, lng: 114.0239 },
      { code: "HLR", id: 580, name_tc: "康樂路", name_en: "Hong Lok Road", lat: 22.44455, lng: 114.02661 },
      { code: "TTR", id: 590, name_tc: "大棠路", name_en: "Tai Tong Road", lat: 22.44452, lng: 114.02897 },
      { code: "YLL", id: 600, name_tc: "元朗", name_en: "Yuen Long", lat: 22.44572, lng: 114.03437 },
    ],
  },
  {
    code: "614P",
    orig_tc: "屯門碼頭", orig_en: "Tuen Mun Ferry Pier",
    dest_tc: "兆康", dest_en: "Siu Hong",
    stops: [
      { code: "FEP", id: 1, name_tc: "屯門碼頭", name_en: "Tuen Mun Ferry Pier", lat: 22.37272, lng: 113.96712 },
      { code: "SHE", id: 240, name_tc: "兆禧", name_en: "Siu Hei", lat: 22.37524, lng: 113.9669 },
      { code: "TSP", id: 250, name_tc: "海皇路", name_en: "Hoi Wong Road", lat: 22.37926, lng: 113.96994 },
      { code: "GOG", id: 260, name_tc: "豐景園", name_en: "Goodview Garden", lat: 22.38327, lng: 113.97299 },
      { code: "SIL", id: 265, name_tc: "兆麟", name_en: "Siu Lun", lat: 22.38456, lng: 113.97509 },
      { code: "ONT", id: 270, name_tc: "安定", name_en: "On Ting", lat: 22.38764, lng: 113.97507 },
      { code: "TOC", id: 280, name_tc: "市中心", name_en: "Town Centre", lat: 22.39136, lng: 113.97489 },
      { code: "PUT", id: 300, name_tc: "杯渡", name_en: "Pui To", lat: 22.39461, lng: 113.9768 },
      { code: "HFT", id: 310, name_tc: "何福堂", name_en: "Hoh Fuk Tong", lat: 22.39737, lng: 113.9774 },
      { code: "SAH", id: 320, name_tc: "新墟", name_en: "San Hui", lat: 22.40022, lng: 113.97804 },
      { code: "PRV", id: 330, name_tc: "景峰", name_en: "Prime View", lat: 22.40313, lng: 113.9795 },
      { code: "FUT", id: 340, name_tc: "鳳地", name_en: "Fung Tei", lat: 22.40674, lng: 113.97874 },
      { code: "SHL", id: 100, name_tc: "兆康", name_en: "Siu Hong", lat: 22.4119, lng: 113.97822 },
    ],
  },
  {
    code: "615",
    orig_tc: "屯門碼頭", orig_en: "Tuen Mun Ferry Pier",
    dest_tc: "元朗", dest_en: "Yuen Long",
    stops: [
      { code: "FEP", id: 1, name_tc: "屯門碼頭", name_en: "Tuen Mun Ferry Pier", lat: 22.37272, lng: 113.96712 },
      { code: "MEG", id: 10, name_tc: "美樂", name_en: "Melody Garden", lat: 22.37505, lng: 113.96111 },
      { code: "BUT", id: 15, name_tc: "蝴蝶", name_en: "Butterfly", lat: 22.37817, lng: 113.96166 },
      { code: "LRD", id: 20, name_tc: "輕鐵車廠", name_en: "Light Rail Depot", lat: 22.38181, lng: 113.96342 },
      { code: "LUM", id: 30, name_tc: "龍門", name_en: "Lung Mun", lat: 22.38526, lng: 113.96498 },
      { code: "TSS", id: 40, name_tc: "青山村", name_en: "Tsing Shan Tsuen", lat: 22.3904, lng: 113.96696 },
      { code: "TWN", id: 50, name_tc: "青雲", name_en: "Tsing Wun", lat: 22.39434, lng: 113.9674 },
      { code: "MIK", id: 200, name_tc: "鳴琴", name_en: "Ming Kum", lat: 22.39706, lng: 113.96734 },
      { code: "SHP", id: 170, name_tc: "石排", name_en: "Shek Pai", lat: 22.40138, lng: 113.96769 },
      { code: "SAW", id: 160, name_tc: "新圍", name_en: "San Wai", lat: 22.40529, lng: 113.96442 },
      { code: "LEK", id: 150, name_tc: "良景", name_en: "Leung King", lat: 22.40669, lng: 113.96363 },
      { code: "TNK", id: 140, name_tc: "田景", name_en: "Tin King", lat: 22.40771, lng: 113.96643 },
      { code: "KIS", id: 130, name_tc: "建生", name_en: "Kin Sang", lat: 22.40673, lng: 113.96918 },
      { code: "CHC", id: 120, name_tc: "青松", name_en: "Ching Chung", lat: 22.40729, lng: 113.97252 },
      { code: "SHL", id: 100, name_tc: "兆康", name_en: "Siu Hong", lat: 22.4119, lng: 113.97822 },
      { code: "LTE", id: 350, name_tc: "藍地", name_en: "Lam Tei", lat: 22.4185, lng: 113.98163 },
      { code: "NAW", id: 360, name_tc: "泥圍", name_en: "Nai Wai", lat: 22.42365, lng: 113.98632 },
      { code: "CUT", id: 370, name_tc: "鍾屋村", name_en: "Chung Uk Tsuen", lat: 22.42966, lng: 113.99223 },
      { code: "HSK", id: 380, name_tc: "洪水橋", name_en: "Hung Shui Kiu", lat: 22.43364, lng: 113.99736 },
      { code: "TOF", id: 390, name_tc: "塘坊村", name_en: "Tong Fong Tsuen", lat: 22.44011, lng: 114.00704 },
      { code: "PIS", id: 400, name_tc: "屏山", name_en: "Ping Shan", lat: 22.44282, lng: 114.01176 },
      { code: "SPW", id: 560, name_tc: "水邊圍", name_en: "Shui Pin Wai", lat: 22.44446, lng: 114.02045 },
      { code: "FNR", id: 570, name_tc: "豐年路", name_en: "Fung Nin Road", lat: 22.44447, lng: 114.0239 },
      { code: "HLR", id: 580, name_tc: "康樂路", name_en: "Hong Lok Road", lat: 22.44455, lng: 114.02661 },
      { code: "TTR", id: 590, name_tc: "大棠路", name_en: "Tai Tong Road", lat: 22.44452, lng: 114.02897 },
      { code: "YLL", id: 600, name_tc: "元朗", name_en: "Yuen Long", lat: 22.44572, lng: 114.03437 },
    ],
  },
  {
    code: "615P",
    orig_tc: "屯門碼頭", orig_en: "Tuen Mun Ferry Pier",
    dest_tc: "兆康", dest_en: "Siu Hong",
    stops: [
      { code: "FEP", id: 1, name_tc: "屯門碼頭", name_en: "Tuen Mun Ferry Pier", lat: 22.37272, lng: 113.96712 },
      { code: "MEG", id: 10, name_tc: "美樂", name_en: "Melody Garden", lat: 22.37505, lng: 113.96111 },
      { code: "BUT", id: 15, name_tc: "蝴蝶", name_en: "Butterfly", lat: 22.37817, lng: 113.96166 },
      { code: "LRD", id: 20, name_tc: "輕鐵車廠", name_en: "Light Rail Depot", lat: 22.38181, lng: 113.96342 },
      { code: "LUM", id: 30, name_tc: "龍門", name_en: "Lung Mun", lat: 22.38526, lng: 113.96498 },
      { code: "TSS", id: 40, name_tc: "青山村", name_en: "Tsing Shan Tsuen", lat: 22.3904, lng: 113.96696 },
      { code: "TWN", id: 50, name_tc: "青雲", name_en: "Tsing Wun", lat: 22.39434, lng: 113.9674 },
      { code: "MIK", id: 200, name_tc: "鳴琴", name_en: "Ming Kum", lat: 22.39706, lng: 113.96734 },
      { code: "SHP", id: 170, name_tc: "石排", name_en: "Shek Pai", lat: 22.40138, lng: 113.96769 },
      { code: "SAW", id: 160, name_tc: "新圍", name_en: "San Wai", lat: 22.40529, lng: 113.96442 },
      { code: "LEK", id: 150, name_tc: "良景", name_en: "Leung King", lat: 22.40669, lng: 113.96363 },
      { code: "TNK", id: 140, name_tc: "田景", name_en: "Tin King", lat: 22.40771, lng: 113.96643 },
      { code: "KIS", id: 130, name_tc: "建生", name_en: "Kin Sang", lat: 22.40673, lng: 113.96918 },
      { code: "CHC", id: 120, name_tc: "青松", name_en: "Ching Chung", lat: 22.40729, lng: 113.97252 },
      { code: "KEL", id: 110, name_tc: "麒麟", name_en: "Kei Lun", lat: 22.41097, lng: 113.97634 },
      { code: "SHL", id: 100, name_tc: "兆康", name_en: "Siu Hong", lat: 22.4119, lng: 113.97822 },
    ],
  },
  {
    code: "705",
    orig_tc: "天水圍", orig_en: "Tin Shui Wai",
    dest_tc: "天榮", dest_en: "Tin Wing",
    stops: [
      { code: "TSL", id: 430, name_tc: "天水圍", name_en: "Tin Shui Wai", lat: 22.44945, lng: 114.00596 },
      { code: "TIT", id: 435, name_tc: "天慈", name_en: "Tin Tsz", lat: 22.4527, lng: 114.00602 },
      { code: "TWU", id: 450, name_tc: "天湖", name_en: "Tin Wu", lat: 22.45499, lng: 114.00577 },
      { code: "GIN", id: 455, name_tc: "銀座", name_en: "Ginza", lat: 22.45756, lng: 114.00489 },
      { code: "TWI", id: 500, name_tc: "天榮", name_en: "Tin Wing", lat: 22.45953, lng: 114.0026 },
    ],
  },
  {
    code: "706",
    orig_tc: "天水圍", orig_en: "Tin Shui Wai",
    dest_tc: "天榮", dest_en: "Tin Wing",
    stops: [
      { code: "TSL", id: 430, name_tc: "天水圍", name_en: "Tin Shui Wai", lat: 22.44945, lng: 114.00596 },
      { code: "TIY", id: 445, name_tc: "天耀", name_en: "Tin Yiu", lat: 22.45038, lng: 114.00267 },
      { code: "LOC", id: 448, name_tc: "樂湖", name_en: "Locwood", lat: 22.45304, lng: 114.00108 },
      { code: "TSU", id: 460, name_tc: "天瑞", name_en: "Tin Shui", lat: 22.45592, lng: 113.99943 },
      { code: "CHF", id: 468, name_tc: "頌富", name_en: "Chung Fu", lat: 22.46203, lng: 113.99696 },
      { code: "TFU", id: 480, name_tc: "天富", name_en: "Tin Fu", lat: 22.46454, lng: 113.9977 },
      { code: "TYA", id: 550, name_tc: "天逸", name_en: "Tin Yat", lat: 22.46697, lng: 113.99883 },
      { code: "THE", id: 540, name_tc: "天恒", name_en: "Tin Heng", lat: 22.46966, lng: 114.00076 },
      { code: "WEP", id: 530, name_tc: "濕地公園", name_en: "Wetland Park", lat: 22.4696, lng: 114.00246 },
      { code: "TSA", id: 520, name_tc: "天秀", name_en: "Tin Sau", lat: 22.46555, lng: 114.00297 },
      { code: "TYU", id: 510, name_tc: "天悅", name_en: "Tin Yuet", lat: 22.46282, lng: 114.00156 },
      { code: "TWI", id: 500, name_tc: "天榮", name_en: "Tin Wing", lat: 22.45953, lng: 114.0026 },
    ],
  },
  {
    code: "751",
    orig_tc: "友愛", orig_en: "Yau Oi",
    dest_tc: "天逸", dest_en: "Tin Yat",
    stops: [
      { code: "YAO", id: 275, name_tc: "友愛", name_en: "Yau Oi", lat: 22.38672, lng: 113.97352 },
      { code: "ONT", id: 270, name_tc: "安定", name_en: "On Ting", lat: 22.38764, lng: 113.97507 },
      { code: "TOC", id: 280, name_tc: "市中心", name_en: "Town Centre", lat: 22.39136, lng: 113.97489 },
      { code: "TML", id: 295, name_tc: "屯門", name_en: "Tuen Mun", lat: 22.39372, lng: 113.97331 },
      { code: "HOT", id: 70, name_tc: "河田", name_en: "Ho Tin", lat: 22.39738, lng: 113.97313 },
      { code: "CYB", id: 75, name_tc: "蔡意橋", name_en: "Choy Yee Bridge", lat: 22.39993, lng: 113.97417 },
      { code: "AFF", id: 80, name_tc: "澤豐", name_en: "Affluence", lat: 22.40349, lng: 113.97589 },
      { code: "TMH", id: 90, name_tc: "屯門醫院", name_en: "Tuen Mun Hospital", lat: 22.40777, lng: 113.97715 },
      { code: "SHL", id: 100, name_tc: "兆康", name_en: "Siu Hong", lat: 22.4119, lng: 113.97822 },
      { code: "LTE", id: 350, name_tc: "藍地", name_en: "Lam Tei", lat: 22.4185, lng: 113.98163 },
      { code: "NAW", id: 360, name_tc: "泥圍", name_en: "Nai Wai", lat: 22.42365, lng: 113.98632 },
      { code: "CUT", id: 370, name_tc: "鍾屋村", name_en: "Chung Uk Tsuen", lat: 22.42966, lng: 113.99223 },
      { code: "HSK", id: 380, name_tc: "洪水橋", name_en: "Hung Shui Kiu", lat: 22.43364, lng: 113.99736 },
      { code: "HMT", id: 425, name_tc: "坑尾村", name_en: "Hang Mei Tsuen", lat: 22.44509, lng: 114.00553 },
      { code: "TSL", id: 430, name_tc: "天水圍", name_en: "Tin Shui Wai", lat: 22.44945, lng: 114.00596 },
      { code: "TIT", id: 435, name_tc: "天慈", name_en: "Tin Tsz", lat: 22.4527, lng: 114.00602 },
      { code: "TWU", id: 450, name_tc: "天湖", name_en: "Tin Wu", lat: 22.45499, lng: 114.00577 },
      { code: "GIN", id: 455, name_tc: "銀座", name_en: "Ginza", lat: 22.45756, lng: 114.00489 },
      { code: "TWI", id: 500, name_tc: "天榮", name_en: "Tin Wing", lat: 22.45953, lng: 114.0026 },
      { code: "CHE", id: 490, name_tc: "翠湖", name_en: "Chestwood", lat: 22.45972, lng: 113.99953 },
      { code: "CHF", id: 468, name_tc: "頌富", name_en: "Chung Fu", lat: 22.46203, lng: 113.99696 },
      { code: "TFU", id: 480, name_tc: "天富", name_en: "Tin Fu", lat: 22.46454, lng: 113.9977 },
      { code: "TYA", id: 550, name_tc: "天逸", name_en: "Tin Yat", lat: 22.46697, lng: 113.99883 },
    ],
  },
  {
    code: "761P",
    orig_tc: "天逸", orig_en: "Tin Yat",
    dest_tc: "元朗", dest_en: "Yuen Long",
    stops: [
      { code: "TYA", id: 550, name_tc: "天逸", name_en: "Tin Yat", lat: 22.46697, lng: 113.99883 },
      { code: "TFU", id: 480, name_tc: "天富", name_en: "Tin Fu", lat: 22.46454, lng: 113.9977 },
      { code: "CHF", id: 468, name_tc: "頌富", name_en: "Chung Fu", lat: 22.46203, lng: 113.99696 },
      { code: "TSU", id: 460, name_tc: "天瑞", name_en: "Tin Shui", lat: 22.45592, lng: 113.99943 },
      { code: "LOC", id: 448, name_tc: "樂湖", name_en: "Locwood", lat: 22.45304, lng: 114.00108 },
      { code: "TIY", id: 445, name_tc: "天耀", name_en: "Tin Yiu", lat: 22.45038, lng: 114.00267 },
      { code: "HMT", id: 425, name_tc: "坑尾村", name_en: "Hang Mei Tsuen", lat: 22.44509, lng: 114.00553 },
      { code: "TOF", id: 390, name_tc: "塘坊村", name_en: "Tong Fong Tsuen", lat: 22.44011, lng: 114.00704 },
      { code: "PIS", id: 400, name_tc: "屏山", name_en: "Ping Shan", lat: 22.44282, lng: 114.01176 },
      { code: "SPW", id: 560, name_tc: "水邊圍", name_en: "Shui Pin Wai", lat: 22.44446, lng: 114.02045 },
      { code: "FNR", id: 570, name_tc: "豐年路", name_en: "Fung Nin Road", lat: 22.44447, lng: 114.0239 },
      { code: "HLR", id: 580, name_tc: "康樂路", name_en: "Hong Lok Road", lat: 22.44455, lng: 114.02661 },
      { code: "TTR", id: 590, name_tc: "大棠路", name_en: "Tai Tong Road", lat: 22.44452, lng: 114.02897 },
      { code: "YLL", id: 600, name_tc: "元朗", name_en: "Yuen Long", lat: 22.44572, lng: 114.03437 },
    ],
  },
]

/** 所有輕鐵站（按車站 ID），方便由 ID 搵站名 */
export const LR_STOP_MAP: Record<number, LrStop> = {}
for (const r of LR_ROUTES) {
  for (const s of r.stops) {
    if (!LR_STOP_MAP[s.id]) LR_STOP_MAP[s.id] = s
  }
}

export function lrStopName(id: number, lang: 'tc' | 'en'): string {
  const s = LR_STOP_MAP[id]
  if (!s) return String(id)
  return lang === 'tc' ? s.name_tc : s.name_en
}
