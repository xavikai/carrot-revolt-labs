// Keep each lab card in one place while grouping the collection by learning area.
export function organizeAreas(root = document) {
  const destinations = {
    lod: 'game-engines-grid',
    lightmaps: 'game-engines-grid',
    export: 'game-engines-grid',
    grading: 'video-grid',
    'runway-live': 'video-grid',
  };
  for (const [slug, gridId] of Object.entries(destinations)) {
    const link = root.querySelector(`.lab-card a[href="./labs/${slug}/"]`);
    const card = link?.closest('.lab-card');
    const grid = root.getElementById(gridId);
    if (card && grid) grid.append(card);
  }
}
