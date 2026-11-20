import { displayByte } from './core.js';

export function paintMesh(canvas, sample, divisions, wireframe) {
  const ctx = canvas.getContext('2d');
  const { width, height } = canvas;
  ctx.fillStyle = '#181f25';
  ctx.fillRect(0, 0, width, height);
  const row = divisions + 1;
  const project = (x, y, z) => [width * (0.5 + (x - y) * 0.42),
    height * (0.52 + (x + y - 1) * 0.27 - z * 0.94)];
  const vertices = Array.from({ length: row ** 2 }, (_, index) => {
    const u = (index % row) / divisions, v = Math.floor(index / row) / divisions;
    const [dx, dy, dz] = sample.displacement(u, v);
    return { world: [u + dx, v + dy, dz], screen: project(u + dx, v + dy, dz) };
  });
  const floor = [project(0, 0, 0), project(1, 0, 0), project(1, 1, 0), project(0, 1, 0)];
  ctx.setLineDash([4, 3]);
  ctx.strokeStyle = '#899ca8';
  trace(ctx, floor);
  ctx.stroke();
  ctx.setLineDash([]);

  const triangles = [];
  for (let y = 0; y < divisions; y++) {
    for (let x = 0; x < divisions; x++) {
      const index = y * row + x;
      const a = vertices[index], b = vertices[index + 1];
      const c = vertices[index + row + 1], d = vertices[index + row];
      const rgb = sample.color((x + 0.5) / divisions, (y + 0.5) / divisions);
      triangles.push([a, b, c, rgb], [a, c, d, rgb]);
    }
  }
  const depth = ([a, b, c]) => [a, b, c].reduce((sum, point) => sum + point.world[0] + point.world[1], 0);
  triangles.sort((a, b) => depth(a) - depth(b));
  ctx.lineJoin = 'round';
  ctx.lineWidth = 0.7;
  for (const [a, b, c, rgb] of triangles) {
    const u = b.world.map((n, i) => n - a.world[i]), v = c.world.map((n, i) => n - a.world[i]);
    const nx = u[1] * v[2] - u[2] * v[1];
    const ny = u[2] * v[0] - u[0] * v[2];
    const nz = u[0] * v[1] - u[1] * v[0];
    const diffuse = Math.max(0, (nx * -0.42 + ny * -0.32 + nz * 0.85) / (Math.hypot(nx, ny, nz) || 1));
    const color = rgb.map(channel => displayByte(channel * (0.28 + 0.72 * diffuse)));
    ctx.fillStyle = 'rgb(' + color.join(',') + ')';
    ctx.strokeStyle = wireframe ? '#1a2634aa' : ctx.fillStyle;
    trace(ctx, [a.screen, b.screen, c.screen]);
    ctx.fill();
    ctx.stroke();
  }
}

function trace(ctx, [first, ...rest]) {
  ctx.beginPath();
  ctx.moveTo(...first);
  for (const point of rest) ctx.lineTo(...point);
  ctx.closePath();
}
