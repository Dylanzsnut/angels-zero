#!/usr/bin/env python3
"""ANGELS ZERO — Step 1A stealth fighter generator (Blender 5.2+/5.3, headless).

Builds a chined, blended-wing-body twin-engine fighter (F-22 / Su-57 inspired)
with separately pivoted control surfaces and a full interior cockpit, then
exports assets/angels_zero_jet.glb.

Axes are authored directly for Three.js: nose = -Z, up = +Y, right wing = +X.
The glTF exporter is called with export_yup=False so no axis rotation is added.

Run:
    blender -b -P scripts/build_jet.py
"""

import bpy
import bmesh
import json
import math
import os
import sys
from mathutils import Vector, Matrix

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "assets")
OUT_GLB = os.path.join(OUT_DIR, "angels_zero_jet.glb")
REPORT = os.path.join(OUT_DIR, "angels_zero_jet_report.json")

CANT = math.radians(28.0)          # outward tail cant
HALF_SPAN = 6.75                   # 13.5 m wingspan
NOSE_Z = -9.45
TAIL_Z = 9.45                      # 18.9 m length


# ---------------------------------------------------------------------------
# colour / material helpers
# ---------------------------------------------------------------------------
def srgb(hexstr):
    h = hexstr.lstrip("#")
    vals = [int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)]

    def lin(c):
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return tuple(lin(v) for v in vals)


def make_material(name, hexcolor, metallic=0.0, roughness=0.5, alpha=1.0,
                  emission=None, emission_strength=0.0, double_sided=False):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    c = srgb(hexcolor)
    bsdf.inputs["Base Color"].default_value = (*c, 1.0)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Alpha"].default_value = alpha
    if emission:
        ec = srgb(emission)
        bsdf.inputs["Emission Color"].default_value = (*ec, 1.0)
        bsdf.inputs["Emission Strength"].default_value = emission_strength
    if alpha < 1.0:
        try:
            m.surface_render_method = "BLENDED"
        except (AttributeError, TypeError):
            pass
    try:
        m.use_backface_culling = not double_sided
    except (AttributeError, TypeError):
        pass
    m.diffuse_color = (*c, alpha)
    return m


# ---------------------------------------------------------------------------
# mesh / object helpers
# ---------------------------------------------------------------------------
def finish_mesh(me, closed=True, smooth=False):
    bm = bmesh.new()
    bm.from_mesh(me)
    if closed and len(bm.faces):
        try:
            if bm.calc_volume(signed=True) < 0:
                bmesh.ops.reverse_faces(bm, faces=bm.faces)
        except (ValueError, RuntimeError):
            pass
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    me.update()

    # Every exported mesh needs a UV set (glTF / engine requirement).
    if not me.uv_layers:
        uv = me.uv_layers.new(name="UVMap")
        for poly in me.polygons:
            # Project along the dominant face-normal axis so no face collapses
            # to a zero-area UV island.
            axis = max(range(3), key=lambda i: abs(poly.normal[i]))
            for li in poly.loop_indices:
                co = me.vertices[me.loops[li].vertex_index].co
                u, v = ((co.y, co.z) if axis == 0 else
                        (co.x, co.z) if axis == 1 else (co.x, co.y))
                uv.data[li].uv = (u * 0.08 + 0.5, v * 0.08 + 0.5)
    if smooth:
        for poly in me.polygons:
            poly.use_smooth = True


def make_object(name, verts, faces, mat, parent=None, loc=(0, 0, 0),
                rot=(0, 0, 0), closed=True, smooth=False, double_sided=False):
    me = bpy.data.meshes.new(name + "_mesh")
    me.from_pydata(verts, [], faces)
    me.update()
    finish_mesh(me, closed=closed, smooth=smooth)
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    ob.data.materials.append(mat)
    if parent is not None:
        ob.parent = parent
    ob.location = loc
    ob.rotation_euler = rot
    ob.scale = (1, 1, 1)
    return ob


def loft(sections, name, mat, parent=None, loc=(0, 0, 0), rot=(0, 0, 0),
         cap_start=True, cap_end=True, closed=True, smooth=False,
         face_material=None, extra_mat=None):
    """sections: list of equal-length lists of (x,y,z) ring points."""
    n = len(sections[0])
    verts = [tuple(p) for sec in sections for p in sec]
    faces = []
    face_tags = []
    for i in range(len(sections) - 1):
        for j in range(n):
            jn = (j + 1) % n
            faces.append((i * n + j, i * n + jn, (i + 1) * n + jn, (i + 1) * n + j))
            face_tags.append(j)
    if cap_start:
        faces.append(tuple(reversed(range(n))))
        face_tags.append(None)
    if cap_end:
        faces.append(tuple(range((len(sections) - 1) * n, len(sections) * n)))
        face_tags.append(None)
    ob = make_object(name, verts, faces, mat, parent=parent, loc=loc, rot=rot,
                     closed=closed, smooth=smooth)
    if face_material is not None and extra_mat is not None:
        ob.data.materials.append(extra_mat)
        for poly, tag in zip(ob.data.polygons, face_tags):
            poly.material_index = 1 if face_material(tag) else 0
    return ob


def densify(rows, factor=3):
    """Linearly subdivide a list of equal-length numeric rows."""
    out = []
    for i in range(len(rows) - 1):
        a, b = rows[i], rows[i + 1]
        for k in range(factor):
            t = k / factor
            out.append(tuple(a[j] + (b[j] - a[j]) * t for j in range(len(a))))
    out.append(rows[-1])
    return out


def prism_poly(name, poly_z_y, half_thick, mat, parent, loc, rot):
    """Extrude a (z,y) polygon along X into a thin solid."""
    n = len(poly_z_y)
    verts = [(-half_thick, y, z) for z, y in poly_z_y]
    verts += [(half_thick, y, z) for z, y in poly_z_y]
    faces = []
    faces.append(tuple(reversed(range(n))))
    faces.append(tuple(range(n, 2 * n)))
    for i in range(n):
        j = (i + 1) % n
        faces.append((i, j, n + j, n + i))
    return make_object(name, verts, faces, mat, parent=parent, loc=loc, rot=rot)


def quad_plane(name, w, h, mat, parent, loc, rot):
    verts = [(-w / 2, -h / 2, 0), (w / 2, -h / 2, 0),
             (w / 2, h / 2, 0), (-w / 2, h / 2, 0)]
    return make_object(name, verts, [(0, 1, 2, 3)], mat, parent=parent,
                       loc=loc, rot=rot, closed=False, double_sided=True)


# ---------------------------------------------------------------------------
# scene setup
# ---------------------------------------------------------------------------
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.unit_settings.system = "METRIC"
scene.unit_settings.scale_length = 1.0

M = {
    "skin": make_material("Mat_Stealth_Skin", "#23272e", 0.65, 0.38),
    "ram": make_material("Mat_Ram_Edges", "#3a414d", 0.42, 0.45),
    "titanium": make_material("Mat_Titanium_Exhaust", "#181a1f", 0.92, 0.22),
    "glass": make_material("Mat_Canopy_Glass", "#ffd166", 0.20, 0.05,
                           alpha=0.28, double_sided=True),
    "cockpit": make_material("Mat_Cockpit_Dark", "#111317", 0.10, 0.85),
    "hud": make_material("Mat_HUD_Glass", "#9fe8ff", 0.10, 0.08,
                         alpha=0.22, double_sided=True),
    "screen": make_material("Mat_Screen_Glow", "#0a1c24", 0.0, 0.35,
                            emission="#4ce0ff", emission_strength=2.6,
                            double_sided=True),
}

Airframe = bpy.data.objects.new("Airframe", None)
bpy.context.collection.objects.link(Airframe)
Airframe.location = (0, 0, 0)
Airframe.rotation_euler = (0, 0, 0)
Airframe.scale = (1, 1, 1)
parts = []


def track(ob):
    parts.append(ob)
    return ob


# ---------------------------------------------------------------------------
# 1. FUSELAGE — chined, blended wing/body loft
# ---------------------------------------------------------------------------
stations = [
    # z,      wt,   wc,   wb,   top,  chine, bottom
    (-9.45, 0.06, 0.09, 0.06, 0.10, -0.03, -0.10),
    (-8.80, 0.10, 0.16, 0.12, 0.18, -0.04, -0.14),
    (-7.60, 0.28, 0.42, 0.32, 0.42, -0.02, -0.30),
    (-6.40, 0.55, 0.80, 0.60, 0.78,  0.02, -0.50),
    (-5.20, 0.92, 1.18, 0.88, 1.06,  0.10, -0.64),
    (-3.80, 1.18, 1.50, 1.05, 1.22,  0.16, -0.78),
    (-2.20, 1.42, 1.78, 1.20, 1.30,  0.20, -0.86),
    ( 0.00, 1.55, 2.00, 1.32, 1.34,  0.22, -0.90),
    ( 2.60, 1.48, 1.90, 1.28, 1.28,  0.20, -0.86),
    ( 5.00, 1.28, 1.62, 1.12, 1.12,  0.16, -0.76),
    ( 7.20, 1.02, 1.28, 0.96, 0.92,  0.10, -0.64),
    ( 8.80, 0.82, 1.02, 0.82, 0.72,  0.06, -0.54),
    ( 9.45, 0.74, 0.92, 0.74, 0.64,  0.04, -0.48),
]


def section(st):
    z, wt, wc, wb, top, chin, bot = st
    return [
        (0.0, top, z),
        (wt, top - 0.14, z),
        (wc, chin, z),
        (wb, bot, z),
        (0.0, bot - 0.06, z),
        (-wb, bot, z),
        (-wc, chin, z),
        (-wt, top - 0.14, z),
    ]


# RAM chine trim is assigned directly to the upper-chine faces (no coplanar strip).
stations = densify(stations, 3)
track(loft([section(s) for s in stations], "Fuselage", M["skin"],
           parent=Airframe, smooth=False,
           face_material=lambda j: j in (1, 7), extra_mat=M["ram"]))

# ---------------------------------------------------------------------------
# 2. MAIN WINGS — swept trapezoids with thin airfoil and RAM leading edge
# ---------------------------------------------------------------------------
AIRFOIL = [
    (0.00, 0.00), (0.12, 0.60), (0.34, 0.98), (0.68, 0.84), (1.00, 0.04),
    (0.86, -0.20), (0.52, -0.50), (0.22, -0.42), (0.04, -0.06),
]


def wing_section(side, t):
    x = side * (1.45 + (HALF_SPAN - 1.45) * t)
    le = -2.80 + 3.80 * t
    te = 4.00 - 0.30 * t
    thick = 0.22 * (1 - t) + 0.07 * t
    yoff = -0.10 + 0.06 * t
    return [(x, yoff + thick * sh, le + (te - le) * cf) for cf, sh in AIRFOIL]


for side, tag in ((-1, "L"), (1, "R")):
    secs = [wing_section(side, t) for t in (0.0, 0.2, 0.4, 0.6, 0.8, 1.0)]
    track(loft(secs, "Main_Wing_" + tag, M["skin"], parent=Airframe,
               cap_start=True, cap_end=True))

    # Leading-edge RAM tape.
    le_verts = []
    for t in (0.0, 0.25, 0.5, 0.75, 1.0):
        x = side * (1.45 + (HALF_SPAN - 1.45) * t)
        z = -2.80 + 3.80 * t
        y = -0.10 + 0.06 * t
        le_verts.append((x, y + 0.02, z - 0.02))
        le_verts.append((x, y + 0.10, z + 0.16))
    f = []
    for i in range(4):
        f.append((2 * i, 2 * i + 1, 2 * i + 3, 2 * i + 2))
    track(make_object("Wing_LE_Ram_" + tag, le_verts, f, M["ram"],
                      parent=Airframe, closed=False))

    # AILERON — hinge line at z = 3.35, x ~ +/-5.4.
    ax = side * 5.40
    ail_verts = [
        (-1.15, -0.015, 0.00), (1.15, -0.015, 0.00),
        (1.15, -0.015, 0.50), (-1.15, -0.015, 0.50),
        (-1.15, 0.015, 0.00), (1.15, 0.015, 0.00),
        (1.15, 0.015, 0.50), (-1.15, 0.015, 0.50),
    ]
    ail_faces = [(0, 1, 2, 3), (7, 6, 5, 4),
                 (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]
    track(make_object("Left_Aileron" if side < 0 else "Right_Aileron",
                      ail_verts, ail_faces, M["skin"], parent=Airframe,
                      loc=(ax, 0.0, 3.35)))

# ---------------------------------------------------------------------------
# 3. HORIZONTAL STABILISERS + ELEVONS (hinge along X at z = 7.30)
# ---------------------------------------------------------------------------
for side, tag in ((-1, "L"), (1, "R")):
    x0, x1 = side * 0.95, side * 3.50
    fixed = [(x0, 0.0, 6.00), (x1, 0.0, 6.95),
             (x1, 0.0, 7.30), (x0, 0.0, 7.30)]
    prism = []
    for x, y, z in fixed:
        prism.append((x, y - 0.06, z))
    for x, y, z in fixed:
        prism.append((x, y + 0.06, z))
    pf = [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1),
          (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]
    track(make_object("Stabilizer_" + tag, prism, pf, M["skin"], parent=Airframe))

    ev = [(x0, -0.06, 0.0), (x1, -0.06, 0.0),
          (x1, -0.06, 1.10), (x0, -0.06, 1.10),
          (x0, 0.06, 0.0), (x1, 0.06, 0.0),
          (x1, 0.06, 1.10), (x0, 0.06, 1.10)]
    track(make_object("Left_Elevon" if side < 0 else "Right_Elevon",
                      ev, pf, M["skin"], parent=Airframe,
                      loc=(0.0, 0.42, 7.30)))

# ---------------------------------------------------------------------------
# 4. CANTED TWIN TAILS + RUDDERS (28 degrees outward, hinge on local Z)
# ---------------------------------------------------------------------------
for side, tag in ((-1, "L"), (1, "R")):
    cant = -side * CANT
    base = Vector((side * 1.15, 0.55, 5.20))
    rot = (0.0, 0.0, cant)

    # Fin stops exactly at the rudder hinge; no overlapping/coplanar faces.
    fin_poly = [(0.0, 0.0), (2.20, 0.0), (2.05, 2.70), (0.95, 2.70)]
    track(prism_poly("Vertical_Tail_" + tag, fin_poly, 0.075,
                     M["skin"], Airframe, tuple(base), rot))

    # Rudder hinge is the local line z = 2.20 in the canted tail frame.
    hinge_local = Vector((0.0, 0.0, 2.20))
    hinge_world = base + Matrix.Rotation(cant, 4, "Z") @ hinge_local
    rud_poly = [(0.0, 0.0), (1.10, 0.0), (0.95, 2.70), (0.0, 2.70)]
    track(prism_poly("Left_Rudder" if side < 0 else "Right_Rudder",
                     rud_poly, 0.055, M["ram"], Airframe,
                     tuple(hinge_world), rot))

# ---------------------------------------------------------------------------
# 5. CARET / DSI INTAKES (angled ducts either side of the fuselage)
# ---------------------------------------------------------------------------
for side, tag in ((-1, "L"), (1, "R")):
    x = side * 1.35
    intake = [
        (x, -0.58, -4.60), (x + side * 0.82, -0.40, -4.05),
        (x + side * 0.82, -0.40, -2.00), (x, -0.58, -2.55),
        (x, -0.02, -4.60), (x + side * 0.82, 0.12, -4.05),
        (x + side * 0.82, 0.12, -2.00), (x, -0.02, -2.55),
    ]
    faces = [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1),
             (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]
    track(make_object("Caret_Intake_" + tag, intake, faces, M["titanium"],
                      parent=Airframe))

# ---------------------------------------------------------------------------
# 6. THRUST-VECTORING NOZZLES (petal rings, pivot at z = 8.55)
# ---------------------------------------------------------------------------
for side, tag in ((-1, "L"), (1, "R")):
    cx = side * 0.88
    pivot = (cx, -0.02, 8.55)
    verts = []
    faces = []
    petals = 10
    for k in range(petals):
        a0 = 2 * math.pi * k / petals
        a1 = 2 * math.pi * (k + 1) / petals
        base_i = len(verts)
        verts.extend([
            (0.62 * math.cos(a0), 0.62 * math.sin(a0), 0.0),
            (0.62 * math.cos(a1), 0.62 * math.sin(a1), 0.0),
            (0.46 * math.cos(a1), 0.46 * math.sin(a1), 0.95),
            (0.46 * math.cos(a0), 0.46 * math.sin(a0), 0.95),
        ])
        faces.append((base_i, base_i + 1, base_i + 2, base_i + 3))
    track(make_object("Nozzle_L" if side < 0 else "Nozzle_R",
                      verts, faces, M["titanium"], parent=Airframe,
                      loc=pivot, closed=False))

    # Dark exhaust throat disc just inside the petals.
    ring = [(0.52 * math.cos(2 * math.pi * k / 16),
             0.52 * math.sin(2 * math.pi * k / 16), -0.02)
            for k in range(16)]
    track(make_object("Exhaust_Throat_" + tag, ring, [tuple(range(16))],
                      M["cockpit"], parent=Airframe, loc=pivot, closed=False))

# ---------------------------------------------------------------------------
# 7. CANOPY GLASS (teardrop bubble over the cockpit)
# ---------------------------------------------------------------------------
canopy_stations = [
    (-6.60, 0.05, 0.05), (-6.10, 0.38, 0.30), (-5.30, 0.60, 0.50),
    (-4.30, 0.72, 0.61), (-3.30, 0.70, 0.58), (-2.55, 0.42, 0.34),
    (-2.20, 0.05, 0.05),
]
canopy_stations = densify(canopy_stations, 2)
canopy_secs = []
for z, w, h in canopy_stations:
    sec = []
    for i in range(7):
        th = math.pi * i / 6.0
        sec.append((-w * math.cos(th), 1.03 + h * math.sin(th), z))
    canopy_secs.append(sec)
track(loft(canopy_secs, "Canopy_Glass", M["glass"], parent=Airframe,
           cap_start=False, cap_end=False, closed=False, smooth=True))

# Canopy sill / frame strips.
for side, tag in ((-1, "L"), (1, "R")):
    fv = []
    for z, w, h in canopy_stations:
        fv.append((side * w, 1.02, z))
        fv.append((side * (w + 0.05), 1.00, z))
    ff = [(2 * i, 2 * i + 1, 2 * i + 3, 2 * i + 2)
          for i in range(len(canopy_stations) - 1)]
    track(make_object("Canopy_Sill_" + tag, fv, ff, M["ram"],
                      parent=Airframe, closed=False))

# ---------------------------------------------------------------------------
# 8. COCKPIT INTERIOR — tub, seat/headrest, glare shield, HUD glass, MFDs
# ---------------------------------------------------------------------------
# Open tub: floor + two walls + rear bulkhead.
tub_z0, tub_z1 = -6.30, -2.70
tub_w = 0.66
tub_verts = [
    (-tub_w, 0.42, tub_z0), (tub_w, 0.42, tub_z0),
    (tub_w, 0.42, tub_z1), (-tub_w, 0.42, tub_z1),
    (-tub_w, 1.18, tub_z0), (tub_w, 1.18, tub_z0),
    (tub_w, 1.18, tub_z1), (-tub_w, 1.18, tub_z1),
]
tub_faces = [
    (0, 1, 5, 4), (3, 7, 6, 2), (0, 4, 7, 3), (1, 2, 6, 5),
]
track(make_object("Cockpit_Tub", tub_verts, tub_faces, M["cockpit"],
                  parent=Airframe, closed=False, double_sided=True))

# Pilot seat + headrest (inside tub, just aft of the eye point).
seat = [(-0.26, 0.45, -3.05), (0.26, 0.45, -3.05),
        (0.26, 0.45, -3.55), (-0.26, 0.45, -3.55),
        (-0.26, 0.95, -3.05), (0.26, 0.95, -3.05),
        (0.26, 0.95, -3.55), (-0.26, 0.95, -3.55)]
seat_f = [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1),
          (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]
track(make_object("Pilot_Seat", seat, seat_f, M["cockpit"], parent=Airframe))
head = [(-0.20, 0.95, -3.06), (0.20, 0.95, -3.06),
        (0.20, 0.95, -3.28), (-0.20, 0.95, -3.28),
        (-0.20, 1.38, -3.06), (0.20, 1.38, -3.06),
        (0.20, 1.38, -3.28), (-0.20, 1.38, -3.28)]
track(make_object("Seat_Headrest", head, seat_f, M["cockpit"], parent=Airframe))

# Angled front glare shield.
gs_verts = [(-0.66, 0.90, -5.55), (0.66, 0.90, -5.55),
            (0.66, 1.16, -5.20), (-0.66, 1.16, -5.20)]
track(make_object("Glare_Shield", gs_verts, [(0, 1, 2, 3)], M["cockpit"],
                  parent=Airframe, closed=False, double_sided=True))

# Tilted transparent combiner glass directly ahead of the pilot eye point.
quad_plane("HUD_Glass", 0.50, 0.36, M["hud"], Airframe,
           loc=(0.0, 1.31, -4.58), rot=(math.radians(-16), 0, 0))

# Front instrument panel + three MFDs tilted toward the pilot.
panel = [(-0.62, 0.62, -5.35), (0.62, 0.62, -5.35),
         (0.62, 1.02, -5.35), (-0.62, 1.02, -5.35)]
track(make_object("Instrument_Panel", panel, [(0, 1, 2, 3)], M["cockpit"],
                  parent=Airframe, closed=False, double_sided=True))
for name, x in (("MFD_Left", -0.38), ("MFD_Center", 0.0), ("MFD_Right", 0.38)):
    quad_plane(name, 0.30, 0.22, M["screen"], Airframe,
               loc=(x, 0.86, -5.31), rot=(math.radians(-18), 0, 0))

# ---------------------------------------------------------------------------
# 9. export + report
# ---------------------------------------------------------------------------
os.makedirs(OUT_DIR, exist_ok=True)

# QA (non-fatal; report is printed for the build log).
try:
    sys.path.insert(0, os.path.expanduser(
        "~/.config/opencode/skills/blender-asset-qa/scripts"))
    import qa_check
    qa = qa_check.run(objects=[o.name for o in parts], profile="game")
except Exception as exc:  # pragma: no cover - QA is advisory in this build
    qa = {"error": str(exc)}

bpy.ops.export_scene.gltf(
    filepath=OUT_GLB,
    export_format="GLB",
    export_yup=False,
    export_apply=True,
    export_cameras=False,
    export_lights=False,
    use_selection=False,
)

names = sorted(o.name for o in bpy.data.objects)
report = {
    "objects": names,
    "parts": [o.name for o in parts],
    "triangles": sum(len(o.data.polygons) for o in parts
                     if o.type == "MESH"),
    "wingspan_m": HALF_SPAN * 2,
    "length_m": TAIL_Z - NOSE_Z,
    "cant_deg": 28,
    "glb": OUT_GLB,
    "glb_bytes": os.path.getsize(OUT_GLB) if os.path.exists(OUT_GLB) else 0,
    "qa": qa,
}
with open(REPORT, "w", encoding="utf-8") as fh:
    json.dump(report, fh, indent=2)

print("ANGELS_ZERO_BUILD " + json.dumps({
    "glb": report["glb"],
    "bytes": report["glb_bytes"],
    "objects": len(names),
    "triangles": report["triangles"],
    "qa_pass": qa.get("pass") if isinstance(qa, dict) else None,
}))
