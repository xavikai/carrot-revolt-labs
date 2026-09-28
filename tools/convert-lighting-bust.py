"""Build Lighting Lab's compact bust.bin from Blender Studio's CC0 STL.

Run with Blender 5.2:
  blender -b --python tools/convert-lighting-bust.py -- path/to/source.stl

Source and authors are documented in labs/lighting/assets/README.md.
"""

import math
import struct
import sys
from pathlib import Path

import bpy
from mathutils import Vector


arguments = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
if len(arguments) != 1:
    raise SystemExit("Pass the source STL path after --")

source = Path(arguments[0])
output = Path(__file__).resolve().parents[1] / "labs" / "lighting" / "assets" / "bust.bin"

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
bpy.ops.wm.stl_import(filepath=str(source))
sculpt = bpy.context.object

# The scan is dense enough for sculpture, but unnecessary for a 500 px teaching render.
# Reducing it here retains the face's planes while keeping the lab quick to load.
decimate = sculpt.modifiers.new("Web display mesh", "DECIMATE")
decimate.ratio = 0.04
bpy.context.view_layer.objects.active = sculpt
bpy.ops.object.modifier_apply(modifier=decimate.name)
mesh = sculpt.data
for face in mesh.polygons:
    face.use_smooth = True
mesh.update()

lo = [min(vertex.co[i] for vertex in mesh.vertices) for i in range(3)]
hi = [max(vertex.co[i] for vertex in mesh.vertices) for i in range(3)]
center_x = (lo[0] + hi[0]) / 2
center_y = (lo[1] + hi[1]) / 2
scale = 0.39 / (hi[2] - lo[2])

# Blender is Z-up and this STL faces -Y. The lab is Y-up and faces +Z.
# The shoulders sit on the existing socle at HEAD.c.y - 0.265 = 1.285 m.
positions = []
normals = []
for vertex in mesh.vertices:
    x, y, z = vertex.co
    positions.append(((x - center_x) * scale, (z - lo[2]) * scale - 0.265, -(y - center_y) * scale))
    nx, ny, nz = vertex.normal
    n = Vector((nx, nz, -ny)).normalized()
    normals.append(tuple(int(max(-127, min(127, round(component * 127)))) for component in n))

indices = [index for face in mesh.polygons for index in face.vertices]
if len(indices) != len(mesh.polygons) * 3:
    raise RuntimeError("Expected a triangle mesh after decimation")

mins = [min(pos[i] for pos in positions) for i in range(3)]
maxs = [max(pos[i] for pos in positions) for i in range(3)]
sizes = [maxs[i] - mins[i] for i in range(3)]
count = len(positions)
wide = count >= 65536

with output.open("wb") as file:
    file.write(b"BST1")
    file.write(struct.pack("<II", count, len(indices)))
    file.write(struct.pack("<6f", *mins, *sizes))
    for position in positions:
        file.write(struct.pack("<3H", *(round((position[i] - mins[i]) / sizes[i] * 65535) for i in range(3))))
    for normal in normals:
        file.write(struct.pack("<3b", *normal))
    file.write(bytes((-file.tell()) % 4))
    file.write(struct.pack("<" + ("I" if wide else "H") * len(indices), *indices))

print(f"Wrote {output}: {count} vertices, {len(indices) // 3} triangles, {output.stat().st_size // 1024} KiB")
