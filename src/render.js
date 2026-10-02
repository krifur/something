// Canvas 2D renderer: floor pass, then depth-sorted walls, furniture and people.
import { toScreen } from './iso.js';
import { BUILDING, ENTRANCE, MAP_W, MAP_H } from './world.js';

const BACK_WALL = 46;
const FRONT_WALL = 10;

const COLORS = {
  sky: '#2b3a4a',
  grass: ['#5f9e3c', '#58953a'],
  street: ['#9b9b93', '#93938b'],
  floor: ['#dccca6', '#d3c39c'],
  gp: ['#a9c4de', '#a0bcd8'],
  wall: { top: '#efe3c8', left: '#c9b48e', right: '#b39d76' },
  gpWall: { top: '#e3eef8', left: '#9fb9d3', right: '#89a4bf' },
};

function diamond(ctx, x, y, w = 1, h = 1) {
  const a = toScreen(x, y), b = toScreen(x + w, y), c = toScreen(x + w, y + h), d = toScreen(x, y + h);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.lineTo(c.x, c.y);
  ctx.lineTo(d.x, d.y);
  ctx.closePath();
}

// A box standing on the floor: (x, y) world origin, w x h tiles, `height` pixels tall.
function prism(ctx, x, y, w, h, height, col) {
  const b = toScreen(x + w, y), c = toScreen(x + w, y + h), d = toScreen(x, y + h);
  ctx.fillStyle = col.left;
  ctx.beginPath();
  ctx.moveTo(d.x, d.y); ctx.lineTo(c.x, c.y); ctx.lineTo(c.x, c.y - height); ctx.lineTo(d.x, d.y - height);
  ctx.fill();
  ctx.fillStyle = col.right;
  ctx.beginPath();
  ctx.moveTo(c.x, c.y); ctx.lineTo(b.x, b.y); ctx.lineTo(b.x, b.y - height); ctx.lineTo(c.x, c.y - height);
  ctx.fill();
  ctx.save();
  ctx.translate(0, -height);
  diamond(ctx, x, y, w, h);
  ctx.fillStyle = col.top;
  ctx.fill();
  ctx.restore();
}

// A wall slab along a tile edge from world point p to q.
function wall(ctx, p, q, height, col, shade) {
  const a = toScreen(p.x, p.y), b = toScreen(q.x, q.y);
  ctx.fillStyle = shade ? col.left : col.right;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(b.x, b.y - height); ctx.lineTo(a.x, a.y - height);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = col.top;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y - height); ctx.lineTo(b.x, b.y - height);
  ctx.stroke();
}

// Walls for an inclusive rectangle; `gap` is a tile on the front (south) edge left open as a door.
function boxWalls(list, r, col, gap) {
  for (let x = r.x0; x <= r.x1; x++) {
    list.push({ d: x + r.y0 + 0.2, fn: (c) => wall(c, { x, y: r.y0 }, { x: x + 1, y: r.y0 }, BACK_WALL, col, false) });
    if (!gap || gap.x !== x) {
      list.push({ d: x + r.y1 + 1.6, fn: (c) => wall(c, { x, y: r.y1 + 1 }, { x: x + 1, y: r.y1 + 1 }, FRONT_WALL, col, false) });
    }
  }
  for (let y = r.y0; y <= r.y1; y++) {
    list.push({ d: r.x0 + y + 0.2, fn: (c) => wall(c, { x: r.x0, y }, { x: r.x0, y: y + 1 }, BACK_WALL, col, true) });
    list.push({ d: r.x1 + y + 1.6, fn: (c) => wall(c, { x: r.x1 + 1, y }, { x: r.x1 + 1, y: y + 1 }, FRONT_WALL, col, true) });
  }
}

function drawPerson(ctx, a) {
  const s = toScreen(a.x, a.y);
  const bob = a.moving ? Math.abs(Math.sin(a.walkPhase)) * 2 : 0;
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.ellipse(0, 0, 9, 4.5, 0, 0, Math.PI * 2); ctx.fill();

  let body = '#ffffff', legs = '#3b4a6b';
  if (a.kind === 'patient') { body = `hsl(${a.hue} 55% 55%)`; legs = '#4a3b2b'; }
  if (a.kind === 'receptionist') { body = '#e58fb5'; legs = '#5a3a55'; }

  const swing = a.moving ? Math.sin(a.walkPhase) * 3 : 0;
  ctx.fillStyle = legs;
  ctx.fillRect(-4 + swing / 2, -10, 3, 10);
  ctx.fillRect(1 - swing / 2, -10, 3, 10);
  ctx.fillStyle = body;
  ctx.beginPath(); ctx.roundRect(-6, -26 - bob, 12, 17, 4); ctx.fill();
  ctx.fillStyle = '#f1c9a5';
  ctx.beginPath(); ctx.arc(0, -31 - bob, 5.5, 0, Math.PI * 2); ctx.fill();
  if (a.kind === 'doctor') {
    ctx.strokeStyle = '#333'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(0, -20 - bob, 3, 0, Math.PI); ctx.stroke();
  }

  if (a.kind === 'patient' && a.patience < 40 && a.state !== 'leave') {
    const f = Math.max(0, a.patience / 40);
    ctx.fillStyle = '#222';
    ctx.fillRect(-10, -46, 20, 4);
    ctx.fillStyle = f > 0.5 ? '#e6c229' : '#e04a3a';
    ctx.fillRect(-10, -46, 20 * f, 4);
  }
  if (a.kind === 'patient' && a.state === 'leave') {
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = a.happy ? '#2e9e44' : '#d33';
    ctx.fillText(a.happy ? '♥' : '✖', 0, -42);
  }
  ctx.restore();
}

export function render(ctx, game, view, input) {
  const { world } = game;
  const { width, height, cam } = view;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = COLORS.sky;
  ctx.fillRect(0, 0, width * view.dpr, height * view.dpr);
  ctx.setTransform(cam.zoom * view.dpr, 0, 0, cam.zoom * view.dpr, cam.x * view.dpr, cam.y * view.dpr);

  // Floor pass.
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const t = world.tile(x, y);
      const k = (x + y) & 1;
      let col = COLORS.grass[k];
      if (t.inside) col = t.room ? COLORS[t.room.type][k] : COLORS.floor[k];
      else if (x === ENTRANCE.x && y > BUILDING.y1) col = COLORS.street[k];
      diamond(ctx, x, y);
      ctx.fillStyle = col;
      ctx.fill();
    }
  }
  for (const r of world.rooms) {
    diamond(ctx, r.door.x + 0.2, r.door.y + 0.6, 0.6, 0.4);
    ctx.fillStyle = 'rgba(80,60,40,0.35)';
    ctx.fill();
  }

  // Placement preview.
  if (input.preview) {
    const p = input.preview;
    ctx.fillStyle = p.valid ? 'rgba(80,220,120,0.45)' : 'rgba(230,70,60,0.45)';
    if (p.w) diamond(ctx, p.x0, p.y0, p.w, p.h); else diamond(ctx, p.x, p.y);
    ctx.fill();
    if (p.valid && p.door) {
      diamond(ctx, p.door.x, p.door.y);
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fill();
    }
  } else if (input.hover) {
    diamond(ctx, input.hover.x, input.hover.y);
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // Depth-sorted pass: walls, furniture, people.
  const list = [];
  boxWalls(list, BUILDING, COLORS.wall, ENTRANCE);
  for (const r of world.rooms) boxWalls(list, r, COLORS.gpWall, r.door);
  for (const r of world.rooms) {
    const d = r.desk;
    list.push({ d: d.x + d.y + 0.9, fn: (c) => {
      prism(c, d.x + 0.1, d.y + 0.3, 0.8, 0.45, 16, { top: '#8b5a2b', left: '#6e4520', right: '#5a3818' });
      prism(c, d.x + 0.55, d.y + 0.35, 0.25, 0.2, 26, { top: '#ddd', left: '#bbb', right: '#999' });
    } });
  }
  for (const o of world.objects) {
    list.push({ d: o.x + o.y + 0.9, fn: (c) => {
      prism(c, o.x + 0.05, o.y + 0.25, 0.9, 0.5, 18, { top: '#f4f0e6', left: '#3f78b5', right: '#2f5f92' });
      c.fillStyle = '#fff';
      c.font = 'bold 9px sans-serif';
      c.textAlign = 'center';
      const s = toScreen(o.x + 0.5, o.y + 0.75);
      c.fillText('INFO', s.x - 8, s.y - 4);
    } });
  }
  for (const a of game.agents) list.push({ d: a.x + a.y, fn: (c) => drawPerson(c, a) });

  list.sort((a, b) => a.d - b.d);
  for (const item of list) item.fn(ctx);
}
