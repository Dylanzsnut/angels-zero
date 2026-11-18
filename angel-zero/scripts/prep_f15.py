#!/usr/bin/env python3
"""ANGELS ZERO Step 1A — normalize the Sketchfab F-15 into angels_zero_jet.glb.

Run:  blender -b -P scripts/prep_f15.py

Source: assets/mcdonnell_douglas_f-15_eagle_fighter_jet.glb (Sketchfab, 58 MB)
Output: assets/angels_zero_jet.glb (compressed textures, <20 MB)

Source model axes: +Y = nose, +Z = up, +X = right wing.
Target axes:       -Z = nose, +Y = up, +X = right wing.
"""

import bpy
import bmesh
import json
import math
import os
from mathutils import Vector, Matrix

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "assets", "mcdonnell_douglas_f-15_eagle_fighter_jet.glb")
OUT = os.path.join(ROOT, "assets", "angels_zero_jet.glb")
REPORT = os.path.join(ROOT, "assets", "f15_prep_report.json")
TARGET_LENGTH = 19.4

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)

# ------------------------------------------------------------------ inspect
print("=== SKETCHFAB F-15 HIERARCHY ===")
for ob in sorted(bpy.data.objects, key=lambda o: o.name):
    mats = [m.name for m in ob.data.materials] if ob.type == "MESH" else []
    print("  %-42s type=%-5s parent=%-38s mats=%s" % (
        ob.name, ob.type, ob.parent.name if ob.parent else "-", ",".join(mats)))
print("=== MATERIALS ===")
for m in bpy.data.materials:
    imgs = [n.image.name for n in m.node_tree.nodes
            if m.node_tree and n.type == "TEX_IMAGE" and n.image]
    print("  %-20s textures=%s" % (m.name, ",".join(imgs) if imgs else "-"))

# ------------------------------------------------------------- remove gear
# Remove only the extending gear: nose wheel plus the nose and main struts /
# tyres. Their closed bay doors are separate skin meshes and are intentionally
# kept, so removing the gear leaves no cavity in the belly.
GEAR_NAMES = {
    "Object_9",    # degenerate wheel.0 triangle hanging below the nose
    "Object_12",   # nose gear strut / wheel (poly.6)
    "Object_74",   # main gear struts / wheels (poly.8)
    "Object_75",   # main gear struts / wheels (poly.7)
    "Object_20",   # main wheel (body1.5)
    "Object_23",   # main wheel (body1.5)
    "Object_26",   # nose gear strut / wheel (body1.5)
    "Object_36",   # nose gear diagonal drag brace (body1.9)
}
GEAR_MATERIALS = ("wheel", "tire", "strut")
removed = []
for ob in list(bpy.data.objects):
    if ob.type != "MESH":
        continue
    mats = " ".join(m.name.lower() for m in ob.data.materials)
    if ob.name in GEAR_NAMES or any(k in mats for k in GEAR_MATERIALS):
        removed.append(ob.name)
        bpy.data.objects.remove(ob, do_unlink=True)

bpy.context.view_layer.update()   # ensure imported world matrices are current
print("Removed gear objects:", removed)

# ------------------------------------------------- separate pylon ordnance
# The Sketchfab model carries its stores in one shared mesh (Object_71,
# material "pods"): 12 bombs on the conformal-tank stations (6 per side,
# 2 columns x 3 rows) and 4 missiles on the wing-pylon side rails. The mesh
# is shattered into ~3,500 loose fragments, so separate(type='LOOSE') alone
# would give fragments, not weapons. Fragments are grouped instead:
#   1. union fragments whose world bounding boxes touch -> one cluster per
#      missile, one cluster per side for the touching bomb racks;
#   2. a bomb-side cluster is split by station: inner/outer column on |x|,
#      then three rows along the fuselage axis (1-D k-means on fragment centres).
# Fuel tanks (body4.0) and targeting pods (Object_72) are not stores and stay.
# Source axes here: +Y nose, +Z up, +X right wing.
ORDNANCE_SRC = "Object_71"

def mesh_islands(ob):
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bm.verts.ensure_lookup_table()
    mw = ob.matrix_world
    seen, out = set(), []
    for v in bm.verts:
        if v.index in seen:
            continue
        stack, cur = [v], []
        seen.add(v.index)
        while stack:
            c = stack.pop()
            cur.append(c.index)
            for e in c.link_edges:
                o = e.other_vert(c)
                if o.index not in seen:
                    seen.add(o.index)
                    stack.append(o)
        pts = [mw @ bm.verts[i].co for i in cur]
        mn = Vector(tuple(min(p[k] for p in pts) for k in range(3)))
        mx = Vector(tuple(max(p[k] for p in pts) for k in range(3)))
        out.append((cur, mn, mx))
    bm.free()
    return out

def touch_clusters(isl):
    par = list(range(len(isl)))
    def find(i):
        while par[i] != i:
            par[i] = par[par[i]]
            i = par[i]
        return i
    active = []
    for i in sorted(range(len(isl)), key=lambda i: isl[i][1].x):   # sweep along x
        mn, mx = isl[i][1], isl[i][2]
        active = [j for j in active if isl[j][2].x >= mn.x]
        for j in active:
            a, b = isl[j][1], isl[j][2]
            if all(a[k] <= mx[k] and mn[k] <= b[k] for k in range(3)):
                par[find(i)] = find(j)
        active.append(i)
    groups = {}
    for i in range(len(isl)):
        groups.setdefault(find(i), []).append(i)
    return list(groups.values())

def bounds_of(isl, ids):
    mn = Vector(tuple(min(isl[i][1][k] for i in ids) for k in range(3)))
    mx = Vector(tuple(max(isl[i][2][k] for i in ids) for k in range(3)))
    return mn, mx

def kmeans_1d(vals, weights, k, iters=30):
    s = sorted(vals)
    cents = [s[int((j + 0.5) * len(s) / k)] for j in range(k)]
    for _ in range(iters):
        acc = [[0.0, 0.0] for _ in range(k)]
        for v, w in zip(vals, weights):
            j = min(range(k), key=lambda j: abs(v - cents[j]))
            acc[j][0] += v * w
            acc[j][1] += w
        cents = [acc[j][0] / acc[j][1] if acc[j][1] else cents[j] for j in range(k)]
    return sorted(cents)

def extract_part(src, vids, name):
    ob = src.copy()
    ob.data = src.data.copy()
    ob.name = name
    ob.data.name = name
    for col in src.users_collection:
        col.objects.link(ob)
    keep = set(vids)
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.index not in keep], context="VERTS")
    bm.to_mesh(ob.data)
    ob.data.update()
    bm.free()
    return ob

ordnance_parts = []          # (name, vertex ids)
src_ord = bpy.data.objects.get(ORDNANCE_SRC)
if src_ord:
    isl = mesh_islands(src_ord)
    msl, bomb_sides = [], []
    for ids in touch_clusters(isl):
        mn, mx = bounds_of(isl, ids)
        d = mx - mn
        if d.y > 2.4 and d.x < 0.6 and d.z < 0.6:
            msl.append((mn, mx, ids))                      # slim, finned, rail-mounted
        elif d.y > 5.0 and d.x > 0.7:
            bomb_sides.append((mn, mx, ids))               # a whole conformal bomb rack
    # Missiles: inboard rails first, left before right, so launches alternate wings.
    msl.sort(key=lambda m: (round(abs((m[0].x + m[1].x) / 2), 1), (m[0].x + m[1].x) / 2))
    for n, (mn, mx, ids) in enumerate(msl, 1):
        ordnance_parts.append(("Pylon_MSL_%d" % n, [v for i in ids for v in isl[i][0]]))
    bombs = []
    mw_ord = src_ord.matrix_world
    vco = src_ord.data.vertices
    def key_of(vi):
        p = mw_ord @ vco[vi].co
        return (round(p.x, 3), round(p.y, 3), round(p.z, 3))
    ambiguous, moved_fragments = [], 0
    for mn, mx, ids in bomb_sides:
        xmid = (mn.x + mx.x) / 2
        side = -1 if xmid < 0 else 1
        cols = {0: [], 1: []}
        for i in ids:
            a, b = isl[i][1], isl[i][2]
            if b.y - a.y > 2.6:            # rack rails spanning several stations stay on the jet
                continue
            cx = (a.x + b.x) / 2
            cols[0 if abs(cx) < abs(xmid) else 1].append(i)
        for col, cids in cols.items():
            # Rows come from the long body panels; tail fins sit just aft (-Y)
            # of their own bomb's body, right in front of the next bomb's nose,
            # so each fragment joins the body whose [tail - 0.75 m, nose] span
            # contains it rather than the nearest centroid.
            ctr = {i: (isl[i][1].y + isl[i][2].y) / 2 for i in cids}
            body = [i for i in cids if isl[i][2].y - isl[i][1].y > 1.0]
            cents = kmeans_1d([ctr[i] for i in body], [len(isl[i][0]) for i in body], 3)
            span = []
            for r in range(3):
                mem = [i for i in body if min(range(3), key=lambda q: abs(ctr[i] - cents[q])) == r]
                span.append((min(isl[i][1].y for i in mem), max(isl[i][2].y for i in mem)) if mem else (cents[r], cents[r]))
            axis = []
            for r in range(3):
                mem = [i for i in body if min(range(3), key=lambda q: abs(ctr[i] - cents[q])) == r] or body
                axis.append((min(isl[i][1].x for i in mem), max(isl[i][2].x for i in mem),
                             min(isl[i][1].z for i in mem), max(isl[i][2].z for i in mem)))
            rows = {r: [] for r in range(3)}
            for i in cids:
                y = ctr[i]
                a, b = isl[i][1], isl[i][2]
                # Narrow pieces just ahead of a body are that bomb's nose cone
                # (fins are wide), so they never join the bomb in front.
                if max(b.x - a.x, b.z - a.z) < 0.30:
                    def on_axis(r):              # nose pieces stay inside the body's cross-section; fin blades reach out
                        x0, x1, z0, z1 = axis[r]
                        return a.x >= x0 - 0.02 and b.x <= x1 + 0.02 and a.z >= z0 - 0.02 and b.z <= z1 + 0.02
                    nose = [r for r in range(3) if span[r][1] - 0.02 <= y <= span[r][1] + 0.45 and on_axis(r)]
                    if nose:
                        rows[nose[0]].append(i)
                        ambiguous.append(i)
                        continue
                def gap(r):
                    lo, hi = span[r][0] - 0.75, span[r][1] + 0.02
                    return 0.0 if lo <= y <= hi else min(abs(y - lo), abs(y - hi))
                rows[min(range(3), key=lambda r: (gap(r), abs(y - cents[r])))].append(i)
            # A fin-root triangle can pass the nose test; the unwelded fragments of
            # one store still share vertex positions, so an ambiguous fragment
            # moves to whichever row it shares the most positions with.
            row_of = {i: r for r, rids in rows.items() for i in rids}
            pos_rows = {}
            for i in cids:
                if i in ambiguous:
                    continue
                for vi in isl[i][0]:
                    pos_rows.setdefault(key_of(vi), set()).add(row_of[i])
            for i in [j for j in ambiguous if j in row_of]:     # this column's ambiguous fragments
                votes = {}
                for vi in isl[i][0]:
                    for r in pos_rows.get(key_of(vi), ()):
                        votes[r] = votes.get(r, 0) + 1
                if votes:
                    best = max(votes, key=votes.get)
                    if best != row_of[i] and votes[best] > votes.get(row_of[i], 0):
                        rows[row_of[i]].remove(i)
                        rows[best].append(i)
                        moved_fragments += 1
            for r, rids in rows.items():
                if rids:
                    bmn, bmx = bounds_of(isl, rids)
                    bombs.append((side, col, -cents[r], bmn, bmx, rids))
    print("Ordnance fragments re-homed by shared vertices:", moved_fragments, "of", len(ambiguous))
    # Release order: front row first, inner column first, alternating left / right.
    bombs.sort(key=lambda b: (round(b[2], 1), b[1], b[0]))
    for n, (side, col, _, bmn, bmx, rids) in enumerate(bombs, 1):
        ordnance_parts.append(("Pylon_BOMB_%d" % n, [v for i in rids for v in isl[i][0]]))
    taken = set()
    for name, vids in ordnance_parts:
        extract_part(src_ord, vids, name)
        taken.update(vids)
    # The source mesh keeps only what was not extracted (pylon adapters, rack rails).
    bm = bmesh.new()
    bm.from_mesh(src_ord.data)
    bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[bm.verts[i] for i in taken], context="VERTS")
    bm.to_mesh(src_ord.data)
    src_ord.data.update()
    bm.free()
    bpy.context.view_layer.update()
print("Ordnance separated:", [n for n, _ in ordnance_parts])

# ------------------------------------------------- normals / solid skin prep
# Every material is two-sided so mirrored surfaces never disappear in glTF.
for mat in bpy.data.materials:
    try:
        mat.use_backface_culling = False
    except (AttributeError, TypeError):
        pass

# Apply object transforms (including negative mirrored scales) to mesh data,
# then weld, recalculate outward normals and fill small boundary holes.
def bake_and_solidify(ob):
    bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    with bpy.context.temp_override(object=ob, active_object=ob,
                                   selected_objects=[ob], selected_editable_objects=[ob]):
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.mesh.remove_doubles(threshold=0.0005)
        bpy.ops.mesh.normals_make_consistent(inside=False)
        bpy.ops.mesh.fill_holes(sides=8)
        bpy.ops.object.mode_set(mode="OBJECT")
    ob.select_set(False)

fixed = 0
for ob in [o for o in bpy.data.objects if o.type == "MESH"]:
    try:
        bake_and_solidify(ob)
        fixed += 1
    except Exception as exc:
        print("WARN solidify failed", ob.name, str(exc))
print("Meshes welded + normals recalculated:", fixed)

# Downscale large textures so the exported GLB stays well under 20 MB.
downscaled = 0
for im in bpy.data.images:
    if im.source == "FILE" and im.has_data and max(im.size) > 1024:
        w, h = im.size
        nh = max(1, round(h * 1024 / w))
        im.scale(1024, nh)
        im.pack()
        downscaled += 1
print("Textures downscaled to 1024px:", downscaled)

# ------------------------------------------------------- measure / transform
def world_bbox(objects):
    pts = []
    for ob in objects:
        if ob.type != "MESH":
            continue
        for v in ob.data.vertices:            # real vertices, never cached bound_box
            pts.append(ob.matrix_world @ v.co)
    if not pts:
        return Vector((0, 0, 0)), Vector((0, 0, 0))
    mn = Vector(tuple(min(p[i] for p in pts) for i in range(3)))
    mx = Vector(tuple(max(p[i] for p in pts) for i in range(3)))
    return mn, mx

meshes = [o for o in bpy.data.objects if o.type == "MESH"]
src_min, src_max = world_bbox(meshes)
center = (src_min + src_max) * 0.5
scale = TARGET_LENGTH / (src_max.y - src_min.y)

ROT = Matrix.Rotation(-math.pi / 2, 4, "X")
M = Matrix.Scale(scale, 4) @ ROT @ Matrix.Translation(-center)

def to_target(p):
    return M @ Vector(p)

def source_landmark(obj_name):
    ob = bpy.data.objects.get(obj_name)
    if not ob:
        return None
    mn, mx = world_bbox([ob])
    return tuple(round(v, 4) for v in to_target((mn + mx) * 0.5))

landmarks = {
    "Nozzle_L": source_landmark("Object_66"),
    "Nozzle_R": source_landmark("Object_67"),
    "Canopy_Pilot_Eye": source_landmark("Object_63"),
}

# Bake world transform into geometry, then re-parent everything to a clean root.
for ob in meshes:
    new_world = M @ ob.matrix_world
    ob.data.transform(new_world)
    ob.data.update()
    ob.parent = None
    ob.matrix_world = Matrix.Identity(4)

for ob in list(bpy.data.objects):
    if ob.type == "EMPTY" or ob not in meshes:
        bpy.data.objects.remove(ob, do_unlink=True)

Airframe = bpy.data.objects.new("Airframe", None)
bpy.context.collection.objects.link(Airframe)
for ob in meshes:
    if not ob.name.startswith("Pylon_"):
        ob.name = "F15_" + ob.name
    ob.parent = Airframe
    ob.matrix_parent_inverse = Matrix.Identity(4)

# Decimate dense Sketchfab meshes for a web-sized asset (~1/5 of the triangles).
decimated = 0
before_tris = sum(len(o.data.polygons) for o in meshes)
for ob in meshes:
    if len(ob.data.polygons) <= 200:
        continue
    mod = ob.modifiers.new("WebDecimate", "DECIMATE")
    mod.decimate_type = "COLLAPSE"
    # Stores are seen up close when they separate, so they keep more detail.
    mod.ratio = 0.4 if ob.name.startswith("Pylon_") else 0.18
    with bpy.context.temp_override(object=ob, active_object=ob, selected_objects=[ob]):
        bpy.ops.object.modifier_apply(modifier=mod.name)
    ob.data.update()
    decimated += 1
after_tris = sum(len(o.data.polygons) for o in meshes)
print("Decimated meshes:", decimated, "faces", before_tris, "->", after_tris)
# Decimation can leave a few stray vertices far outside the airframe; drop them.
strays = 0
for ob in meshes:
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    # Airframe envelope after normalization: ~13.4 x 5.9 x 19.4 m, centred.
    bounds = (8.0, 5.0, 11.0)
    bad = [v for v in bm.verts if any(abs(v.co[i]) > bounds[i] for i in range(3))]
    if bad:
        bmesh.ops.delete(bm, geom=bad, context="VERTS")
        bm.to_mesh(ob.data)
        ob.data.update()
        strays += len(bad)
    bm.free()
print("Stray decimation vertices removed:", strays)

# Re-weld and re-fill after decimation using bmesh (no operator context needed).
def bmesh_solidify(ob):
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=0.0005)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    boundary = [e for e in bm.edges if e.is_boundary]
    if boundary:
        bmesh.ops.holes_fill(bm, edges=boundary, sides=8)
    bm.to_mesh(ob.data)
    ob.data.update()
    bm.free()

for ob in meshes:
    try:
        bmesh_solidify(ob)
    except Exception as exc:
        print("WARN post-decimate solidify failed", ob.name, str(exc))

# Sanitize meshes before export: drop degenerate faces and loose geometry so
# the glTF exporter never reports an invalid mesh.
sanitized = 0
for ob in meshes:
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bad_faces = [f for f in bm.faces if f.calc_area() < 1e-10]
    loose = [v for v in bm.verts if not v.link_faces]
    if bad_faces:
        bmesh.ops.delete(bm, geom=bad_faces, context="FACES")
    if loose:
        bmesh.ops.delete(bm, geom=loose, context="VERTS")
    if bad_faces or loose:
        bm.to_mesh(ob.data)
        ob.data.update()
        sanitized += 1
    bm.free()
    ob.data.validate(clean_customdata=False)
print("Meshes sanitized:", sanitized)

# Geometry was baked into target coordinates; ensure object transforms are clean.
for ob in meshes:
    ob.matrix_world = Matrix.Identity(4)
bpy.context.view_layer.update()

# --------------------------------------------------------------- landmarks
canopy = bpy.data.objects.get("F15_Object_63")
if canopy:
    canopy.name = "Canopy_Glass"

for marker_name, pos in landmarks.items():
    if not pos:
        continue
    e = bpy.data.objects.new(marker_name, None)
    bpy.context.collection.objects.link(e)
    e.location = Vector(pos)
    e.parent = Airframe
    e.matrix_parent_inverse = Matrix.Identity(4)

nozzle_l = landmarks.get("Nozzle_L")
nozzle_r = landmarks.get("Nozzle_R")
canopy_pos = landmarks.get("Canopy_Pilot_Eye")

extremes = []
for ob in meshes:
    if not ob.data.vertices:
        continue
    m = max(max(abs(v.co[i]) for i in range(3)) for v in ob.data.vertices)
    extremes.append((m, ob.name))
for m, nm in sorted(extremes, reverse=True)[:6]:
    print("DEBUG_EXTREME", nm, round(m, 3))

tgt_pts = [v.co.copy() for ob in meshes for v in ob.data.vertices]
tgt_min = Vector(tuple(min(p[i] for p in tgt_pts) for i in range(3)))
tgt_max = Vector(tuple(max(p[i] for p in tgt_pts) for i in range(3)))
dims = tuple(round(tgt_max[i] - tgt_min[i], 3) for i in range(3))

# Final exact length normalization after decimation/cleanup.
f = TARGET_LENGTH / dims[2]
for ob in meshes:
    for v in ob.data.vertices:
        v.co *= f
    ob.data.update()
dims = tuple(round(d * f, 3) for d in dims)
landmarks = {k: tuple(round(c * f, 4) for c in p) if p else None
             for k, p in landmarks.items()}
for marker_name, pos in landmarks.items():
    mo = bpy.data.objects.get(marker_name)
    if mo and pos:
        mo.location = Vector(pos)
nozzle_l = landmarks.get("Nozzle_L")
nozzle_r = landmarks.get("Nozzle_R")
canopy_pos = landmarks.get("Canopy_Pilot_Eye")

# ------------------------------------------- strip residual hanging struts
# Some strut segments live inside large shared skin meshes (Object_33/47), so
# they are removed per connected island rather than per object. A strut island
# is tall and thin, hangs below the belly, and sits inside a gear zone; flat
# bay-door plates and the fuselage skin never match, so they stay intact.
GEAR_ZONES = (
    # (|x| min, |x| max, z min, z max, min height, max width, max length)
    # in final metres, nose = -Z. The nose bay also drops the diagonal drag
    # brace and the strut-mounted landing-light lenses (short, compact pieces);
    # the main bays keep the stricter tall-and-thin test so missile fins nearby
    # are never caught. The nose-gear door (z < -4.1) is outside the zone.
    (0.00, 0.30, -3.75, -2.70, 0.10, 0.50, 0.60),   # nose gear leg + brace + lights
    (1.05, 1.50, 2.05, 2.65, 0.25, 0.35, 0.45),     # left / right main gear legs
)

def is_strut_island(mn, mx):
    dx, dy, dz = mx.x - mn.x, mx.y - mn.y, mx.z - mn.z
    if not (mn.y < -1.35 and mx.y < -1.3):          # wholly below the belly skin
        return False
    cx, cz = abs((mn.x + mx.x) * 0.5), (mn.z + mx.z) * 0.5
    return any(x0 <= cx <= x1 and z0 <= cz <= z1 and dy > hmin and dx < wmax and dz < lmax
               for x0, x1, z0, z1, hmin, wmax, lmax in GEAR_ZONES)

strut_islands = []
for ob in meshes:
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bm.verts.ensure_lookup_table()
    seen = set()
    doomed = []
    for v in bm.verts:
        if v.index in seen:
            continue
        stack, island = [v], []
        seen.add(v.index)
        while stack:
            cur = stack.pop()
            island.append(cur)
            for e in cur.link_edges:
                o = e.other_vert(cur)
                if o.index not in seen:
                    seen.add(o.index)
                    stack.append(o)
        mn = Vector(tuple(min(p.co[i] for p in island) for i in range(3)))
        mx = Vector(tuple(max(p.co[i] for p in island) for i in range(3)))
        if is_strut_island(mn, mx):
            doomed.extend(island)
            strut_islands.append((ob.name, [round(c, 2) for c in (*mn, *mx)]))
    if doomed:
        bmesh.ops.delete(bm, geom=doomed, context="VERTS")
        bm.to_mesh(ob.data)
        ob.data.update()
    bm.free()
print("Strut islands removed:", len(strut_islands))
for nm, box in strut_islands:
    print("  STRUT", nm, box)

# ------------------------------------------------- ordnance origins / report
# Each store gets its origin at its bounds centre (equivalent to
# origin_set(type='ORIGIN_GEOMETRY', center='BOUNDS')) so the game can clone it
# at the pylon's world transform and fly it from its own centre.
ordnance = []
for ob in sorted([o for o in meshes if o.name.startswith("Pylon_")], key=lambda o: o.name):
    vs = [v.co.copy() for v in ob.data.vertices]
    if not vs:
        print("WARN empty ordnance", ob.name)
        continue
    mn = Vector(tuple(min(v[i] for v in vs) for i in range(3)))
    mx = Vector(tuple(max(v[i] for v in vs) for i in range(3)))
    c = (mn + mx) * 0.5
    for v in ob.data.vertices:
        v.co -= c
    ob.data.update()
    ob.location = c
    ordnance.append({"name": ob.name, "center": [round(x, 3) for x in c],
                     "size": [round(x, 3) for x in (mx - mn)],
                     "faces": len(ob.data.polygons),
                     "materials": [m.name for m in ob.data.materials]})
    print("ORDNANCE %-14s center=%s size=%s faces=%d" % (
        ob.name, ordnance[-1]["center"], ordnance[-1]["size"], len(ob.data.polygons)))

# ------------------------------------------------------------------- export
os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.export_scene.gltf(
    filepath=OUT,
    export_format="GLB",
    export_yup=False,
    export_apply=True,
    export_image_format="JPEG",
    export_jpeg_quality=74,
    export_cameras=False,
    export_lights=False,
    export_unused_images=False,
    use_selection=False,
)

report = {
    "source": os.path.basename(SRC),
    "removed": removed,
    "strut_islands_removed": strut_islands,
    "scale": round(scale, 6),
    "faces_before": before_tris,
    "faces_after": after_tris,
    "dimensions_m": list(dims),
    "nozzle_l": nozzle_l,
    "nozzle_r": nozzle_r,
    "canopy_pilot_eye": canopy_pos,
    "ordnance": ordnance,
    "glb_bytes": os.path.getsize(OUT),
}
with open(REPORT, "w", encoding="utf-8") as fh:
    json.dump(report, fh, indent=2)

print("=== F15_PREP_RESULT ===")
print(json.dumps(report))
