"""Build a detailed first-person cockpit HUD rig (arms, pistols, dashboard) in Blender.

Run with:
    blender.exe --python tools/blender/build_cockpit_hud.py

The exported GLB keeps the pivot names expected by js/renderer3d.js:
    rightArm, leftArm, rWrist, lWrist, rightPistol37Group, pistol37Group,
    pSlide, dropMag, pMuzzleFlash, rightMuzzleFlash, cleaverGroup, dashboardGroup
"""

import math
import bpy
from mathutils import Matrix, Vector

OUT_BLEND = r"D:\orbital-perimeter\models\strider_cockpit_hud.blend"
OUT_GLB = r"D:\orbital-perimeter\models\strider_cockpit_hud.glb"

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
for m in list(bpy.data.materials):
    bpy.data.materials.remove(m)

scene = bpy.context.scene
col = scene.collection


def material(name, color, metal, rough, emit=None, strength=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Metallic"].default_value = metal
    bsdf.inputs["Roughness"].default_value = rough
    if emit is not None:
        bsdf.inputs["Emission Color"].default_value = (*emit, 1.0)
        bsdf.inputs["Emission Strength"].default_value = strength
    return m


armor = material("HUD_Armor", (0.17, 0.22, 0.20), 0.75, 0.36)
olive = material("HUD_Olive", (0.30, 0.31, 0.20), 0.72, 0.40)
steel = material("HUD_Steel", (0.30, 0.35, 0.39), 0.82, 0.28)
gunmetal = material("HUD_Gunmetal", (0.09, 0.11, 0.13), 0.88, 0.32)
chrome = material("HUD_Chrome", (0.78, 0.84, 0.88), 0.94, 0.13)
rubber = material("HUD_Cable", (0.03, 0.035, 0.04), 0.25, 0.75)
hazard = material("HUD_Hazard", (0.90, 0.58, 0.06), 0.62, 0.38)
cyan = material("HUD_Cyan", (0.05, 0.55, 0.75), 0.25, 0.2, (0.1, 0.9, 1.0), 4.0)
amber = material("HUD_Amber", (0.8, 0.25, 0.05), 0.25, 0.2, (1.0, 0.35, 0.05), 3.0)
screen = material("HUD_Screen", (0.02, 0.10, 0.12), 0.6, 0.2, (0.0, 0.45, 0.55), 1.2)


def pivot(name, parent=None, loc=(0, 0, 0)):
    o = bpy.data.objects.new(name, None)
    col.objects.link(o)
    o.empty_display_type = "SPHERE"
    o.empty_display_size = 0.04
    if parent:
        o.parent = parent
    o.location = loc
    return o


def attach(o, parent):
    if parent:
        world = o.matrix_world.copy()
        o.parent = parent
        o.matrix_parent_inverse = parent.matrix_world.inverted()
        o.matrix_world = world
    return o


def finish(o, mat, bevel=0.008):
    if bevel:
        b = o.modifiers.new("Bevel", "BEVEL")
        b.width = bevel
        b.segments = 2
        o.modifiers.new("Weighted", "WEIGHTED_NORMAL")
    o.data.materials.append(mat)
    return o


def box(name, parent, loc, size, mat, bevel=0.008, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.object
    o.name = name
    o.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return attach(finish(o, mat, bevel), parent)


def cyl(name, parent, loc, radius, depth, mat, rot=(0, 0, 0), verts=12, bevel=0):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius, depth=depth, location=loc, rotation=rot)
    o = bpy.context.object
    o.name = name
    if bevel:
        b = o.modifiers.new("Bevel", "BEVEL")
        b.width = bevel
        b.segments = 2
    return attach(finish(o, mat, bevel), parent)


def hose(name, parent, points, radius=0.012, mat=rubber):
    curve = bpy.data.curves.new(name + "_c", type="CURVE")
    curve.dimensions = "3D"
    curve.bevel_depth = radius
    curve.bevel_resolution = 3
    sp = curve.splines.new("BEZIER")
    sp.bezier_points.add(len(points) - 1)
    for bp, co in zip(sp.bezier_points, points):
        bp.co = co
        bp.handle_left_type = "AUTO"
        bp.handle_right_type = "AUTO"
    o = bpy.data.objects.new(name, curve)
    col.objects.link(o)
    o.data.materials.append(mat)
    return attach(o, parent)


root = pivot("COCKPIT_HUD_ROOT")
right_arm = pivot("rightArm", root, (0.75, 0.70, -0.58))
left_arm = pivot("leftArm", root, (-0.42, 0.84, -0.50))
r_wrist = pivot("rWrist", right_arm, (0.02, -0.02, 0.0))
l_wrist = pivot("lWrist", left_arm, (-0.02, -0.02, 0.0))
dashboard = pivot("dashboardGroup", root, (0, 0.62, -0.86))
right_arm.rotation_euler.z = -0.10
left_arm.rotation_euler.z = 0.10

# ---------------------------------------------------------------------------
# Armored mech forearms / gauntlets
# ---------------------------------------------------------------------------
for side, arm, wrist in ((-1, left_arm, l_wrist), (1, right_arm, r_wrist)):
    tag = "L" if side < 0 else "R"
    bx = side * 0.20
    box("Forearm_Shell_" + tag, arm, (bx, 0.16, -0.02), (0.30, 0.52, 0.28), armor, 0.035)
    box("Forearm_Top_Plate_" + tag, arm, (bx, 0.20, 0.14), (0.26, 0.42, 0.06), olive, 0.018)
    box("Forearm_Side_Plate_" + tag, arm, (bx + side * 0.16, 0.16, 0.0), (0.04, 0.38, 0.20), steel, 0.012)
    box("Elbow_Joint_" + tag, arm, (bx, -0.14, -0.01), (0.24, 0.16, 0.24), gunmetal, 0.025)
    cyl("Elbow_Pin_" + tag, arm, (bx + side * 0.13, -0.14, -0.01), 0.05, 0.28, chrome, (0, math.pi / 2, 0), 12)
    box("Wrist_Housing_" + tag, wrist, (0, -0.02, 0), (0.24, 0.18, 0.22), gunmetal, 0.018)
    # Exposed damper and cabling along the forearm
    cyl("Forearm_Piston_" + tag, arm, (bx + side * 0.09, 0.12, 0.16), 0.028, 0.40, chrome, (math.pi / 2, 0, 0), 10)
    cyl("Forearm_Sleeve_" + tag, arm, (bx + side * 0.09, 0.02, 0.16), 0.042, 0.22, gunmetal, (math.pi / 2, 0, 0), 10)
    hose("Forearm_Hose_" + tag, arm, [(bx + side * 0.13, -0.12, 0.08), (bx + side * 0.17, 0.10, 0.12), (bx + side * 0.12, 0.30, 0.04)], 0.014)
    for i in range(4):
        cyl("Forearm_Rivet_%s_%d" % (tag, i), arm, (bx + side * 0.14, 0.02 + i * 0.10, 0.15), 0.014, 0.012, chrome, (math.pi / 2, 0, 0), 8)
    box("Forearm_Hazard_" + tag, arm, (bx, 0.30, 0.15), (0.20, 0.035, 0.06), hazard, 0.003)
    # Five articulated fingers wrapped around the grip
    for f in range(4):
        fx = -0.09 + f * 0.06
        box("Finger_%s_%d" % (tag, f), wrist, (fx, 0.10, -0.06), (0.045, 0.13, 0.06), steel, 0.008, (0.35, 0, 0))
        box("Fingertip_%s_%d" % (tag, f), wrist, (fx, 0.17, -0.09), (0.04, 0.07, 0.05), gunmetal, 0.006, (0.5, 0, 0))
    box("Thumb_" + tag, wrist, (side * 0.13, 0.10, -0.03), (0.06, 0.12, 0.06), steel, 0.008, (0, 0, side * 0.4))

# ---------------------------------------------------------------------------
# Detailed 37mm machine pistols (one per hand)
# ---------------------------------------------------------------------------
def build_pistol(parent, tag, x, z):
    pg = pivot(("rightPistol37Group" if tag == "R" else "pistol37Group"), parent, (x, 0.14, z))
    box("Pistol_Receiver_" + tag, pg, (x, 0.16, z), (0.16, 0.50, 0.20), gunmetal, 0.012)
    slide = box("Pistol_Slide_" + tag, pg, (x, 0.30, z + 0.05), (0.14, 0.60, 0.14), steel, 0.010)
    box("Slide_Plate_" + tag, pg, (x + 0.075, 0.30, z + 0.05), (0.015, 0.46, 0.10), gunmetal, 0.004)
    for i in range(6):
        box("Serration_%s_%d" % (tag, i), pg, (x + 0.082, 0.08 + i * 0.035, z + 0.05), (0.012, 0.012, 0.11), gunmetal, 0.002)
    cyl("Barrel_" + tag, pg, (x, 0.72, z + 0.04), 0.038, 0.44, steel, (math.pi / 2, 0, 0), 12)
    cyl("Muzzle_" + tag, pg, (x, 0.95, z + 0.04), 0.055, 0.11, gunmetal, (math.pi / 2, 0, 0), 12, 0.006)
    cyl("Bore_" + tag, pg, (x, 1.01, z + 0.04), 0.030, 0.02, rubber, (math.pi / 2, 0, 0), 10)
    for i in range(4):
        a = (i / 4.0) * math.pi * 2
        cyl("Muzzle_Port_%s_%d" % (tag, i), pg, (x + math.cos(a) * 0.042, 0.96, z + 0.04 + math.sin(a) * 0.042), 0.008, 0.06, gunmetal, (math.pi / 2, 0, 0), 6)
    box("Under_Rail_" + tag, pg, (x, 0.62, z - 0.09), (0.07, 0.30, 0.05), gunmetal, 0.005)
    for i in range(4):
        box("Under_Vent_%s_%d" % (tag, i), pg, (x, 0.52 + i * 0.07, z - 0.10), (0.05, 0.02, 0.04), gunmetal, 0.002)
    box("Laser_Housing_" + tag, pg, (x, 0.74, z - 0.10), (0.06, 0.14, 0.06), gunmetal, 0.005)
    box("Laser_Lens_" + tag, pg, (x, 0.82, z - 0.10), (0.035, 0.015, 0.035), cyan, 0.002)
    box("Optic_Housing_" + tag, pg, (x, 0.42, z + 0.16), (0.11, 0.16, 0.08), gunmetal, 0.006)
    box("Optic_Lens_" + tag, pg, (x, 0.50, z + 0.16), (0.075, 0.015, 0.05), cyan, 0.002)
    box("Hazard_Stripe_" + tag, pg, (x, 0.30, z + 0.13), (0.10, 0.03, 0.05), hazard, 0.002)
    grip = box("Grip_" + tag, pg, (x, 0.02, z - 0.02), (0.10, 0.28, 0.13), armor, 0.012, (0.28, 0, 0))
    mag = box("Magazine_" + tag, pg, (x, -0.08, z - 0.02), (0.11, 0.22, 0.10), hazard, 0.008)
    for i in range(3):
        box("Mag_Rib_%s_%d" % (tag, i), pg, (x + 0.058, -0.14 + i * 0.06, z - 0.02), (0.012, 0.02, 0.08), gunmetal, 0.002)
    hose("Feed_Hose_" + tag, pg, [(x + 0.06, -0.12, z - 0.02), (x + 0.10, 0.06, z - 0.08), (x + 0.06, 0.24, z)], 0.012)
    flash = pivot(("rightMuzzleFlash" if tag == "R" else "pMuzzleFlash"), pg, (x, 1.03, z + 0.04))
    box("Flash_Core_" + tag, flash, (x, 1.03, z + 0.04), (0.06, 0.06, 0.10), amber)
    return slide, mag


slide_r, drop_r = build_pistol(r_wrist, "R", 0.02, -0.02)
slide_l, drop_l = build_pistol(l_wrist, "L", -0.02, -0.02)
# Game expects a single pSlide / dropMag reference; use the left pistol as primary.
slide_l.name = "pSlide"
drop_l.name = "dropMag"

# Compact combat knife on the left forearm
knife = pivot("cleaverGroup", l_wrist, (-0.18, 0.12, -0.04))
box("Knife_Grip", knife, (-0.18, 0.12, -0.04), (0.05, 0.18, 0.06), gunmetal, 0.006)
box("Knife_Guard", knife, (-0.18, 0.24, -0.04), (0.11, 0.03, 0.10), steel, 0.004)
box("Knife_Blade", knife, (-0.18, 0.48, -0.04), (0.035, 0.42, 0.09), steel, 0.004)
box("Knife_Edge", knife, (-0.18, 0.50, 0.01), (0.02, 0.40, 0.025), cyan, 0.002)

# ---------------------------------------------------------------------------
# 3D dashboard console at the bottom of the visor
# ---------------------------------------------------------------------------
box("Dash_Base", dashboard, (0, 0.62, -0.86), (0.78, 0.30, 0.22), gunmetal, 0.03)
box("Dash_Top_Plate", dashboard, (0, 0.70, -0.86), (0.72, 0.05, 0.18), steel, 0.012)
box("Dash_Hazard", dashboard, (0, 0.74, -0.86), (0.60, 0.02, 0.05), hazard, 0.002)
for i in range(5):
    box("Dash_Vent_%d" % i, dashboard, (-0.28 + i * 0.14, 0.62, -0.74), (0.09, 0.04, 0.02), gunmetal, 0.003)
for sx in (-1, 1):
    cyl("Dash_Gauge_%s" % sx, dashboard, (sx * 0.24, 0.66, -0.74), 0.055, 0.02, screen, (math.pi / 2, 0, 0), 16)
    cyl("Dash_Gauge_Rim_%s" % sx, dashboard, (sx * 0.24, 0.66, -0.73), 0.065, 0.012, chrome, (math.pi / 2, 0, 0), 16)
    for k in range(6):
        a = (k / 6.0) * math.pi * 1.4 + 0.3
        box("Gauge_Tick_%s_%d" % (sx, k), dashboard,
            (sx * 0.24 + math.cos(a) * 0.038, 0.66 + math.sin(a) * 0.038, -0.72),
            (0.008, 0.012, 0.006), cyan, 0.001)
box("Dash_Center_Screen", dashboard, (0, 0.64, -0.73), (0.20, 0.10, 0.02), screen, 0.004)
for i in range(4):
    box("Screen_Line_%d" % i, dashboard, (-0.07 + i * 0.045, 0.64, -0.71), (0.03, 0.008, 0.004), cyan, 0.001)
for i in range(8):
    cyl("Dash_Button_%d" % i, dashboard, (-0.28 + i * 0.08, 0.56, -0.74), 0.012, 0.012, hazard if i % 3 == 0 else cyan, (math.pi / 2, 0, 0), 8)

def hud_light(name, loc, energy, color, size):
    data = bpy.data.lights.new(name, type="AREA")
    data.energy = energy
    data.color = color
    data.shape = "DISK"
    data.size = size
    obj = bpy.data.objects.new(name, data)
    col.objects.link(obj)
    obj.location = loc
    obj.rotation_euler = (Vector((0, 0.7, -0.5)) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()


hud_light("HUD_Key", (1.6, -1.8, 2.0), 1100, (0.72, 0.86, 1.0), 2.2)
hud_light("HUD_Rim", (-1.6, 1.4, 1.6), 850, (1.0, 0.58, 0.28), 2.0)
hud_light("HUD_Fill", (0.2, -1.2, -0.6), 500, (0.2, 0.9, 1.0), 1.6)

world = bpy.data.worlds.new("HUD_Studio") if not bpy.data.worlds else bpy.data.worlds[0]
scene.world = world
world.use_nodes = True
bg = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
bg.inputs["Color"].default_value = (0.01, 0.02, 0.03, 1)
bg.inputs["Strength"].default_value = 0.8

cam_data = bpy.data.cameras.new("HUD_Camera")
cam = bpy.data.objects.new("HUD_Camera", cam_data)
col.objects.link(cam)
cam.location = (0, -2.75, 0.28)
cam.rotation_euler = (Vector((0, 0.65, -0.58)) - cam.location).to_track_quat("-Z", "Y").to_euler()
cam_data.lens = 62
scene.camera = cam

bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
bpy.ops.object.select_all(action="DESELECT")
for o in bpy.data.objects:
    if o.type in {"MESH", "EMPTY"}:
        o.select_set(True)
bpy.ops.export_scene.gltf(
    filepath=OUT_GLB,
    export_format="GLB",
    use_selection=True,
    export_apply=True,
    export_yup=True,
    export_lights=False,
    export_cameras=False,
)
print("Cockpit HUD built:", len([o for o in bpy.data.objects if o.type == "MESH"]), "meshes ->", OUT_GLB)
