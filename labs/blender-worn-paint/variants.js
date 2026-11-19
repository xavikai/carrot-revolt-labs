export const variants = {
  noise: {
    name: ['Noise Texture', 'Noise Texture', 'Noise Texture'],
    steps: [
      ['Use Noise Texture Fac as the mask source. Its values become the three synchronized signals for Base Color, Roughness and Height.',
        'Fes servir Fac de Noise Texture com a font de la màscara. Els seus valors generen tres senyals sincronitzats per a Base Color, Roughness i Height.',
        'Usa Fac de Noise Texture como fuente de la máscara. Sus valores generan tres señales sincronizadas para Base Color, Roughness y Height.'],
    ],
    task: ['Switch between the sources and watch where the primer appears.', 'Canvia de font i observa on apareix la imprimació.', 'Cambia de fuente y observa dónde aparece la imprimación.'],
  },
  image: {
    name: ['Image Texture', 'Image Texture', 'Image Texture'],
    steps: [
      ['Connect UV to Image Texture Vector. Load the included grayscale wear mask, set it to Non-Color and connect Color to the Smooth Step Map Range Value.',
        'Connecta UV a Vector d’Image Texture. Carrega la màscara en grisos inclosa, posa-la en Non-Color i connecta Color a Value del Map Range amb Smooth Step.',
        'Conecta UV a Vector de Image Texture. Carga la máscara de grises incluida, ponla en Non-Color y conecta Color a Value del Map Range con Smooth Step.'],
      ['The bright scratches reveal the primer and affect roughness and relief in the same locations. Move the UVs in Blender to reposition the scratches.',
        'Les ratlles clares revelen la imprimació i afecten la rugositat i el relleu als mateixos llocs. Mou les UV a Blender per recol·locar les ratlles.',
        'Las rayas claras revelan la imprimación y afectan a la rugosidad y el relieve en los mismos lugares. Mueve las UV en Blender para recolocar las rayas.'],
    ],
    task: ['Compare the mask and height views. For a color image used as paint, connect Color to Mix Color A and use the sRGB color space.',
      'Compara les vistes de màscara i alçada. Si vols fer servir una imatge de color com a pintura, connecta Color a A de Mix Color i fes servir l’espai sRGB.',
      'Compara las vistas de máscara y altura. Si quieres usar una imagen de color como pintura, conecta Color a A de Mix Color y usa el espacio sRGB.'],
  },
  voronoi: {
    name: ['Voronoi Texture', 'Voronoi Texture', 'Voronoi Texture'],
    steps: [
      ['Connect Generated to Voronoi Texture Vector. Set it to 2D, F1 and Euclidean. Wire Distance into the Smooth Step Map Range Value.',
        'Connecta Generated a Vector de Voronoi Texture. Tria 2D, F1 i Euclidean. Porta Distance a Value del Map Range amb Smooth Step.',
        'Conecta Generated a Vector de Voronoi Texture. Elige 2D, F1 y Euclidean. Lleva Distance a Value del Map Range con Smooth Step.'],
      ['Distance is low near a cell’s seed and grows away from it. The primer tends to show in the gaps between these centers.',
        'Distance és baixa a prop del centre de cada cel·la i creix en allunyar-te’n. La imprimació tendeix a aparèixer als espais entre centres.',
        'Distance es baja cerca del centro de cada celda y crece al alejarte. La imprimación tiende a aparecer en los espacios entre centros.'],
    ],
    task: ['Adjust Scale and the threshold. Scale changes the cell size, and the threshold controls how far the paint extends around each seed.',
      'Ajusta Scale i el llindar. Scale canvia la mida de les cel·les i el llindar controla fins on arriba la pintura al voltant de cada centre.',
      'Ajusta Scale y el umbral. Scale cambia el tamaño de las celdas y el umbral controla hasta dónde llega la pintura alrededor de cada centro.'],
  },
  ramp: {
    name: ['Color Ramp', 'Color Ramp', 'Color Ramp'],
    steps: [
      ['Add a separate Noise Texture with Scale 18. Connect Generated to Vector and Fac to Color Ramp Fac. Use linear stops at 0.22 (#143F49) and 0.78 (#5EACAA).',
        'Afegeix un Noise Texture independent amb Scale 18. Connecta Generated a Vector i Fac a Fac de Color Ramp. Fes servir parades lineals a 0.22 (#143F49) i 0.78 (#5EACAA).',
        'Añade un Noise Texture independiente con Scale 18. Conecta Generated a Vector y Fac a Fac de Color Ramp. Usa paradas lineales en 0.22 (#143F49) y 0.78 (#5EACAA).'],
      ['Connect Color Ramp Color to Mix Color A. The ramp varies the paint’s pigment. The original mask still decides where to reveal the primer.',
        'Connecta Color de Color Ramp a A de Mix Color. La rampa varia el pigment de la pintura. La màscara original continua decidint on es veu la imprimació.',
        'Conecta Color de Color Ramp a A de Mix Color. La rampa varía el pigmento de la pintura. La máscara original sigue decidiendo dónde se ve la imprimación.'],
    ],
    task: ['Compare Color and Mask with the Noise Texture example. The color changes inside the painted areas while their boundaries stay in place.',
      'Compara Color i Màscara amb l’exemple de Noise Texture. El color varia dins les zones pintades i els contorns es mantenen al mateix lloc.',
      'Compara Color y Máscara con el ejemplo de Noise Texture. El color cambia dentro de las zonas pintadas y los contornos se mantienen en el mismo lugar.'],
  },
};
