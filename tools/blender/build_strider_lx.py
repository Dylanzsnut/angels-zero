"""Build the STRIDER-LX scout mech in Blender and export it as a GLB.

Run with:
    blender.exe --python tools/blender/build_strider_lx.py

Keeps the named pivot hierarchy expected by js/renderer3d.js:
    STRIDER_LX_ROOT, upperBody, headGroup, rArm, lArm, rifleGroup,
    legs.L/R.hip, legs.L/R.shin, legs.L/R.foot
"""

import math
import bpy
from mathutils import Matrix, Vector

OUT_BLEND = r"D:\orbital-perimeter\models\strider_lx.blend"
OUT_GLB = r"D:\orbital-perimeter\models\strider_lx.glb"

# ---------------------------------------------------------------------------
# Scene setup
# ---------------------------------------------------------------------------
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
for block in list(bpy.data.materials):
    bpy.data.materials.remove(block)

scene = bpy.context.scene
collection = scene.collection


def material(name, color, metal, rough, emit=None, strength=0.0, grain=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nodes = m.node_tree.nodes
    links = m.node_tree.links
    bsdf = next(n for n in nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Metallic"].default_value = metal
    bsdf.inputs["Roughness"].default_value = rough
    if emit is not None:
        bsdf.inputs["Emission Color"].default_value = (*emit, 1.0)
        bsdf.inputs["Emission Strength"].default_value = strength
    if grain:
        noise = nodes.new("ShaderNodeTexNoise")
        noise.inputs["Scale"].default_value = 140.0
        noise.inputs["Detail"].default_value = 2.0
        bump = nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = grain
        bump.inputs["Distance"].default_value = 0.012
        links.new(noise.outputs["Fac"], bump.inputs["Height"])
        links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return m


armor = material("LX_Armor", (0.085, 0.155, 0.165), 0.78, 0.32, grain=0.07)
steel = material("LX_Steel", (0.21, 0.26, 0.29), 0.82, 0.30, grain=0.07)
panel = material("LX_Panel", (0.13, 0.17, 0.19), 0.74, 0.38, grain=0.07)
frame = material("LX_Frame", (0.045, 0.06, 0.07), 0.88, 0.34, grain=0.12)
chrome = material("LX_Chrome", (0.74, 0.80, 0.84), 0.94, 0.14)
rubber = material("LX_Cable", (0.025, 0.03, 0.035), 0.25, 0.72)
optic = material("LX_Optic", (0.04, 0.55, 0.75), 0.2, 0.18, (0.1, 0.9, 1.0), 7.0)
hazard = material("LX_Hazard", (0.88, 0.53, 0.04), 0.6, 0.4, grain=0.07)
glass = material("LX_Glass", (0.02, 0.07, 0.09), 0.9, 0.12, (0.0, 0.35, 0.45), 0.9)


def pivot(name, parent=None, loc=(0, 0, 0)):
    e = bpy.data.objects.new(name, None)
    collection.objects.link(e)
    e.empty_display_type = "SPHERE"
    e.empty_display_size = 0.09
    if parent:
        e.parent = parent
    e.location = loc
    return e


def attach(obj, parent):
    if parent:
        world = obj.matrix_world.copy()
        obj.parent = parent
        obj.matrix_parent_inverse = parent.matrix_world.inverted()
        obj.matrix_world = world
    return obj


def finish(obj, mat, bevel, bevel_segments=2):
    if bevel:
        mod = obj.modifiers.new("Bevel", "BEVEL")
        mod.width = bevel
        mod.segments = bevel_segments
        obj.modifiers.new("Weighted", "WEIGHTED_NORMAL")
    obj.data.materials.append(mat)
    return obj


def box(name, parent, loc, size, mat, bevel=0.025, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.object
    o.name = name
    o.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return attach(finish(o, mat, bevel), parent)


def cyl(name, parent, loc, radius, depth, mat, rot=(0, 0, 0), verts=16, bevel=0):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=verts, radius=radius, depth=depth, location=loc, rotation=rot
    )
    o = bpy.context.object
    o.name = name
    return attach(finish(o, mat, bevel), parent)


def cone(name, parent, loc, r1, r2, depth, mat, rot=(0, 0, 0), verts=12):
    bpy.ops.mesh.primitive_cone_add(
        vertices=verts, radius1=r1, radius2=r2, depth=depth, location=loc, rotation=rot
    )
    o = bpy.context.object
    o.name = name
    return attach(finish(o, mat, 0.012), parent)


def hose(name, parent, points, radius=0.028, mat=rubber):
    curve = bpy.data.curves.new(name + "_curve", type="CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 12
    curve.bevel_depth = radius
    curve.bevel_resolution = 3
    spline = curve.splines.new("BEZIER")
    spline.bezier_points.add(len(points) - 1)
    for bp, co in zip(spline.bezier_points, points):
        bp.co = co
        bp.handle_left_type = "AUTO"
        bp.handle_right_type = "AUTO"
    o = bpy.data.objects.new(name, curve)
    collection.objects.link(o)
    o.data.materials.append(mat)
    return attach(o, parent)


# ---------------------------------------------------------------------------
# Named pivot hierarchy (animation contract)
# ---------------------------------------------------------------------------
root = pivot("STRIDER_LX_ROOT")
upper = pivot("upperBody", root, (0, 0, 2.20))
head = pivot("headGroup", upper, (0, 0.10, 1.35))
r_arm = pivot("rArm", upper, (0.92, 0.05, 0.86))
l_arm = pivot("lArm", upper, (-0.92, 0.05, 0.86))
rifle = pivot("rifleGroup", r_arm, (0, 0.92, -0.52))

# ---------------------------------------------------------------------------
# Torso: layered armor, reactor, vents, spine and skirt
# ---------------------------------------------------------------------------
box("Torso_Core", upper, (0, 0, 2.95), (1.12, 1.02, 1.20), armor, 0.075)
box("Torso_Cowling", upper, (0, 0.14, 3.52), (0.86, 0.82, 0.44), steel, 0.06, (-0.32, 0, 0))
box("Torso_Chin", upper, (0, 0.52, 2.52), (0.78, 0.34, 0.38), armor, 0.04, (-0.22, 0, 0))
box("Chest_Plate_Top", upper, (0, 0.56, 3.02), (1.00, 0.10, 0.38), panel, 0.025, (-0.10, 0, 0))
box("Chest_Plate_Mid", upper, (0, 0.60, 2.86), (0.96, 0.11, 0.44), steel, 0.028)
box("Chest_Plate_Low", upper, (0, 0.58, 2.66), (0.86, 0.10, 0.30), panel, 0.022, (0.12, 0, 0))
box("Chest_Hazard", upper, (0.34, 0.67, 2.68), (0.26, 0.025, 0.10), hazard, 0.004)

cyl("Reactor_Housing", upper, (0, 0.66, 2.84), 0.23, 0.10, frame, (math.pi / 2, 0, 0), 16)
cyl("Reactor_Core", upper, (0, 0.72, 2.84), 0.15, 0.06, optic, (math.pi / 2, 0, 0), 16)
for i in range(8):
    a = (i / 8.0) * math.pi * 2
    cyl(
        "Reactor_Rivet_%d" % i,
        upper,
        (math.cos(a) * 0.20, 0.70, 2.84 + math.sin(a) * 0.20),
        0.016,
        0.025,
        chrome,
        (math.pi / 2, 0, 0),
        8,
    )

for s in (-1, 1):
    box("Side_Vent_%s" % s, upper, (s * 0.58, 0.22, 2.86), (0.11, 0.44, 0.32), frame, 0.02)
    for i in range(5):
        box(
            "Vent_Louver_%s_%d" % (s, i),
            upper,
            (s * 0.645, 0.06 + i * 0.09, 2.86),
            (0.035, 0.038, 0.27),
            chrome if i % 2 == 0 else steel,
            0.006,
        )
    box("Panel_Seam_%s" % s, upper, (s * 0.43, 0.57, 3.12), (0.022, 0.03, 0.62), frame, 0.004)
    for z in (2.55, 2.82, 3.10, 3.38):
        cyl("Hull_Rivet_%s_%s" % (s, z), upper, (s * 0.52, 0.56, z), 0.026, 0.024, chrome, (math.pi / 2, 0, 0), 8)
    # Shoulder mount ring
    cyl("Shoulder_Mount_%s" % s, upper, (s * 0.74, 0.02, 3.26), 0.20, 0.22, frame, (0, math.pi / 2, 0), 14)
    cyl("Shoulder_Pin_%s" % s, upper, (s * 0.86, 0.02, 3.26), 0.075, 0.30, chrome, (0, math.pi / 2, 0), 12)

# Dorsal spine and waist skirt
for i in range(4):
    box("Spine_Plate_%d" % i, upper, (0, -0.55, 2.72 + i * 0.23), (0.44 - i * 0.04, 0.12, 0.16), steel, 0.02)
cyl("Waist_Ring", root, (0, 0, 2.18), 0.52, 0.20, frame, (0, 0, 0), 16)
for s in (-1, 1):
    box("Hip_Skirt_%s" % s, root, (s * 0.46, 0.14, 1.98), (0.34, 0.44, 0.30), armor, 0.03, (0, 0, s * 0.18))
box("Groin_Guard", root, (0, 0.44, 1.94), (0.42, 0.16, 0.40), steel, 0.025)

# ---------------------------------------------------------------------------
# Sensor head: faceted cowling, panoramic optic, cheek plates, antennas
# ---------------------------------------------------------------------------
cyl("Sensor_Cowling", head, (0, 0.34, 3.60), 0.34, 0.60, steel, (math.pi / 2, 0, 0), 6, 0.02)
cone("Sensor_Nose", head, (0, 0.72, 3.60), 0.30, 0.10, 0.42, armor, (math.pi / 2, 0, 0), 6)
box("Optic_Housing", head, (0, 0.84, 3.60), (1.12, 0.12, 0.18), frame, 0.02)
box("Panoramic_Optic_Strip", head, (0, 0.91, 3.60), (1.02, 0.07, 0.11), optic, 0.012)
box("Visor_Brow", head, (0, 0.84, 3.75), (1.10, 0.08, 0.08), armor, 0.015, (0.12, 0, 0))
for s in (-1, 1):
    box("Cheek_Plate_%s" % s, head, (s * 0.34, 0.48, 3.48), (0.16, 0.30, 0.28), panel, 0.02, (0, 0, s * 0.22))
    box("Side_Optic_%s" % s, head, (s * 0.45, 0.60, 3.62), (0.05, 0.10, 0.16), optic, 0.008)
    cyl("Comms_Antenna_%s" % s, head, (s * 0.44, 0.08, 3.92), 0.018, 0.86, chrome, (-0.55, 0, s * 0.18), 8)
    cyl("Antenna_Tip_%s" % s, head, (s * 0.58, -0.15, 4.22), 0.035, 0.10, optic, (-0.55, 0, s * 0.18), 8)
    hose("Antenna_Cable_%s" % s, head, [(s * 0.44, 0.06, 3.86), (s * 0.52, -0.12, 3.74), (s * 0.38, -0.26, 3.66)], 0.012)
cyl("Sensor_Dish", head, (0, 0.10, 4.02), 0.18, 0.06, glass, (0, 0, 0), 16)

# ---------------------------------------------------------------------------
# Arms, pauldrons, pistons and cabling
# ---------------------------------------------------------------------------
for s, arm in ((-1, l_arm), (1, r_arm)):
    x = s * 0.92
    tag = "L" if s < 0 else "R"
    box("Pauldron_Outer_%s" % tag, arm, (x, 0.05, 3.30), (0.44, 0.72, 0.54), armor, 0.05, (0, 0, s * 0.26))
    box("Pauldron_Upper_%s" % tag, arm, (x, 0.10, 3.52), (0.36, 0.46, 0.22), steel, 0.025, (0, 0, s * 0.26))
    box("Pauldron_Hazard_%s" % tag, arm, (x, 0.44, 3.28), (0.30, 0.035, 0.15), hazard, 0.004)
    for i in range(3):
        cyl("Pauldron_Rivet_%s_%d" % (tag, i), arm, (x + s * 0.16, 0.30, 3.14 + i * 0.15), 0.022, 0.02, chrome, (math.pi / 2, 0, 0), 8)
    box("UpperArm_%s" % tag, arm, (x, 0.05, 2.86), (0.25, 0.29, 0.55), steel, 0.03)
    box("UpperArm_Panel_%s" % tag, arm, (x + s * 0.14, 0.08, 2.88), (0.03, 0.22, 0.42), panel, 0.008)
    cyl("Elbow_%s" % tag, arm, (x, 0.06, 2.56), 0.16, 0.32, frame, (0, math.pi / 2, 0), 14)
    cyl("Elbow_Pin_%s" % tag, arm, (x + s * 0.17, 0.06, 2.56), 0.055, 0.36, chrome, (0, math.pi / 2, 0), 10)
    box("Forearm_%s" % tag, arm, (x, 0.34, 2.30), (0.29, 0.56, 0.33), armor, 0.03)
    box("Forearm_Plate_%s" % tag, arm, (x, 0.62, 2.32), (0.24, 0.06, 0.26), steel, 0.012)
    box("Hand_%s" % tag, arm, (x, 0.68, 2.14), (0.22, 0.20, 0.22), frame, 0.02)
    for f in (-0.07, 0, 0.07):
        box("Finger_%s_%s" % (tag, f), arm, (x + f, 0.82, 2.10), (0.055, 0.16, 0.10), steel, 0.01)
    cyl("Arm_Sleeve_%s" % tag, arm, (x + s * 0.11, 0.28, 2.72), 0.07, 0.44, frame, (0.9, 0, 0), 10)
    cyl("Arm_Piston_%s" % tag, arm, (x + s * 0.11, 0.32, 2.54), 0.042, 0.52, chrome, (0.9, 0, 0), 10)
    hose("Arm_Hose_%s" % tag, arm, [(x + s * 0.10, -0.12, 3.18), (x + s * 0.16, 0.10, 2.90), (x + s * 0.12, 0.34, 2.66)], 0.024)

# Twin 37mm machine pistols: one per hand, no rifle on the STRIDER-LX.
for s, arm in ((-1, l_arm), (1, r_arm)):
    x = s * 0.92
    tag = "L" if s < 0 else "R"
    box("Pistol_Receiver_" + tag, arm, (x, 1.26, 2.30), (0.23, 0.86, 0.31), frame, 0.025)
    box("Pistol_Slide_" + tag, arm, (x, 1.40, 2.45), (0.21, 0.98, 0.21), steel, 0.018)
    box("Pistol_Slide_Plate_" + tag, arm, (x + s * 0.115, 1.42, 2.45), (0.025, 0.72, 0.16), panel, 0.006)
    # Rear slide serrations
    for i in range(7):
        box(
            "Slide_Serration_%s_%d" % (tag, i),
            arm,
            (x + s * 0.126, 1.02 + i * 0.055, 2.45),
            (0.018, 0.02, 0.17),
            frame,
            0.003,
        )
    # Barrel, muzzle brake and bore
    cyl("Pistol_Barrel_" + tag, arm, (x, 2.02, 2.34), 0.052, 0.74, steel, (math.pi / 2, 0, 0), 12)
    cyl("Pistol_Muzzle_" + tag, arm, (x, 2.44, 2.34), 0.082, 0.17, frame, (math.pi / 2, 0, 0), 12, 0.012)
    cyl("Pistol_Bore_" + tag, arm, (x, 2.53, 2.34), 0.042, 0.04, rubber, (math.pi / 2, 0, 0), 10)
    for i in range(4):
        a = (i / 4.0) * math.pi * 2
        cyl(
            "Muzzle_Port_%s_%d" % (tag, i),
            arm,
            (x + math.cos(a) * 0.058, 2.46, 2.34 + math.sin(a) * 0.058),
            0.012,
            0.09,
            frame,
            (math.pi / 2, 0, 0),
            6,
        )
    # Underslung vents, laser/light module and optic
    box("Pistol_UnderRail_" + tag, arm, (x, 1.88, 2.15), (0.10, 0.52, 0.08), panel, 0.008)
    for i in range(5):
        box("Under_Vent_%s_%d" % (tag, i), arm, (x, 1.70 + i * 0.09, 2.10), (0.07, 0.03, 0.06), frame, 0.004)
    box("Pistol_Laser_Housing_" + tag, arm, (x, 2.02, 2.10), (0.09, 0.22, 0.09), frame, 0.008)
    box("Pistol_Laser_Lens_" + tag, arm, (x, 2.14, 2.10), (0.05, 0.02, 0.05), optic, 0.003)
    box("Pistol_Optic_" + tag, arm, (x, 1.30, 2.59), (0.15, 0.26, 0.11), frame, 0.01)
    box("Pistol_Optic_Lens_" + tag, arm, (x, 1.45, 2.59), (0.10, 0.02, 0.07), optic, 0.003)
    box("Pistol_Hazard_" + tag, arm, (x, 1.10, 2.46), (0.16, 0.04, 0.09), hazard, 0.003)
    # Grip and ribbed magazine
    box("Pistol_Grip_" + tag, arm, (x, 0.94, 2.18), (0.15, 0.44, 0.19), armor, 0.018, (-0.22, 0, 0))
    box("Pistol_Magazine_" + tag, arm, (x, 0.74, 2.16), (0.17, 0.38, 0.15), hazard, 0.012)
    for i in range(4):
        box("Mag_Rib_%s_%d" % (tag, i), arm, (x + s * 0.09, 0.62 + i * 0.08, 2.16), (0.02, 0.03, 0.13), frame, 0.003)
    hose("Pistol_Feed_" + tag, arm, [(x + s * 0.08, 0.70, 2.16), (x + s * 0.14, 0.94, 2.06), (x + s * 0.10, 1.18, 2.14)], 0.022)

# Compact combat knife mounted on the left forearm (kept alongside the pistols)
box("Cleaver_Handle", l_arm, (-1.06, 0.52, 2.62), (0.09, 0.34, 0.11), frame, 0.012)
box("Cleaver_Guard", l_arm, (-1.06, 0.70, 2.62), (0.16, 0.05, 0.16), steel, 0.01)
box("Cleaver_Blade", l_arm, (-1.06, 1.00, 2.62), (0.05, 0.62, 0.16), steel, 0.008)
box("Cleaver_Glowing_Edge", l_arm, (-1.06, 1.04, 2.71), (0.028, 0.60, 0.04), optic, 0.003)
for i in range(3):
    cyl("Cleaver_Rivet_%d" % i, l_arm, (-1.06, 0.50 + i * 0.08, 2.69), 0.014, 0.016, chrome, (math.pi / 2, 0, 0), 8)

# ---------------------------------------------------------------------------
# Reverse-joint digitigrade legs
# ---------------------------------------------------------------------------
for s, label in ((-1, "L"), (1, "R")):
    x = s * 0.50
    hip = pivot("legs.%s.hip" % label, root, (x, 0, 1.94))
    shin = pivot("legs.%s.shin" % label, hip, (0, -0.12, -0.74))
    foot = pivot("legs.%s.foot" % label, shin, (0, -0.42, -0.82))

    cyl("Hip_Joint_%s" % label, hip, (x, 0, 1.94), 0.22, 0.38, frame, (0, math.pi / 2, 0), 14)
    cyl("Hip_Pin_%s" % label, hip, (x + s * 0.20, 0, 1.94), 0.06, 0.42, chrome, (0, math.pi / 2, 0), 10)
    box("Thigh_%s" % label, hip, (x, 0.16, 1.56), (0.35, 0.44, 0.78), armor, 0.04, (0.32, 0, 0))
    box("Thigh_Plate_%s" % label, hip, (x, 0.40, 1.54), (0.27, 0.05, 0.60), steel, 0.012, (0.32, 0, 0))
    box("Thigh_Hazard_%s" % label, hip, (x, 0.43, 1.30), (0.18, 0.025, 0.08), hazard, 0.003)

    cyl("Knee_Joint_%s" % label, shin, (x, -0.12, 1.20), 0.18, 0.36, frame, (0, math.pi / 2, 0), 14)
    box("Knee_Guard_%s" % label, shin, (x, 0.14, 1.18), (0.32, 0.11, 0.32), steel, 0.02)
    box("Knee_Hazard_%s" % label, shin, (x, 0.20, 1.18), (0.22, 0.03, 0.10), hazard, 0.004)
    box("Shin_%s" % label, shin, (x, -0.34, 0.78), (0.27, 0.34, 0.84), steel, 0.03, (-0.42, 0, 0))
    box("Greave_%s" % label, shin, (x, -0.54, 0.80), (0.22, 0.12, 0.64), armor, 0.02, (-0.42, 0, 0))
    box("Shin_Side_Plate_%s" % label, shin, (x + s * 0.15, -0.36, 0.74), (0.035, 0.24, 0.50), panel, 0.008, (-0.42, 0, 0))
    for i in range(3):
        cyl("Knee_Rivet_%s_%d" % (label, i), shin, (x + (i - 1) * 0.09, 0.20, 1.18), 0.018, 0.02, chrome, (math.pi / 2, 0, 0), 8)

    cyl("Hydraulic_Sleeve_%s" % label, hip, (x, -0.18, 1.50), 0.078, 0.48, frame, (0.32, 0, 0), 10)
    cyl("Hydraulic_Rod_%s" % label, shin, (x, -0.30, 1.08), 0.043, 0.64, chrome, (0.32, 0, 0), 10)
    cyl("Second_Damper_%s" % label, shin, (x + s * 0.12, -0.20, 1.02), 0.028, 0.46, chrome, (0.26, 0, 0), 8)
    hose("Leg_Hose_%s" % label, hip, [(x + s * 0.12, 0.10, 1.86), (x + s * 0.18, -0.10, 1.60), (x + s * 0.10, -0.26, 1.36)], 0.022)

    # Calf thruster
    cyl("Calf_Thruster_%s" % label, shin, (x, -0.56, 0.62), 0.11, 0.32, frame, (math.pi / 2, 0, 0), 12)
    cyl("Calf_Thruster_Core_%s" % label, shin, (x, -0.74, 0.62), 0.07, 0.08, optic, (math.pi / 2, 0, 0), 12)

    cyl("Ankle_%s" % label, foot, (x, -0.50, 0.34), 0.15, 0.28, frame, (0, math.pi / 2, 0), 12)
    box("Foot_Sole_%s" % label, foot, (x, -0.30, 0.12), (0.50, 0.78, 0.17), frame, 0.03)
    box("Foot_Instep_%s" % label, foot, (x, -0.20, 0.24), (0.38, 0.46, 0.10), armor, 0.02)
    for t in (-0.17, 0, 0.17):
        box("Toe_%s_%s" % (label, t), foot, (x + t, -0.02, 0.10), (0.13, 0.32, 0.15), armor, 0.012)
        box("Toe_Claw_%s_%s" % (label, t), foot, (x + t, 0.14, 0.08), (0.10, 0.12, 0.07), chrome, 0.006)
    cyl("Heel_%s" % label, foot, (x, -0.62, 0.18), 0.12, 0.24, steel, (math.pi / 2, 0, 0), 10)

# ---------------------------------------------------------------------------
# Rear vector thrusters
# ---------------------------------------------------------------------------
for s in (-1, 1):
    cyl("Vector_Housing_%s" % s, upper, (s * 0.38, -0.62, 2.92), 0.20, 0.52, frame, (math.pi / 2, 0, 0), 14)
    cyl("Vector_Bell_%s" % s, upper, (s * 0.38, -0.92, 2.92), 0.16, 0.20, steel, (math.pi / 2, 0, 0), 14, 0.02)
    cyl("Vector_Core_%s" % s, upper, (s * 0.38, -1.04, 2.92), 0.10, 0.08, optic, (math.pi / 2, 0, 0), 14)
    box("Vector_Hazard_%s" % s, upper, (s * 0.38, -0.66, 3.20), (0.22, 0.03, 0.08), hazard, 0.004)
    box("Vector_Fin_%s" % s, upper, (s * 0.56, -0.70, 2.92), (0.035, 0.34, 0.30), panel, 0.008)

# ---------------------------------------------------------------------------
# Final mechanical detail pass: radiators, cabling, stencils and fasteners
# ---------------------------------------------------------------------------
# Backpack radiator stack and power conduits
for i in range(6):
    box("Back_Radiator_%d" % i, upper, (0, -0.62, 2.62 + i * 0.12), (0.52, 0.06, 0.055), panel if i % 2 else steel, 0.008)
for s in (-1, 1):
    hose("Back_Conduit_%s" % s, upper, [(s * 0.28, -0.58, 2.60), (s * 0.52, -0.42, 2.96), (s * 0.70, -0.10, 3.18)], 0.018)
    box("Back_Status_%s" % s, upper, (s * 0.32, -0.70, 3.34), (0.07, 0.02, 0.04), optic, 0.003)

# Shoulder hinge rings, pins and status lamps
for s, arm in ((-1, l_arm), (1, r_arm)):
    x = s * 0.92
    tag = "L" if s < 0 else "R"
    cyl("Shoulder_Hinge_%s" % tag, arm, (x, 0.02, 3.30), 0.26, 0.16, frame, (0, math.pi / 2, 0), 14)
    cyl("Shoulder_Hinge_Pin_%s" % tag, arm, (x + s * 0.14, 0.02, 3.30), 0.055, 0.22, chrome, (0, math.pi / 2, 0), 12)
    box("Shoulder_Lamp_%s" % tag, arm, (x, 0.46, 3.46), (0.05, 0.025, 0.05), optic, 0.003)
    for i in range(4):
        cyl("Pauldron_Bolt_%s_%d" % (tag, i), arm, (x + s * 0.18, 0.30, 3.16 + i * 0.11), 0.018, 0.018, chrome, (math.pi / 2, 0, 0), 8)

# Thigh actuators, hazard stencils and greave fasteners
for s, label in ((-1, "L"), (1, "R")):
    x = s * 0.50
    hip_obj = bpy.data.objects["legs.%s.hip" % label]
    shin_obj = bpy.data.objects["legs.%s.shin" % label]
    cyl("Thigh_Actuator_" + label, hip_obj, (x + s * 0.16, 0.02, 1.62), 0.055, 0.56, frame, (0.18, 0, 0), 10)
    cyl("Thigh_Actuator_Rod_" + label, hip_obj, (x + s * 0.16, 0.04, 1.34), 0.030, 0.42, chrome, (0.18, 0, 0), 8)
    box("Thigh_Stencil_" + label, hip_obj, (x, 0.43, 1.44), (0.20, 0.025, 0.12), hazard, 0.003)
    box("Shin_Stencil_" + label, shin_obj, (x, -0.56, 0.62), (0.16, 0.025, 0.10), hazard, 0.003)
    for i in range(4):
        cyl("Greave_Bolt_%s_%d" % (label, i), shin_obj, (x, -0.61, 0.58 + i * 0.13), 0.016, 0.016, chrome, (math.pi / 2, 0, 0), 8)
    box("Knee_Lamp_" + label, shin_obj, (x, 0.22, 1.28), (0.04, 0.02, 0.04), optic, 0.003)

# ---------------------------------------------------------------------------
# Upgrade catalog: every config upgrade modeled as a named attachable part.
# Game code can toggle each group by name once the GLB is loaded.
# ---------------------------------------------------------------------------
# Softer emissive reserved for catalog parts (base armor optics stay bright).
optic = material("LX_UpgradeGlow", (0.05, 0.45, 0.65), 0.3, 0.25, (0.06, 0.65, 0.9), 1.4)

parents = {
    "upper": upper, "head": head, "rArm": r_arm, "lArm": l_arm, "rifle": rifle,
    "hipL": bpy.data.objects["legs.L.hip"], "hipR": bpy.data.objects["legs.R.hip"],
    "shinL": bpy.data.objects["legs.L.shin"], "shinR": bpy.data.objects["legs.R.shin"],
    "footL": bpy.data.objects["legs.L.foot"], "footR": bpy.data.objects["legs.R.foot"],
}


def upgrade_group(name, parent_key, loc):
    g = bpy.data.objects.new(name, None)
    collection.objects.link(g)
    g.matrix_world = Matrix.Translation(Vector(loc))
    world = g.matrix_world.copy()
    g.parent = parents[parent_key]
    g.matrix_parent_inverse = parents[parent_key].matrix_world.inverted()
    g.matrix_world = world
    return g


def upgrade_shape(name, group, loc, size, shape, mat, rot=(0, 0, 0)):
    if shape == "ring":
        bpy.ops.mesh.primitive_torus_add(major_radius=size[0], minor_radius=size[1], location=loc, rotation=rot)
        o = bpy.context.object
        o.name = name
        o.data.materials.append(mat)
        return attach(o, group)
    if shape in ("spike", "dish"):
        return cone(name, group, loc, size[0], size[1], size[2], mat, rot, 10)
    if shape in ("cylinder", "drum", "coil", "antenna", "capacitor", "barrel"):
        return cyl(name, group, loc, size[0], size[1], mat, rot, 12, 0.006)
    return box(name, group, loc, size, mat, 0.012, rot)


def add_up(prefix, uid, parent_key, loc, shape, size, mat, rot=(0, 0, 0)):
    name = prefix + "_" + uid
    g = upgrade_group(name, parent_key, loc)
    upgrade_shape(name + "_mesh", g, loc, size, shape, mat, rot)
    return g


# 16 Hangar meta upgrades
meta_specs = [
    ("hull_plating", "upper", (0, 0.68, 2.92), "plate", (1.02, 0.09, 0.62), steel),
    ("thruster_tuning", "upper", (0, -0.74, 2.92), "fin", (0.52, 0.10, 0.44), optic),
    ("scrap_magnet", "upper", (0, 0.70, 3.06), "ring", (0.30, 0.045), optic, (math.pi / 2, 0, 0)),
    ("neural_tactics", "head", (0, 0.10, 4.14), "antenna", (0.022, 0.52), chrome),
    ("kinetic_accelerators", "rArm", (0.92, 1.76, 2.46), "coil", (0.19, 0.05), optic, (0, math.pi / 2, 0)),
    ("heavy_barrel_kit", "rArm", (0.92, 2.56, 2.34), "barrel", (0.075, 0.82), steel, (math.pi / 2, 0, 0)),
    ("plasma_cleaver_edge", "lArm", (-1.06, 1.06, 2.72), "blade", (0.045, 0.66, 0.07), optic),
    ("sidearm_mag_core", "lArm", (-0.92, 0.62, 2.18), "plate", (0.20, 0.30, 0.12), hazard),
    ("shoulder_pod_rack", "rArm", (0.92, 0.10, 3.52), "plate", (0.46, 0.38, 0.52), hazard),
    ("reactive_shield_array", "upper", (0, -0.70, 3.40), "fin", (0.56, 0.10, 0.34), optic),
    ("cryo_heat_sinks", "upper", (0, -0.78, 2.66), "fin", (0.62, 0.08, 0.48), steel),
    ("servo_leg_actuators", "hipL", (-0.66, 0.02, 1.54), "cylinder", (0.065, 0.60), chrome),
    ("radar_sensor_array", "upper", (0, -0.34, 4.26), "antenna", (0.028, 0.72), chrome),
    ("overdrive_reactor", "upper", (0, 0.74, 2.84), "ring", (0.24, 0.05), optic, (math.pi / 2, 0, 0)),
    ("emp_shock_capacitors", "shinR", (0.62, -0.12, 1.06), "capacitor", (0.10, 0.30), optic),
    ("nanite_repair_core", "upper", (0, -0.62, 3.06), "plate", (0.70, 0.08, 0.50), armor),
]
for spec in meta_specs:
    add_up("UPG", *spec)

# 30 tactical mods, routed to the body/gun region their bonus affects.
mod_ids = [
    "mod_sabot_rounds", "mod_hollow_point", "mod_ceramite_shins", "mod_vent_louvers",
    "mod_magnet_coils", "mod_cleaver_serration", "mod_thruster_nozzle", "mod_shield_cell",
    "mod_seeker_warhead", "mod_hydraulic_knees", "mod_stomp_spikes", "mod_sonar_amp",
    "mod_du_jacket", "mod_shield_capacitor", "mod_cryo_manifold", "mod_tactical_uplink",
    "mod_titanium_ribs", "mod_magnum_cylinder", "mod_plasma_filament", "mod_cluster_rack",
    "mod_overclock_gyro", "mod_kinetic_core", "mod_aegis_emitter", "mod_hyper_coolant",
    "mod_shockwave_sole", "mod_predator_optics", "mod_rail_accelerator", "mod_vanguard_plate",
    "mod_warp_thrusters", "mod_apex_overdrive",
]
mod_shapes = ["plate", "coil", "fin", "cylinder", "lamp", "ring", "capacitor", "barrel"]
mod_mats = [steel, optic, hazard, chrome, panel]
for i, uid in enumerate(mod_ids):
    low = uid.lower()
    if any(k in low for k in ("barrel", "rifle", "rounds", "jacket", "rail", "sabot", "vent_louvers")):
        parent, loc = "rArm", (0.92, 1.20 + (i % 5) * 0.22, 2.42 + (i % 2) * 0.09)
    elif any(k in low for k in ("pistol", "magnum", "hollow")):
        parent, loc = "lArm", (-0.92, 1.18 + (i % 4) * 0.24, 2.46)
    elif any(k in low for k in ("knee", "shin", "sole", "stomp", "hydraulic")):
        parent = "shinL" if i % 2 else "shinR"
        loc = ((-0.5 if i % 2 else 0.5), -0.28, 0.66 + (i % 4) * 0.14)
    elif any(k in low for k in ("thruster", "nozzle", "warp")):
        parent, loc = "upper", ((-0.38 if i % 2 else 0.38), -0.76, 2.78 + (i % 3) * 0.20)
    elif any(k in low for k in ("sonar", "optic", "predator")):
        parent, loc = "head", ((-0.32 if i % 2 else 0.32), 0.52, 3.68 + (i % 3) * 0.11)
    else:
        parent, loc = "upper", ((-0.30 if i % 2 else 0.30), 0.64 if i % 2 else -0.66, 2.58 + (i % 6) * 0.15)
    shape = mod_shapes[i % len(mod_shapes)]
    sizes = {
        "plate": (0.26, 0.06, 0.20), "coil": (0.13, 0.04), "fin": (0.28, 0.05, 0.22),
        "cylinder": (0.05, 0.26), "lamp": (0.06, 0.04, 0.06), "ring": (0.13, 0.025),
        "capacitor": (0.07, 0.22), "barrel": (0.035, 0.34),
    }
    rot = (math.pi / 2, 0, 0) if shape in ("coil", "ring", "barrel") else (0, 0, 0)
    add_up("MOD", uid, parent, loc, shape, sizes[shape], mod_mats[i % len(mod_mats)], rot)

# 10 cosmetic/mech attachments
att_specs = [
    ("att_spotlight", "lArm", (-1.02, 0.40, 3.36), "cylinder", (0.12, 0.22), optic, (math.pi / 2, 0, 0)),
    ("att_antenna", "upper", (0.52, -0.42, 4.20), "antenna", (0.022, 0.92), chrome),
    ("att_kneeguards", "shinL", (-0.50, 0.22, 1.18), "plate", (0.38, 0.12, 0.34), armor),
    ("att_ammodrum", "upper", (0, -0.82, 2.84), "drum", (0.30, 0.44), hazard, (0, 0, math.pi / 2)),
    ("att_exhaust", "upper", (0.58, -0.66, 3.30), "cylinder", (0.09, 0.74), steel),
    ("att_reactor", "upper", (0, 0.78, 2.84), "ring", (0.28, 0.045), optic, (math.pi / 2, 0, 0)),
    ("att_buckler", "lArm", (-1.30, 0.52, 2.42), "plate", (0.08, 0.62, 0.52), armor, (0, 0, -0.22)),
    ("att_bayonets", "rArm", (0.92, 2.28, 2.10), "blade", (0.035, 0.44, 0.06), steel),
    ("att_halo", "upper", (0, -0.10, 4.38), "ring", (0.46, 0.035), optic, (math.pi / 2, 0, 0)),
    ("att_crown", "head", (0, 0.10, 4.10), "spike", (0.10, 0.02, 0.34), hazard),
]
for spec in att_specs:
    add_up("ATT", *spec)

# 16 weapon builds (rifle / pistol / melee / stomp kits)
build_specs = [
    ("standard_rotary", "rArm", (0.92, 1.60, 2.50), "plate", (0.12, 0.40, 0.12), steel),
    ("burst_rail_rifle", "rArm", (0.92, 2.46, 2.34), "barrel", (0.045, 0.72), optic, (math.pi / 2, 0, 0)),
    ("gatling_shredder", "rArm", (0.92, 1.98, 2.48), "coil", (0.17, 0.05), optic, (0, math.pi / 2, 0)),
    ("incendiary_rotary", "rArm", (0.92, 1.34, 2.48), "cylinder", (0.07, 0.32), hazard),
    ("standard_37mm", "lArm", (-0.92, 1.28, 2.48), "plate", (0.10, 0.36, 0.10), steel),
    ("fan_hammer_37mm", "lArm", (-0.92, 2.30, 2.34), "barrel", (0.06, 0.30), hazard, (math.pi / 2, 0, 0)),
    ("heavy_slug_37mm", "lArm", (-1.04, 1.46, 2.45), "cylinder", (0.085, 0.34), chrome),
    ("smart_gyro_37mm", "lArm", (-0.92, 1.62, 2.60), "lamp", (0.07, 0.05, 0.07), optic),
    ("standard_cleaver", "lArm", (-1.06, 0.92, 2.64), "plate", (0.06, 0.44, 0.10), steel),
    ("twin_chainblades", "lArm", (-1.18, 1.02, 2.64), "blade", (0.04, 0.56, 0.05), steel),
    ("plasma_greatsword", "lArm", (-1.06, 1.14, 2.68), "blade", (0.05, 0.72, 0.08), optic),
    ("arc_halberd", "lArm", (-1.06, 1.00, 2.72), "spike", (0.08, 0.02, 0.62), optic),
    ("standard_stomp", "footL", (-0.50, -0.30, 0.16), "plate", (0.42, 0.10, 0.30), steel),
    ("tremor_slam", "footR", (0.50, -0.30, 0.16), "spike", (0.10, 0.02, 0.28), hazard),
    ("pile_driver", "footL", (-0.50, -0.10, 0.12), "cylinder", (0.10, 0.30), chrome),
    ("cryo_quake", "footR", (0.50, -0.10, 0.12), "ring", (0.16, 0.03), optic, (math.pi / 2, 0, 0)),
]
for spec in build_specs:
    add_up("BUILD", *spec)

# ---------------------------------------------------------------------------
# Studio lighting / camera
# ---------------------------------------------------------------------------
world = bpy.data.worlds.new("LX_Studio") if not bpy.data.worlds else bpy.data.worlds[0]
scene.world = world
world.use_nodes = True
bg = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
bg.inputs["Color"].default_value = (0.012, 0.020, 0.030, 1.0)
bg.inputs["Strength"].default_value = 0.9


def light(name, loc, energy, color, size):
    data = bpy.data.lights.new(name, type="AREA")
    data.energy = energy
    data.color = color
    data.shape = "DISK"
    data.size = size
    obj = bpy.data.objects.new(name, data)
    collection.objects.link(obj)
    obj.location = loc
    obj.rotation_euler = (Vector((0, 0, 2.2)) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()


light("Key_Cool", (4.5, -5.5, 7.0), 1850, (0.72, 0.85, 1.0), 5.0)
light("Rim_Warm", (-5.0, 4.5, 5.5), 1350, (1.0, 0.55, 0.25), 4.0)
light("Fill_Cyan", (0.5, -4.0, 2.2), 750, (0.2, 0.9, 1.0), 3.0)

cam_data = bpy.data.cameras.new("LX_Camera")
cam = bpy.data.objects.new("LX_Camera", cam_data)
collection.objects.link(cam)
cam.location = (5.0, 7.2, 4.3)
cam.rotation_euler = (Vector((0, 0, 2.25)) - cam.location).to_track_quat("-Z", "Y").to_euler()
cam_data.lens = 50
scene.camera = cam

# ---------------------------------------------------------------------------
# Looping walk cycle keyed on the named animation pivots
# ---------------------------------------------------------------------------
scene.frame_start = 1
scene.frame_end = 40
scene.render.fps = 30
hips = {s: bpy.data.objects["legs.%s.hip" % s] for s in ("L", "R")}
shins = {s: bpy.data.objects["legs.%s.shin" % s] for s in ("L", "R")}
feet = {s: bpy.data.objects["legs.%s.foot" % s] for s in ("L", "R")}

for frame in range(1, 42):
    phase = ((frame - 1) / 40.0) * math.pi * 2
    for side, offset in (("L", 0.0), ("R", math.pi)):
        p = phase + offset
        swing = math.sin(p)
        lift = max(0.0, math.cos(p))
        hip, shin, foot = hips[side], shins[side], feet[side]
        hip.rotation_euler.x = swing * 0.42
        hip.location.z = 1.94 + lift * 0.10
        shin.rotation_euler.x = -lift * 0.62 - max(0.0, -swing) * 0.10
        foot.rotation_euler.x = -(hip.rotation_euler.x + shin.rotation_euler.x) + 0.05 * lift
        hip.keyframe_insert(data_path="rotation_euler", frame=frame)
        hip.keyframe_insert(data_path="location", frame=frame)
        shin.keyframe_insert(data_path="rotation_euler", frame=frame)
        foot.keyframe_insert(data_path="rotation_euler", frame=frame)

    upper.rotation_euler.x = -0.02 + 0.028 * math.sin(phase * 2)
    upper.rotation_euler.z = 0.035 * math.sin(phase)
    upper.location.z = 2.20 + 0.035 * abs(math.sin(phase))
    upper.keyframe_insert(data_path="rotation_euler", frame=frame)
    upper.keyframe_insert(data_path="location", frame=frame)

    r_arm.rotation_euler.x = -0.08 + 0.12 * math.sin(phase + math.pi)
    l_arm.rotation_euler.x = -0.08 + 0.12 * math.sin(phase)
    r_arm.rotation_euler.z = -0.04 + 0.03 * math.sin(phase)
    l_arm.rotation_euler.z = 0.04 - 0.03 * math.sin(phase)
    r_arm.keyframe_insert(data_path="rotation_euler", frame=frame)
    l_arm.keyframe_insert(data_path="rotation_euler", frame=frame)

    rifle.rotation_euler.x = 0.02 * math.sin(phase * 4)
    rifle.keyframe_insert(data_path="rotation_euler", frame=frame)

for obj in (hips["L"], shins["L"], feet["L"], hips["R"], shins["R"], feet["R"], upper, r_arm, l_arm, rifle):
    if obj.animation_data and obj.animation_data.action:
        obj.animation_data.action.name = "LX_Walk_Cycle"
scene.frame_set(1)

# ---------------------------------------------------------------------------
# Save and export
# ---------------------------------------------------------------------------
bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
bpy.ops.object.select_all(action="DESELECT")
for obj in bpy.data.objects:
    if obj.type in {"MESH", "EMPTY"}:
        obj.select_set(True)
bpy.ops.export_scene.gltf(
    filepath=OUT_GLB,
    export_format="GLB",
    use_selection=True,
    export_apply=True,
    export_yup=True,
    export_animations=True,
    export_lights=False,
    export_cameras=False,
)

# Keep the OpenCode bridge alive in this Blender instance.
try:
    if "blender_mcp" not in bpy.context.preferences.addons:
        bpy.ops.preferences.addon_enable(module="blender_mcp")
    bpy.context.scene.blendermcp_port = 9876
    bpy.context.scene.blendermcp_auto_start_server = True
except Exception as exc:
    print("MCP addon startup note:", exc)

print(
    "STRIDER_LX built:",
    len([o for o in bpy.data.objects if o.type == "MESH"]),
    "meshes ->",
    OUT_GLB,
)
