"""Build the downloadable example. Run with Blender --background --factory-startup --python."""
from pathlib import Path
from mathutils import Vector
import bpy


ASSETS = Path(__file__).resolve().parents[1] / "labs" / "blender-worn-paint" / "assets"
PRESETS = (
    ("Noise", (-1.23, 1.07)),
    ("Image", (1.23, 1.07)),
    ("Voronoi", (-1.23, -1.07)),
    ("Color Ramp", (1.23, -1.07)),
)


def linear_rgba(hex_rgb):
    channels = [int(hex_rgb[i : i + 2], 16) / 255 for i in (0, 2, 4)]
    linear = [n / 12.92 if n <= 0.04045 else ((n + 0.055) / 1.055) ** 2.4 for n in channels]
    return (*linear, 1)


def make_material(name, image):
    material = bpy.data.materials.new(f"Worn Paint | {name}")
    if material.node_tree is None:
        material.use_nodes = True
    material.diffuse_color = linear_rgba("2c8294")
    tree = material.node_tree
    tree.nodes.clear()

    def node(kind, key, location, label="", width=182):
        item = tree.nodes.new(kind)
        item.name = key
        item.label = label
        item.location = location
        item.width = width
        return item

    def connect(source, output, target, input_socket):
        tree.links.new(source.outputs[output], target.inputs[input_socket])

    def noise(key, label, pos, scale):
        result = node("ShaderNodeTexNoise", key, pos, label)
        result.noise_dimensions = "3D"
        result.noise_type = "FBM"
        result.normalize = True
        result.inputs["Scale"].default_value = scale
        result.inputs["Detail"].default_value = 2
        result.inputs["Roughness"].default_value = 0.5
        return result

    def remap(key, label, pos, interpolation, start, end, low, high):
        result = node("ShaderNodeMapRange", key, pos, label)
        result.interpolation_type = interpolation
        result.clamp = True
        for socket, value in zip(("From Min", "From Max", "To Min", "To Max"), (start, end, low, high)):
            result.inputs[socket].default_value = value
        return result

    def multiply_add(key, label, pos, multiplier, addend=0):
        result = node("ShaderNodeMath", key, pos, label)
        result.operation = "MULTIPLY_ADD"
        result.inputs[1].default_value = multiplier
        result.inputs[2].default_value = addend
        return result

    shift = 285 if name == "Color Ramp" else 0
    coord = node("ShaderNodeTexCoord", "Coordinates", (-980, -shift))
    if name == "Image":
        source = node("ShaderNodeTexImage", "Wear Source", (-745, -shift), "Wear | Image Texture", 195)
        source.image = image
        source.interpolation = "Linear"
        source.extension = "EXTEND"
        connect(coord, "UV", source, "Vector")
        source_socket = "Color"
    elif name == "Voronoi":
        source = node("ShaderNodeTexVoronoi", "Wear Source", (-745, -shift), "Wear | Voronoi Texture")
        source.voronoi_dimensions = "2D"
        source.feature = "F1"
        source.distance = "EUCLIDEAN"
        source.inputs["Scale"].default_value = 7
        connect(coord, "Generated", source, "Vector")
        source_socket = "Distance"
    else:
        source = noise("Wear Source", "Wear | Noise Texture", (-745, -shift), 7)
        connect(coord, "Generated", source, "Vector")
        source_socket = "Fac"

    mask = remap("Wear Mask", "Wear Mask | Smooth Step", (-495, -shift), "SMOOTHSTEP", 0.52, 0.64, 0, 1)
    connect(source, source_socket, mask, "Value")
    mix = node("ShaderNodeMix", "Paint and Primer", (-195, 125), "Paint and Primer | Mix Color")
    mix.data_type = "RGBA"
    mix.blend_type = "MIX"
    mix.clamp_factor = True
    mix.inputs[6].default_value = linear_rgba("2c8294")
    mix.inputs[7].default_value = linear_rgba("ad6638")
    connect(mask, "Result", mix, 0)
    if name == "Color Ramp":
        pigment = noise("Pigment Noise", "Pigment | Noise Texture", (-745, 105), 18)
        ramp = node("ShaderNodeValToRGB", "Pigment Ramp", (-495, 105), "Pigment | Color Ramp", 245)
        ramp.color_ramp.interpolation = "LINEAR"
        for stop, (position, color) in zip(ramp.color_ramp.elements, ((0.22, "143f49"), (0.78, "5eacaa"))):
            stop.position = position
            stop.color = linear_rgba(color)
        connect(coord, "Generated", pigment, "Vector")
        connect(pigment, "Fac", ramp, "Fac")
        connect(ramp, "Color", mix, 6)

    roughness = remap("Roughness", "Roughness | Linear", (-195, -222), "LINEAR", 0, 1, 0.29, 0.72)
    connect(mask, "Result", roughness, "Value")
    layers = multiply_add("Layer Height", "Layer Height | Multiply Add", (-495, -420 - shift), -0.55, 0.65)
    connect(mask, "Result", layers, 0)
    grain = noise("Grain", "Grain | Noise Texture", (-745, -422 - shift), 65)
    connect(coord, "Generated", grain, "Vector")
    height = multiply_add("Combined Height", "Combined Height | Multiply Add", (-195, -620 - shift), 0.12)
    connect(grain, "Fac", height, 0)
    connect(layers, "Value", height, 2)
    bump = node("ShaderNodeBump", "Relief", (55, -565 - shift), "Relief | Bump")
    bump.inputs["Strength"].default_value = 0.32
    bump.inputs["Distance"].default_value = 0.055
    connect(height, "Value", bump, "Height")

    bsdf = node("ShaderNodeBsdfPrincipled", "Surface Shader", (65, 120), width=245)
    bsdf.inputs["Metallic"].default_value = 0
    connect(mix, 2, bsdf, "Base Color")
    connect(roughness, "Result", bsdf, "Roughness")
    connect(bump, "Normal", bsdf, "Normal")
    output = node("ShaderNodeOutputMaterial", "Material Output", (385, 120))
    connect(bsdf, "BSDF", output, "Surface")
    for item in tree.nodes:
        item.select = False
    tree.nodes.active = mask
    return material


def make_sample(name, xy, image):
    bpy.ops.mesh.primitive_plane_add(size=2, location=(*xy, 0))
    sample = bpy.context.object
    sample.name = f"Worn Paint | {name}"
    sample.data.materials.append(make_material(name, image))
    solidify = sample.modifiers.new("Sample thickness", "SOLIDIFY")
    solidify.thickness = 0.08
    bevel = sample.modifiers.new("Rounded sample border", "BEVEL")
    bevel.width = 0.025
    bevel.segments = 3
    return sample


def point_at(obj, xyz):
    obj.rotation_euler = (Vector(xyz) - obj.location).to_track_quat("-Z", "Y").to_euler()


def add_light(name, location, energy, size, color):
    data = bpy.data.lights.new(name, "AREA")
    data.energy = energy
    data.shape = "DISK"
    data.size = size
    data.color = color
    light = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(light)
    light.location = location
    point_at(light, (0, 0, 0))


def build():
    bpy.ops.wm.read_factory_settings(use_empty=False)
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)

    image = bpy.data.images.load(str(ASSETS / "wear-mask.png"))
    image.name = "Wear Mask.png"
    image.colorspace_settings.name = "Non-Color"
    image.pack()
    image.filepath = "//wear-mask.png"
    samples = [make_sample(name, xy, image) for name, xy in PRESETS]

    plane_mat = bpy.data.materials.new("Studio backing")
    plane_mat.diffuse_color = (0.05, 0.057, 0.066, 1)
    if plane_mat.node_tree is None:
        plane_mat.use_nodes = True
    backing = plane_mat.node_tree.nodes.get("Principled BSDF")
    backing.inputs["Base Color"].default_value = plane_mat.diffuse_color
    backing.inputs["Roughness"].default_value = 0.82
    bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, -0.098))
    bpy.context.object.name = "Studio backing"
    bpy.context.object.data.materials.append(plane_mat)
    bpy.context.object.hide_select = True

    add_light("Key | broad softbox", (-3.5, -2.3, 5.0), 630, 4.0, (0.9, 0.95, 1.0))
    add_light("Rim | grazing", (3.3, 2.5, 2.5), 690, 2.0, (1.0, 0.83, 0.66))
    camera_data = bpy.data.cameras.new("Material comparison")
    camera = bpy.data.objects.new("Material comparison", camera_data)
    bpy.context.collection.objects.link(camera)
    camera.location = (0, -5.7, 9.6)
    point_at(camera, (0, 0, 0))
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = 5.65
    scene = bpy.context.scene
    scene.camera = camera
    scene.render.resolution_x = 1040
    scene.render.resolution_y = 900
    scene.render.resolution_percentage = 100

    selected = samples[0]
    bpy.ops.object.select_all(action="DESELECT")
    selected.select_set(True)
    bpy.context.view_layer.objects.active = selected

    window = bpy.context.window
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type == "VIEW_3D":
                space = area.spaces.active
                space.region_3d.view_location = (0, 0, 0)
                space.region_3d.view_rotation = camera.rotation_euler.to_quaternion()
                space.region_3d.view_distance = 8.9
                space.region_3d.view_perspective = "ORTHO"
                space.overlay.show_overlays = False
                if screen.name.startswith(("Layout", "Shading")):
                    space.shading.type = "MATERIAL"
            elif area.type == "NODE_EDITOR" and area.ui_type == "ShaderNodeTree" and screen == bpy.context.screen:
                region = next((r for r in area.regions if r.type == "WINDOW"), None)
                if window and region:
                    with bpy.context.temp_override(window=window, area=area, region=region):
                        bpy.ops.node.view_all()

    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(ASSETS / "worn-paint.blend"), compress=True)


if __name__ == "__main__":
    build()
