export const reliefGuideName = ['Build relief with Displacement', 'Crea relleu amb Displacement', 'Crea relieve con Displacement'];

const heightWire = { 'displacement.height': 'math.value' };
const displacementWires = { ...heightWire, 'output.displacement': 'displacement.result' };

export const reliefGuideSteps = [
  {
    action: ['Drag a cable from Value on Math (Greater Than) to Height on Displacement.',
      'Arrossega un cable de Value del node Math (Greater Than) a Height del node Displacement.',
      'Arrastra un cable de Value del nodo Math (Greater Than) a Height del nodo Displacement.'],
    expected: ['The texture already has black (0) and white (1). The plane stays flat until the next cable reaches Material Output.',
      'La textura ja té negre (0) i blanc (1). El pla es manté pla fins que el següent cable arribi a Material Output.',
      'La textura ya tiene negro (0) y blanco (1). El plano se mantiene plano hasta que el siguiente cable llegue a Material Output.'],
    wires: { ...heightWire, 'output.displacement': null },
    focus: [['port', 'math.value'], ['port', 'displacement.height']],
  },
  {
    action: ['Connect the Displacement output to the Displacement input on Material Output.',
      'Connecta la sortida Displacement a l’entrada Displacement de Material Output.',
      'Conecta la salida Displacement a la entrada Displacement de Material Output.'],
    expected: ['The vertices in white areas rise and those in black areas sink. The dashed outline marks the original plane.',
      'Els vèrtexs de les zones blanques pugen i els de les negres baixen. El contorn discontinu marca el pla original.',
      'Los vértices de las zonas blancas suben y los de las negras bajan. El contorno discontinuo marca el plano original.'],
    wires: displacementWires,
    focus: [['port', 'displacement.result'], ['port', 'output.displacement']],
  },
  {
    action: ['Change Scale on Displacement from 0.20 to 0.35.',
      'Canvia Scale del node Displacement de 0,20 a 0,35.',
      'Cambia Scale del nodo Displacement de 0,20 a 0,35.'],
    expected: ['Peaks rise higher and valleys sink deeper. The black and white pattern stays the same.',
      'Els pics pugen més i les valls s’enfonsen més. El dibuix en blanc i negre es manté igual.',
      'Los picos suben más y los valles se hunden más. El dibujo en blanco y negro se mantiene igual.'],
    wires: displacementWires,
    values: { 'displacement.scale': 0.35 },
    focus: [['node-value', 'displacement.scale']],
  },
  {
    action: ['Change Midlevel on Displacement from 0.50 to 0.',
      'Canvia Midlevel del node Displacement de 0,50 a 0.',
      'Cambia Midlevel del nodo Displacement de 0,50 a 0.'],
    expected: ['Black areas now sit at the original plane. White areas still rise above it.',
      'Les zones negres queden ara a l’altura del pla original. Les blanques continuen pujant per sobre del pla.',
      'Las zonas negras quedan ahora a la altura del plano original. Las blancas siguen subiendo por encima del plano.'],
    wires: displacementWires,
    values: { 'displacement.scale': 0.35, 'displacement.midlevel': 0 },
    focus: [['node-value', 'displacement.midlevel']],
  },
  {
    action: ['Raise B on Math (Greater Than) from 0.50 to 0.60.',
      'Puja B del node Math (Greater Than) de 0,50 a 0,60.',
      'Sube B del nodo Math (Greater Than) de 0,50 a 0,60.'],
    expected: ['The jump on the graph moves right. There is less white in the texture, so less of the mesh rises.',
      'El salt de la gràfica es mou cap a la dreta. Hi ha menys blanc a la textura i, per tant, s’aixeca una part més petita de la malla.',
      'El salto de la gráfica se mueve hacia la derecha. Hay menos blanco en la textura y, por tanto, se eleva una parte más pequeña de la malla.'],
    wires: displacementWires,
    values: { 'displacement.scale': 0.35, 'displacement.midlevel': 0, 'math.b': 0.6 },
    focus: [['node-value', 'math.b']],
  },
];

export const reliefBlender = {
  caption: ['Mesh preview · dashed line = original plane', 'Vista de la malla · línia discontínua = pla original', 'Vista de la malla · línea discontinua = plano original'],
  title: ['Rebuild the relief in Blender', 'Reprodueix el relleu a Blender', 'Reproduce el relieve en Blender'],
  docs: ['Blender Manual · Material displacement', 'Manual de Blender · Desplaçament del material', 'Manual de Blender · Desplazamiento del material'],
  steps: [
    ['Add a Plane and a material. Add a Subdivision Surface modifier in Simple mode and raise its render level so the surface has vertices in both the black and white areas.',
      'Afegeix un pla i un material. Posa-hi un modificador Subdivision Surface en mode Simple i puja el nivell de render perquè hi hagi vèrtexs tant a les zones negres com a les blanques.',
      'Añade un plano y un material. Ponle un modificador Subdivision Surface en modo Simple y sube el nivel de render para que haya vértices tanto en las zonas negras como en las blancas.'],
    ['In the Shader Editor, connect UV from Texture Coordinate to Vector on Noise Texture. Set Noise to 2D and Scale to 7. Connect Fac to the first input on Math (Greater Than) and set the second to 0.50. The lab’s Multiply Add starts at 1 and 0, so you can skip it here.',
      'Al Shader Editor, connecta UV de Texture Coordinate a Vector de Noise Texture. Tria 2D i posa Scale a 7. Connecta Fac a la primera entrada de Math (Greater Than) i posa la segona a 0,50. El Multiply Add del lab comença amb 1 i 0, així que te’l pots estalviar aquí.',
      'En el Shader Editor, conecta UV de Texture Coordinate a Vector de Noise Texture. Elige 2D y pon Scale a 7. Conecta Fac a la primera entrada de Math (Greater Than) y pon la segunda a 0,50. El Multiply Add del lab empieza con 1 y 0, así que puedes omitirlo aquí.'],
    ['Connect Math Value to Displacement Height, and Displacement to the matching input on Material Output. Start with Midlevel 0.50 and Scale 0.20. Leave Principled BSDF connected to Surface so the lighting shows the relief.',
      'Connecta Value de Math a Height de Displacement, i Displacement a l’entrada del mateix nom de Material Output. Comença amb Midlevel a 0,50 i Scale a 0,20. Deixa Principled BSDF connectat a Surface perquè la llum mostri el relleu.',
      'Conecta Value de Math a Height de Displacement, y Displacement a la entrada del mismo nombre de Material Output. Empieza con Midlevel a 0,50 y Scale a 0,20. Deja Principled BSDF conectado a Surface para que la luz muestre el relieve.'],
    ['Use Cycles and choose Displacement Only in the material’s displacement settings. Look at the plane from the side in Rendered view and repeat the three value changes from the exercise.',
      'Fes servir Cycles i tria Displacement Only als ajustos de desplaçament del material. Mira el pla de costat a la vista Rendered i repeteix els tres canvis de valors de l’exercici.',
      'Usa Cycles y elige Displacement Only en los ajustes de desplazamiento del material. Mira el plano de lado en la vista Rendered y repite los tres cambios de valores del ejercicio.'],
  ],
};