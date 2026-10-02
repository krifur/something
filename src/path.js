// A* pathfinding over the tile grid (4-neighbour). Walls and doors are enforced by world.canStep.

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export function findPath(world, sx, sy, tx, ty) {
  if (sx === tx && sy === ty) return [];
  if (!world.tile(tx, ty)) return null;

  const w = world.width;
  const key = (x, y) => y * w + x;
  const h = (x, y) => Math.abs(x - tx) + Math.abs(y - ty);

  const open = [{ x: sx, y: sy, f: h(sx, sy) }];
  const g = new Map([[key(sx, sy), 0]]);
  const came = new Map();
  const closed = new Set();

  while (open.length) {
    let best = 0;
    for (let i = 1; i < open.length; i++) if (open[i].f < open[best].f) best = i;
    const cur = open.splice(best, 1)[0];
    const ck = key(cur.x, cur.y);
    if (closed.has(ck)) continue;
    closed.add(ck);

    if (cur.x === tx && cur.y === ty) {
      const path = [];
      let k = ck;
      while (k !== key(sx, sy)) {
        path.push({ x: k % w, y: Math.floor(k / w) });
        k = came.get(k);
      }
      return path.reverse();
    }

    for (const [dx, dy] of DIRS) {
      const nx = cur.x + dx, ny = cur.y + dy;
      if (!world.canStep(cur.x, cur.y, nx, ny)) continue;
      const nk = key(nx, ny);
      if (closed.has(nk)) continue;
      const ng = g.get(ck) + 1;
      if (ng < (g.get(nk) ?? Infinity)) {
        g.set(nk, ng);
        came.set(nk, ck);
        open.push({ x: nx, y: ny, f: ng + h(nx, ny) });
      }
    }
  }
  return null;
}

// Breadth-first list of tiles reachable from (sx, sy) that satisfy `accept`, nearest first.
export function floodTiles(world, sx, sy, accept, limit = 64) {
  const out = [];
  const seen = new Set([sy * world.width + sx]);
  const queue = [{ x: sx, y: sy }];
  while (queue.length && out.length < limit) {
    const cur = queue.shift();
    if (accept(cur.x, cur.y)) out.push(cur);
    for (const [dx, dy] of DIRS) {
      const nx = cur.x + dx, ny = cur.y + dy;
      const k = ny * world.width + nx;
      if (seen.has(k) || !world.canStep(cur.x, cur.y, nx, ny)) continue;
      seen.add(k);
      queue.push({ x: nx, y: ny });
    }
  }
  return out;
}
