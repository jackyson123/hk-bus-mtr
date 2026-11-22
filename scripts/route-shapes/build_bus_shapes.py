#!/usr/bin/env python3
"""Build bus + green minibus route shapes for hk-bus-mtr.

Run with a work folder that has: routeFareList.json (hkbus), rwp/ (hkbus
route-waypoints gh-pages clone) and gmb_route_line.geojson (TD/CSDI).
See README.md in this folder.

Bus geometry: TD "Bus Route" (CSDI dataset td_rcd_1638844988873_41214,
layer FB_ROUTE_LINE) as mirrored per route-direction by hkbus/route-waypoints
(gh-pages checkout in rwp/), joined to the app's (company, route, bound,
service_type) keys through hkbus routeFareList.  Every geometry is the TD
road-following line; it is Douglas-Peucker simplified and rounded to 5 dp.

GMB geometry: TD "GMB Route" (CSDI td_rcd_1697082463580_57453, layer
GMB_ROUTE_LINE) downloaded as GeoJSON.
"""
import argparse, json, math, os, re
import numpy as np

CO_MAP = {'kmb': 'KMB', 'ctb': 'CTB'}

ap = argparse.ArgumentParser(description=__doc__)
ap.add_argument('--work', default='.shape-work', help='folder holding the downloaded TD data')
ap.add_argument('--out', default=os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'route-shapes'))
ARGS = ap.parse_args()
FARE = os.path.join(ARGS.work, 'routeFareList.json')
WAY = os.path.join(ARGS.work, 'rwp')
GMB = os.path.join(ARGS.work, 'gmb_route_line.geojson')
OUTDIR = os.path.abspath(ARGS.out)


def hav(a, b):
    R = 6371000.0
    la1, lo1 = math.radians(a[0]), math.radians(a[1])
    la2, lo2 = math.radians(b[0]), math.radians(b[1])
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * R * math.asin(min(1, math.sqrt(h)))


def dpr(pts, tol):
    """Douglas-Peucker on (lat,lng) list, tolerance in metres (numpy)."""
    n = len(pts)
    if n < 3:
        return pts
    arr = np.asarray(pts, dtype=float)
    kx = 111320.0 * math.cos(math.radians(float(arr[:, 0].mean())))
    ky = 110540.0
    x = arr[:, 1] * kx
    y = arr[:, 0] * ky
    keep = np.zeros(n, dtype=bool)
    keep[0] = keep[-1] = True
    stack = [(0, n - 1)]
    while stack:
        i, j = stack.pop()
        if j <= i + 1:
            continue
        ax, ay, bx, by = x[i], y[i], x[j], y[j]
        dx, dy = bx - ax, by - ay
        L = dx * dx + dy * dy
        px = x[i + 1:j] - ax
        py = y[i + 1:j] - ay
        if L == 0:
            d = np.hypot(px, py)
        else:
            t = np.clip((px * dx + py * dy) / L, 0.0, 1.0)
            d = np.hypot(px - t * dx, py - t * dy)
        k = int(np.argmax(d))
        if d[k] > tol:
            keep[i + 1 + k] = True
            stack.append((i, i + 1 + k))
            stack.append((i + 1 + k, j))
    return [p for p, k in zip(pts, keep) if k]


def clean_path(parts, tol=2.0):
    """Join LineString parts into one path, simplify, round."""
    out = []
    for g in parts:
        g = [(q[1], q[0]) for q in g]  # [lng,lat] -> (lat,lng)
        if out:
            if hav(out[-1], g[-1]) < hav(out[-1], g[0]):
                g = list(reversed(g))
            out.extend(g[1:] if hav(out[-1], g[0]) < 5 else g)
        else:
            out = g
    out = dpr(out, tol)
    return [[round(a, 5), round(b, 5)] for a, b in out]


def safe(name):
    return re.sub(r'[^A-Za-z0-9]', '_', name)


def read_variant(fp):
    d = json.load(open(fp))
    if not d.get('features'):
        return None
    f = d['features'][0]
    geom = f['geometry']
    parts = geom['coordinates'] if geom['type'] == 'MultiLineString' else [geom['coordinates']]
    p = f['properties']
    return {
        'o': p.get('ST_STOP_NAMEE'),
        'd': p.get('ED_STOP_NAMEE'),
        'len': round(p.get('Shape_Length') or 0),
        'p': clean_path(parts),
    }


def build_bus():
    fare = json.load(open(FARE))['routeList']
    groups = {}
    seen = set()
    missing = 0
    # (co, route) -> {gtfsId: lowest service type seen}
    wanted = {}
    for key, e in fare.items():
        g = e.get('gtfsId')
        route = e.get('route')
        st = str(e.get('serviceType') or '1')
        if not g or not route:
            continue
        for co, bd in (e.get('bound') or {}).items():
            co = CO_MAP.get(co)
            if not co:
                continue
            slot = wanted.setdefault((co, route), {})
            if g not in slot or st < slot[g]:
                slot[g] = st
    for (co, route), ids in wanted.items():
        for g, st in ids.items():
            # The published geometry may be filed under either direction letter
            # (or with no suffix for circular routes); take whichever exist.
            for suffix, fp in (('O', f'{g}-O.json'), ('I', f'{g}-I.json'), ('C', f'{g}.json')):
                full = os.path.join(WAY, fp)
                sig = (co, route, g, suffix)
                if sig in seen:
                    continue
                if not os.path.exists(full):
                    if suffix == 'C':
                        missing += 1
                    continue
                seen.add(sig)
                v = read_variant(full)
                if not v:
                    continue
                v['b'] = suffix
                v['st'] = st
                groups.setdefault((co, route), []).append(v)
    os.makedirs(os.path.join(OUTDIR, 'bus'), exist_ok=True)
    n = 0
    total = 0
    for (co, route), vars_ in groups.items():
        vars_.sort(key=lambda v: (v['b'], v['st']))
        body = json.dumps({'co': co, 'route': route, 'v': vars_}, separators=(',', ':'), ensure_ascii=False)
        open(os.path.join(OUTDIR, 'bus', f'{co}-{safe(route)}.json'), 'w', encoding='utf-8').write(body)
        n += 1
        total += len(body)
    print(f'bus files {n}, total {total/1e6:.1f} MB, missing geometries {missing}')
    return groups


def build_gmb():
    d = json.load(open(GMB))
    groups = {}
    for f in d['features']:
        p = f['properties']
        code = str(p.get('ROUTE_NAME') or '').strip()
        if not code:
            continue
        geom = f['geometry']
        parts = geom['coordinates'] if geom['type'] == 'MultiLineString' else [geom['coordinates']]
        groups.setdefault(code, []).append({
            's': p.get('ROUTE_SEQ'),
            'o': p.get('ST_STOP_NAMEC'),
            'd': p.get('ED_STOP_NAMEC'),
            'len': round(p.get('Shape_Length') or 0),
            'p': clean_path(parts),
        })
    os.makedirs(os.path.join(OUTDIR, 'gmb'), exist_ok=True)
    n = 0
    total = 0
    for code, vars_ in groups.items():
        vars_.sort(key=lambda v: (v['s'] or 0))
        body = json.dumps({'route': code, 'v': vars_}, separators=(',', ':'), ensure_ascii=False)
        open(os.path.join(OUTDIR, 'gmb', f'{safe(code)}.json'), 'w', encoding='utf-8').write(body)
        n += 1
        total += len(body)
    print(f'gmb files {n}, total {total/1e6:.1f} MB')
    return groups


if __name__ == '__main__':
    build_bus()
    build_gmb()
