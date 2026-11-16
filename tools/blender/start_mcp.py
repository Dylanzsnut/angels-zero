"""Launch helper: enable the MCP for Blender addon and start its socket server.

Usage:
    blender.exe --python tools/blender/start_mcp.py
"""

import bpy

try:
    if "blender_mcp" not in bpy.context.preferences.addons:
        bpy.ops.preferences.addon_enable(module="blender_mcp")

    scene = bpy.context.scene
    scene.blendermcp_port = 9876
    scene.blendermcp_auto_start_server = True
    print("OpenCode <-> Blender MCP bridge configured on localhost:9876")
except Exception as exc:  # pragma: no cover - startup diagnostic only
    print("Blender MCP startup failed:", exc)
