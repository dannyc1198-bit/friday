# Headless preview for a Meshy GLB/FBX.
# argv after -- : source, png path, optional export path
import bpy
import sys

argv = sys.argv[sys.argv.index("--") + 1:]
source, png = argv[0], argv[1]
export = argv[2] if len(argv) > 2 else ""

bpy.ops.wm.read_factory_settings(use_empty=True)
lower = source.lower()
if lower.endswith(".fbx"):
    bpy.ops.import_scene.fbx(filepath=source)
else:
    bpy.ops.import_scene.gltf(filepath=source)

scene = bpy.context.scene
light_data = bpy.data.lights.new(name="Key", type="AREA")
light_data.energy = 800
light = bpy.data.objects.new(name="Key", object_data=light_data)
scene.collection.objects.link(light)
light.location = (2.5, -2.5, 3.5)

cam_data = bpy.data.cameras.new("Preview")
cam = bpy.data.objects.new("Preview", cam_data)
scene.collection.objects.link(cam)
cam.location = (2.2, -2.8, 1.6)
cam.rotation_euler = (1.15, 0, 0.7)
scene.camera = cam

try:
    scene.render.engine = "BLENDER_EEVEE_NEXT"
except Exception:
    scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 960
scene.render.resolution_y = 540
scene.render.filepath = png
scene.render.image_settings.file_format = "PNG"
bpy.ops.render.render(write_still=True)

if export.endswith(".glb"):
    bpy.ops.export_scene.gltf(filepath=export, export_format="GLB")
elif export.endswith(".fbx"):
    bpy.ops.export_scene.fbx(filepath=export)
