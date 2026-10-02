// Isometric projection helpers.
// A tile (x, y) covers [x, x+1) x [y, y+1) in world space; its top corner sits at toScreen(x, y).

export const TILE_W = 64;
export const TILE_H = 32;

export function toScreen(x, y) {
  return { x: (x - y) * TILE_W / 2, y: (x + y) * TILE_H / 2 };
}

export function toWorld(sx, sy) {
  const a = sx / (TILE_W / 2);
  const b = sy / (TILE_H / 2);
  return { x: (a + b) / 2, y: (b - a) / 2 };
}

export function toTile(sx, sy) {
  const w = toWorld(sx, sy);
  return { x: Math.floor(w.x), y: Math.floor(w.y) };
}
