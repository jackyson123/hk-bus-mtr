#!/usr/bin/env python3
"""Build MTR line shapes (real track geometry) from OSM Overpass data.

Inputs (in --work): mtr_all_geom.json (Overpass `relation["route"="subway"]; out geom;`),
stops_tags.json (the relations' stop nodes, `out body`), mtr_stations.json
(`node["railway"="station"]... ; out body`).  See README.md in this folder.

For each line the best OSM route=subway relation (the one whose polyline passes
all the line's stations) is concatenated way-by-way in member order - the
relation members are already in running order, so no snapping is needed.
Branch stations (East Rail -> Lok Ma Chau, Tseung Kwan O -> LOHP/POA) come from
their own relations and are trimmed back to the junction.

Output: public/route-shapes/mtr.json  { "TWL": [ [[lat,lng],...], ... ] }
Also writes station coordinates improved from OSM stop nodes for mtrData.ts.
"""
import argparse, json, math, os, re, statistics

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))

ap = argparse.ArgumentParser(description=__doc__)
ap.add_argument('--work', default='.shape-work', help='folder holding the OSM downloads')
ap.add_argument('--out', default=os.path.join(REPO, 'public', 'route-shapes'))
ap.add_argument('--ts', default=os.path.join(REPO, 'src', 'lib', 'mtrData.ts'),
                help='mtrData.ts to read the station list from; --write-ts also updates its coordinates')
ap.add_argument('--write-ts', action='store_true')
ARGS = ap.parse_args()
SRC = os.path.join(ARGS.work, 'mtr_all_geom.json')
STOPS_TAGS = os.path.join(ARGS.work, 'stops_tags.json')
STATIONS_JSON = os.path.join(ARGS.work, 'mtr_stations.json')
OUT = os.path.join(os.path.abspath(ARGS.out), 'mtr.json')
COORDS_OUT = os.path.join(ARGS.work, 'mtr_station_coords.json')
TS = ARGS.ts

MAIN_REL = {
    'AEL': 5317239,
    'DRL': 4709540,
    'EAL': 4248590,   # to Lo Wu
    'ISL': 4432665,
    'KTL': 272125,
    'SIL': 6827212,
    'TCL': 5317706,
    'TKL': 269672,    # to Po Lam
    'TML': 6102298,
    'TWL': 269669,
}
# (relation id, station the branch starts from, junction station) - trimmed at junction
BRANCH_REL = {
    'EAL': [(4248589, 'LMC', 'SHS')],
    'TKL': [(9736602, 'LHP', 'TKO')],
}

ts = open(TS, encoding='utf-8').read()
coords = {}
for m in re.finditer(r"(\w{3}):\s*\{\s*lat:\s*([\d.]+),\s*lng:\s*([\d.]+)\s*\}", ts):
    coords[m.group(1)] = (float(m.group(2)), float(m.group(3)))
blk = ts.split('export const MTR_STATIONS')[1].split('export const STATION_NAME_MAP')[0]
stations = {}
for m in re.finditer(r"\n  (\w+):\s*\[(.*?)\n  \],", blk, re.S):
    stations[m.group(1)] = re.findall(r"code:\s*'(\w+)'", m.group(2))


def hav(a, b):
    R = 6371000.0
    la1, lo1 = math.radians(a[0]), math.radians(a[1])
    la2, lo2 = math.radians(b[0]), math.radians(b[1])
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * R * math.asin(min(1, math.sqrt(h)))


def seg_dist(p, a, b):
    kx = 111320 * math.cos(math.radians(p[0]))
    ky = 110540
    px, py = (p[1] - a[1]) * kx, (p[0] - a[0]) * ky
    bx, by = (b[1] - a[1]) * kx, (b[0] - a[0]) * ky
    L = bx * bx + by * by
    t = 0 if L == 0 else max(0, min(1, (px * bx + py * by) / L))
    return math.hypot(px - t * bx, py - t * by)


def line_dist(p, pts):
    if len(pts) == 1:
        return hav(p, pts[0])
    return min(seg_dist(p, pts[i], pts[i + 1]) for i in range(len(pts) - 1))


def nearest_idx(pts, p):
    return min(range(len(pts)), key=lambda i: hav(pts[i], p))


def plen(pts):
    return sum(hav(pts[i], pts[i + 1]) for i in range(len(pts) - 1))


def dpr(pts, tol):
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        i, j = stack.pop()
        if j <= i + 1:
            continue
        dmax, idx = 0.0, -1
        for k in range(i + 1, j):
            d = seg_dist(pts[k], pts[i], pts[j])
            if d > dmax:
                dmax, idx = d, k
        if dmax > tol:
            keep[idx] = True
            stack.append((i, idx))
            stack.append((idx, j))
    return [p for p, k in zip(pts, keep) if k]


def concat(rel):
    """Join the relation's own-track ways in member order."""
    pts = []
    gaps = 0
    for m in rel['members']:
        if m['type'] != 'way' or (m.get('role') or '') != '' or not m.get('geometry'):
            continue
        g = [(q['lat'], q['lon']) for q in m['geometry']]
        if pts:
            if hav(pts[-1], g[-1]) < hav(pts[-1], g[0]):
                g = list(reversed(g))
            if hav(pts[-1], g[0]) > 40:
                gaps += 1
            pts.extend(g[1:] if hav(pts[-1], g[0]) < 5 else g)
        else:
            pts = g
    return pts, gaps


def improved_station_coords():
    """Replace rough STATION_COORDS guesses with OSM platform positions."""
    fixed = {}
    groups = {}
    for e in json.load(open(STOPS_TAGS))['elements']:
        r = ((e.get('tags') or {}).get('ref') or '').upper()
        if r:
            groups.setdefault(r, []).append((e['lat'], e['lon']))
    for e in json.load(open(STATIONS_JSON))['elements']:
        r = ((e.get('tags') or {}).get('ref') or '').upper()
        if r:
            groups.setdefault(r, []).append((e['lat'], e['lon']))
    for code, pts in groups.items():
        if code in coords and len(pts) >= 1:
            fixed[code] = (round(statistics.median(p[0] for p in pts), 6),
                           round(statistics.median(p[1] for p in pts), 6))
    return fixed


def write_ts_coords():
    """Write the improved station coordinates back into STATION_COORDS."""
    s = open(TS, encoding='utf-8').read()
    m = re.search(r"export const STATION_COORDS: Record<string, \{ lat: number; lng: number \}> = \{", s)
    if not m:
        print('STATION_COORDS block not found, skipped')
        return
    i = m.end()
    j = s.index('\n}\n', i)
    block = s[i:j]
    old = {k: (float(a), float(b)) for k, a, b in
           re.findall(r"(\w+): \{ lat: ([\d.]+), lng: ([\d.]+) \}", block)}
    for k, v in json.load(open(COORDS_OUT)).items():
        old[k] = (v[0], v[1])
    lines = [f"  {k}: {{ lat: {round(old[k][0], 5)}, lng: {round(old[k][1], 5)} }},"
             for k in sorted(old)]
    open(TS, 'w', encoding='utf-8').write(s[:i] + '\n' + '\n'.join(lines) + s[j:])
    print('STATION_COORDS updated in', TS)


def main():
    d = json.load(open(SRC))
    rels = {e['id']: e for e in d['elements'] if e['type'] == 'relation'}
    fixed = improved_station_coords()
    coords.update({k: v for k, v in fixed.items() if k in coords})

    out = {}
    diag = []
    for ref, rid in MAIN_REL.items():
        main_pts, gaps = concat(rels[rid])
        polys = [main_pts]
        for brid, st, jn in BRANCH_REL.get(ref, []):
            bp, _ = concat(rels[brid])
            # trim the shared trunk: keep only the branch side of the junction
            j = nearest_idx(bp, coords[jn])
            s = nearest_idx(bp, coords[st])
            if s < j:
                bp = bp[:j + 1]
            else:
                bp = bp[j:]
            if len(bp) > 1:
                polys.append(bp)
        # stations without an OSM node: put them on the track instead of a rough guess
        order = stations[ref]
        for c in order:
            if c in coords and c not in fixed:
                ds = [(min(hav(coords[c], q) for q in p), min(p, key=lambda q: hav(coords[c], q))) for p in polys]
                dd, q = min(ds)
                if dd > 100:
                    # 總站：貼去該線走線嘅相應一端，唔好就近搵個中途點
                    if c == order[0] or c == order[-1]:
                        ends = [p[0] for p in polys] + [p[-1] for p in polys]
                        q = min(ends, key=lambda e: hav(coords[c], e))
                    print('  snap', ref, c, round(dd), '->', round(q[0], 5), round(q[1], 5))
                    coords[c] = q
                    fixed[c] = q
        dists = {c: round(min(line_dist(coords[c], p) for p in polys)) for c in stations[ref]}
        bad = {c: v for c, v in dists.items() if v > 150}
        simp = [dpr(p, 3.0) for p in polys]
        simp = [p for p in simp if len(p) > 1]
        out[ref] = [[[round(a, 5), round(b, 5)] for a, b in p] for p in simp]
        diag.append((ref, rid, 'gaps', gaps, 'km', round(sum(plen(p) for p in simp) / 1000, 1),
                     'pts', sum(len(p) for p in simp), 'far', bad))

    if ARGS.write_ts:
        write_ts_coords()

    json.dump({k: [round(v[0], 6), round(v[1], 6)] for k, v in coords.items()}, open(COORDS_OUT, 'w'), indent=0)
    json.dump(out, open(OUT, 'w'), separators=(',', ':'))
    for row in diag:
        print(row)
    print('bytes', len(open(OUT, 'rb').read()), 'coords_fixed', len(fixed))


main()
