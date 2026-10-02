// Entry point: canvas setup, camera, mouse/keyboard tools, HUD and the fixed-step game loop.
import { Game, STAFF_TYPES } from './game.js';
import { render } from './render.js';
import { toScreen, toTile } from './iso.js';
import { MAP_W, MAP_H } from './world.js';

const STEP = 1 / 60;

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const game = new Game();

const view = { width: 0, height: 0, dpr: 1, cam: { x: 0, y: 0, zoom: 1 } };
const input = { tool: null, hover: null, dragStart: null, preview: null, panning: null, keys: new Set() };
let speed = 1;

function resize() {
  view.dpr = window.devicePixelRatio || 1;
  view.width = window.innerWidth;
  view.height = window.innerHeight;
  canvas.width = Math.floor(view.width * view.dpr);
  canvas.height = Math.floor(view.height * view.dpr);
  canvas.style.width = `${view.width}px`;
  canvas.style.height = `${view.height}px`;
}

function centerCamera() {
  const c = toScreen(MAP_W / 2, MAP_H / 2);
  view.cam.zoom = Math.min(1.2, Math.max(0.5, view.width / 1400));
  view.cam.x = view.width / 2 - c.x * view.cam.zoom;
  view.cam.y = view.height / 2 - c.y * view.cam.zoom;
}

function screenToTile(sx, sy) {
  const { cam } = view;
  return toTile((sx - cam.x) / cam.zoom, (sy - cam.y) / cam.zoom);
}

// ---- tools -----------------------------------------------------------------

function setTool(tool) {
  input.tool = tool;
  input.dragStart = null;
  input.preview = null;
  document.querySelectorAll('[data-tool]').forEach((b) => b.classList.toggle('active', b.dataset.tool === tool));
  canvas.style.cursor = tool ? 'crosshair' : 'grab';
}

function updatePreview() {
  const h = input.hover;
  if (!h || !input.tool) { input.preview = null; return; }
  if (input.tool === 'gp') {
    const a = input.dragStart ?? h;
    input.preview = game.world.roomPlan('gp', a.x, a.y, h.x, h.y);
  } else if (input.tool === 'reception') {
    input.preview = game.world.objectPlan('reception', h.x, h.y);
  }
}

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

canvas.addEventListener('mousedown', (e) => {
  const t = screenToTile(e.clientX, e.clientY);
  if (e.button === 2 && input.tool) { setTool(null); return; }
  if (e.button === 0 && input.tool === 'gp') { input.dragStart = t; updatePreview(); return; }
  if (e.button === 0 && input.tool === 'reception') {
    updatePreview();
    if (game.placeObject(input.preview) && !e.shiftKey) setTool(null);
    return;
  }
  input.panning = { x: e.clientX, y: e.clientY, cx: view.cam.x, cy: view.cam.y };
  canvas.style.cursor = 'grabbing';
});

window.addEventListener('mousemove', (e) => {
  if (input.panning) {
    view.cam.x = input.panning.cx + e.clientX - input.panning.x;
    view.cam.y = input.panning.cy + e.clientY - input.panning.y;
  }
  input.hover = screenToTile(e.clientX, e.clientY);
  updatePreview();
  showTooltip(e.clientX, e.clientY);
});

window.addEventListener('mouseup', () => {
  if (input.panning) {
    input.panning = null;
    canvas.style.cursor = input.tool ? 'crosshair' : 'grab';
  }
  if (input.tool === 'gp' && input.dragStart) {
    updatePreview();
    const built = game.buildRoom(input.preview);
    input.dragStart = null;
    if (built) setTool(null);
  }
});

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const { cam } = view;
  const old = cam.zoom;
  cam.zoom = Math.min(2.5, Math.max(0.4, cam.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1)));
  cam.x = e.clientX - (e.clientX - cam.x) * (cam.zoom / old);
  cam.y = e.clientY - (e.clientY - cam.y) * (cam.zoom / old);
}, { passive: false });

window.addEventListener('keydown', (e) => {
  input.keys.add(e.key.toLowerCase());
  if (e.key === 'Escape') setTool(null);
  if (e.key === ' ') { e.preventDefault(); setSpeed(speed === 0 ? 1 : 0); }
});
window.addEventListener('keyup', (e) => input.keys.delete(e.key.toLowerCase()));

// ---- HUD -------------------------------------------------------------------

const $ = (id) => document.getElementById(id);

document.querySelectorAll('[data-tool]').forEach((b) => {
  b.addEventListener('click', () => setTool(input.tool === b.dataset.tool ? null : b.dataset.tool));
});
document.querySelectorAll('[data-hire]').forEach((b) => {
  const def = STAFF_TYPES[b.dataset.hire];
  b.title = `Hire for $${def.hireCost}, salary $${def.salary}/month`;
  b.addEventListener('click', () => game.hire(b.dataset.hire));
});
function setSpeed(s) {
  speed = s;
  document.querySelectorAll('[data-speed]').forEach((b) => b.classList.toggle('active', Number(b.dataset.speed) === s));
}
document.querySelectorAll('[data-speed]').forEach((b) => b.addEventListener('click', () => setSpeed(Number(b.dataset.speed))));

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
let lastLog = null;
function updateHud() {
  const d = game.date;
  $('money').textContent = `$${game.money.toLocaleString()}`;
  $('money').classList.toggle('neg', game.money < 0);
  $('rep').textContent = game.reputation;
  $('date').textContent = `${d.day} ${MONTHS[d.month - 1]} ${d.year}`;
  $('treated').textContent = game.treated;
  $('patients').textContent = game.agents.filter((a) => a.kind === 'patient').length;
  if (game.log[0] !== lastLog) {
    lastLog = game.log[0];
    $('log').innerHTML = game.log.map((l) => `<div>${l.msg}</div>`).join('');
  }
  const p = input.preview;
  $('hint').textContent = p
    ? (p.valid ? `Cost: $${p.cost}` : p.reason)
    : input.tool ? '' : 'Drag to scroll · wheel to zoom · Space to pause';
}

function showTooltip(sx, sy) {
  const tip = $('tooltip');
  const t = screenToTile(sx, sy);
  const people = game.agents.filter((a) => a.tx === t.x && a.ty === t.y);
  const tile = game.world.tile(t.x, t.y);
  let html = '';
  for (const a of people) {
    if (a.kind === 'patient') html += `<b>${a.name}</b> – ${a.illness}<br>${a.state}, patience ${Math.ceil(Math.max(0, a.patience))}s<br>`;
    else html += `<b>${a.name}</b> – ${STAFF_TYPES[a.kind].name} (${a.state})<br>`;
  }
  if (!html && tile?.room) {
    const r = tile.room;
    html = `<b>${r.name}</b><br>${r.staff ? `Staff: ${r.staff.name}` : 'No doctor!'}<br>Queue: ${r.queue.length}`;
  }
  if (!html && tile?.object) {
    const o = tile.object;
    if (o.type === 'reception') html = `<b>Reception</b><br>${o.staff ? `Staff: ${o.staff.name}` : 'No receptionist!'}<br>Queue: ${o.queue.length}`;
  }
  tip.style.display = html && !input.tool ? 'block' : 'none';
  tip.innerHTML = html;
  tip.style.left = `${sx + 14}px`;
  tip.style.top = `${sy + 14}px`;
}

// ---- loop ------------------------------------------------------------------

let last = performance.now();
let acc = 0;
function frame(now) {
  const dt = Math.min(0.25, (now - last) / 1000);
  last = now;

  const pan = 600 * dt;
  if (input.keys.has('arrowleft') || input.keys.has('a')) view.cam.x += pan;
  if (input.keys.has('arrowright') || input.keys.has('d')) view.cam.x -= pan;
  if (input.keys.has('arrowup') || input.keys.has('w')) view.cam.y += pan;
  if (input.keys.has('arrowdown') || input.keys.has('s')) view.cam.y -= pan;

  acc += dt * speed;
  while (acc >= STEP) {
    game.update(STEP);
    acc -= STEP;
  }
  render(ctx, game, view, input);
  updateHud();
  requestAnimationFrame(frame);
}

window.addEventListener('resize', resize);
resize();
centerCamera();
setTool(null);
setSpeed(1);
requestAnimationFrame(frame);

window.game = game; // handy for poking at the simulation from the dev console
