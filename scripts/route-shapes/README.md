# 真實路線軌跡（route shapes）

前端喺 `src/lib/shapes.ts` 按需要 fetch；路線圖有真實軌跡就貼住馬路／路軌畫，冇資料就自動降級做站點連線。

```
public/route-shapes/
  bus/{KMB|CTB}-{route}.json   # 每條巴士線：所有方向／班次變體
  gmb/{routeCode}.json         # 每條綠色專線小巴線：所有方向
  mtr.json                     # 十條港鐵綫：主線 + 支線（東鐵落馬洲、將軍澳康城）
```

格式（座標係 `[lat, lng]`，5 個小數 ≈ 1m，已用 Douglas–Peucker 簡化，2m 容差）：

```json
{ "co": "KMB", "route": "1A", "v": [
  { "b": "O", "st": "1", "o": "SAU MAU PING…", "d": "STAR FERRY…", "len": 8888, "p": [[22.3234, 114.2156], …] }
]}
```

`b` 只係原本資料嘅方向標記，前端唔靠佢：`pickPath()` 會用當前方向嘅首站／尾站座標比對每個變體嘅頭尾，揀最貼合嗰條，需要時反轉，所以方向同站序一定對得上。

## 資料來源

| 類別 | 來源 | 幾何 |
| --- | --- | --- |
| 巴士（九巴、城巴） | 運輸署「巴士路線」CSDI 數據集 [`td_rcd_1638844988873_41214`](https://portal.csdi.gov.hk/geoportal/?datasetId=td_rcd_1638844988873_41214)，layer `FB_ROUTE_LINE`（WGS84） | 沿馬路行車線 |
| 綠色專線小巴 | 運輸署「專線小巴路線」CSDI 數據集 [`td_rcd_1697082463580_57453`](https://portal.csdi.gov.hk/geoportal/?datasetId=td_rcd_1697082463580_57453)，layer `GMB_ROUTE_LINE` | 沿馬路行車線 |
| 港鐵 | OpenStreetMap Overpass `relation["route"="subway"]`（`out geom`），關聯 member 本身已按行車次序排列 | 真實路軌，含過海隧道 |

巴士幾何由 [hkbus/route-waypoints](https://github.com/hkbus/route-waypoints) gh-pages 逐條路線取得（同一個運輸署數據集，每日同步，已截到 5 個小數），再用 hkbus `routeFareList.json` 嘅 `gtfsId` / `bound` 對應返本 app 嘅（公司、路線、方向、班次）。

## 重新產生

```bash
# 1) 準備工作資料夾
mkdir -p .shape-work
curl -o .shape-work/gmb_route_line.geojson \
  "https://portal.csdi.gov.hk/csdi-webpage/file-api?dataset_id=td_rcd_1697082463580_57453&format=geojson&layer_name=GMB_ROUTE_LINE"
curl -o .shape-work/routeFareList.json https://data.hkbus.app/routeFareList.json
git clone --depth 1 -b gh-pages https://github.com/hkbus/route-waypoints.git .shape-work/rwp
# OSM：relation["route"="subway"] out geom / 站點節點 out body → mtr_all_geom.json、stops_tags.json、mtr_stations.json

# 2) 產生
python3 scripts/route-shapes/build_bus_shapes.py --work .shape-work
python3 scripts/route-shapes/build_mtr_shapes.py --work .shape-work --write-ts
```

`--write-ts` 會順手把 OSM 站點位置寫回 `src/lib/mtrData.ts` 嘅 `STATION_COORDS`（原本有啲座標係粗略估計，會令站點離開路軌）。
