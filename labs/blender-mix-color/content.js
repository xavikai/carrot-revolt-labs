// For the modes expressed with T, the node returns A + f × (T − A).
export const groups = {
  Blend: {
    Mix: ['A + f × (B − A)', 'Use a grayscale mask as Factor to reveal B only where the mask is bright.', 'Connecta una màscara en grisos a Factor perquè B aparegui on la màscara és clara.', 'Conecta una máscara de grises a Factor para que B aparezca donde la máscara es clara.'],
    Add: ['A + f × B', 'Add a layer of highlights. Black in B is neutral. Watch for channels above 1.', 'Afegeix una capa de llums. El negre a B és neutre. Observa els canals que superen 1.', 'Añade una capa de luces. El negro en B es neutro. Observa los canales que superan 1.'],
    Subtract: ['A − f × B', 'Carve into a scalar-like texture or remove a tint. Bright B values can produce negatives.', 'Rebaixa una textura de valors o elimina una dominant. Una B clara pot donar valors negatius.', 'Rebaja una textura de valores o elimina una dominante. Una B clara puede dar valores negativos.'],
    Multiply: ['T = A × B', 'Modulate a base color with fine dark detail. White in B is neutral, black gives 0 at f = 1.', 'Modula un color base amb detall fosc fi. El blanc a B és neutre i el negre dona 0 amb f = 1.', 'Modula un color base con detalle oscuro fino. El blanco en B es neutro y el negro da 0 con f = 1.'],
    Screen: ['T = 1 − (1 − A) × (1 − B)', 'Layer pale speckles with a softer rise toward white than Add. Black in B is neutral.', 'Superposa punts clars amb una pujada cap al blanc més gradual que amb Add. El negre a B és neutre.', 'Superpone motas claras con una subida hacia el blanco más gradual que con Add. El negro en B es neutro.'],
    Divide: ['T = A / B (T = A if B = 0)', 'Normalize against a reference. Compare B = black to a color just above black.', 'Normalitza respecte d’una referència. Compara una B negra amb una de molt fosca.', 'Normaliza respecto a una referencia. Compara una B negra con otra muy oscura.'],
    Difference: ['T = |A − B|', 'At f = 1 matching channels become black. Compare two patterns to reveal where they differ.', 'Amb f = 1 els canals iguals es tornen negres. Compara dos patrons per veure on difereixen.', 'Con f = 1, los canales iguales se vuelven negros. Compara dos patrones para ver dónde difieren.'],
    Exclusion: ['max(0, A + f × (B − 2 × A × B))', 'Similar to Difference for binary inputs at f = 1. Midgray B produces midgray there for every A.', 'Amb entrades binàries i f = 1 s’assembla a Difference. Una B de gris lineal 0.5 dona 0.5 per a qualsevol A amb aquest factor.', 'Con entradas binarias y f = 1 se parece a Difference. Una B de gris lineal 0.5 da 0.5 para cualquier A con ese factor.'],
  },
  Contrast: {
    Darken: ['T = min(A, B)', 'Keep the darker value per channel. Two colored layers can yield a third color.', 'Conserva el valor més fosc de cada canal. Dues capes de color poden donar un tercer color.', 'Conserva el valor más oscuro de cada canal. Dos capas de color pueden dar un tercer color.'],
    Lighten: ['T = max(A, B)', 'Keep the brighter value per channel, for example to combine two highlight maps.', 'Conserva el valor més clar de cada canal, per exemple per combinar dos mapes de llums.', 'Conserva el valor más claro de cada canal, por ejemplo para combinar dos mapas de luces.'],
    Overlay: ['T = 2AB if A < 0.5, else 1 − 2(1 − A)(1 − B)', 'A determines the branch per channel. B = 0.5 in linear RGB leaves A unchanged.', 'A determina la branca per canal. Amb B = 0.5 en RGB lineal es conserva A.', 'A determina la rama por canal. Con B = 0.5 en RGB lineal se conserva A.'],
    'Color Dodge': ['min(1, A / (1 − fB))', 'Concentrate highlights. If A = 0 the channel stays 0. A nonpositive denominator gives 1 for nonzero A.', 'Concentra les llums. Si A = 0 el canal es manté a 0. Un denominador no positiu dona 1 quan A és diferent de 0.', 'Concentra las luces. Si A = 0 el canal se mantiene en 0. Un denominador no positivo da 1 cuando A es distinto de 0.'],
    'Color Burn': ['clamp(1 − (1 − A) / (1 − f + fB), 0, 1)', 'Deepen shadows. A nonpositive denominator gives 0. The operation bounds the result internally.', 'Aprofundeix les ombres. Un denominador no positiu dona 0. L’operació ja acota el resultat internament.', 'Profundiza las sombras. Un denominador no positivo da 0. La operación ya acota el resultado internamente.'],
    'Soft Light': ['T = (1 − A)BA + A × Screen(A, B)', 'Apply subtle grain. The target simplifies to A² + 2AB(1 − A), so linear B = 0.5 is neutral.', 'Aplica gra subtil. L’objectiu se simplifica a A² + 2AB(1 − A), de manera que B lineal = 0.5 és neutre.', 'Aplica grano sutil. El objetivo se simplifica a A² + 2AB(1 − A), de modo que B lineal = 0.5 es neutro.'],
    'Linear Light': ['A + f × (2B − 1)', 'Treat B as signed detail around linear 0.5. Compare with Soft Light and inspect out-of-range channels.', 'Tracta B com un detall amb signe al voltant de 0.5 lineal. Compara’l amb Soft Light i observa els canals fora de rang.', 'Trata B como un detalle con signo alrededor de 0.5 lineal. Compáralo con Soft Light y observa los canales fuera de rango.'],
  },
  HSV: {
    Hue: ['T = RGB(Hᵦ, Sₐ, Vₐ)', 'Shift the hue while keeping A’s saturation and value in the target. A gray B leaves A unchanged.', 'Canvia el to tot mantenint saturació i valor d’A en el color objectiu. Una B grisa conserva A.', 'Cambia el tono manteniendo saturación y valor de A en el color objetivo. Una B gris conserva A.'],
    Saturation: ['RGB(Hₐ, Sₐ + f × (Sᵦ − Sₐ), Vₐ)', 'Desaturate with a gray B. An achromatic A stays achromatic.', 'Dessatura amb una B grisa. Una A acromàtica es manté acromàtica.', 'Desatura con una B gris. Una A acromática se mantiene acromática.'],
    Value: ['RGB(Hₐ, Sₐ, Vₐ + f × (Vᵦ − Vₐ))', 'Transfer HSV value, which is max(R, G, B). This differs from perceived brightness.', 'Transfereix el valor HSV, que és max(R, G, B). És diferent de la lluminositat percebuda.', 'Transfiere el valor HSV, que es max(R, G, B). Es distinto de la luminosidad percibida.'],
    Color: ['T = RGB(Hᵦ, Sᵦ, Vₐ)', 'Tint the base while preserving its HSV value in the target. A gray B leaves A unchanged.', 'Tenyeix la base mantenint-ne el valor HSV en el color objectiu. Una B grisa conserva A.', 'Tiñe la base manteniendo su valor HSV en el color objetivo. Una B gris conserva A.'],
  },
};

export const recipes = [
  {
    title: ['Paint wear', 'Pintura desgastada', 'Pintura desgastada'],
    mode: 'Mix', a: '#2c8294', b: '#ad6638', layer: 'Solid', mask: 'Hard Noise', factor: 1, threshold: 0.58,
    chain: 'Noise Texture: Fac → Math: Greater Than (0.58) → Math: Multiply (1) → Mix Color: Factor → Principled BSDF: Base Color',
    task: ['Raise the second Value in Greater Than from 0.58 to 0.68. Watch the orange patches shrink.',
      'Puja el segon Value de Greater Than de 0,58 a 0,68. Mira com es fan més petites les taques taronges.',
      'Sube el segundo Value de Greater Than de 0,58 a 0,68. Mira cómo se hacen más pequeñas las manchas naranjas.'],
  },
  {
    title: ['Wood grain', 'Veta de fusta', 'Veta de madera'],
    mode: 'Multiply', a: '#bc783e', b: '#ad896b', layer: 'Bands', mask: 'Constant', factor: 0.75, threshold: 0.5,
    chain: 'Wave Texture: Fac → Color Ramp (dark tint to white) → Mix Color: B · Multiply → Principled BSDF: Base Color',
    task: ['Set the first color of the Color Ramp feeding B to white. Watch the grain disappear.',
      'Posa en blanc el primer color del Color Ramp connectat a B. Mira com desapareix la veta.',
      'Pon en blanco el primer color del Color Ramp conectado a B. Mira cómo desaparece la veta.'],
  },
  {
    title: ['Bright flecks', 'Pigues clares', 'Motas claras'],
    mode: 'Add', a: '#e2b576', b: '#e99a50', layer: 'Solid', mask: 'Hard Noise', factor: 1.3, threshold: 0.66,
    chain: 'Noise Texture: Fac → Math: Greater Than → Math: Multiply (1.3) → Mix Color: Factor · Add',
    task: ['Pick a bright fleck and switch Clamp Result on and off. Open the color values to see what happens to the numbers above 1.',
      'Tria una taca clara i activa i desactiva Clamp Result. Obre els valors de color per veure què passa amb els nombres que passen d’1.',
      'Elige una mancha clara y activa y desactiva Clamp Result. Abre los valores de color para ver qué pasa con los números mayores de 1.'],
  },
  {
    title: ['Recolor a pattern', 'Recoloreja un patró', 'Recolorea un patrón'],
    mode: 'Color', a: '#728baa', b: '#bd6242', base: 'Bands', layer: 'Solid', mask: 'Constant', factor: 1, threshold: 0.5,
    chain: 'Wave Texture: Fac → Color Ramp → Mix Color: A · Color → Principled BSDF: Base Color',
    task: ['In Mix Color, change the mode from Color to Hue. Look at what changes in the pattern.',
      'Al node Mix Color, canvia el mode de Color a Hue. Fixa’t en què canvia del patró.',
      'En el nodo Mix Color, cambia el modo de Color a Hue. Fíjate en qué cambia del patrón.'],
  },
];
