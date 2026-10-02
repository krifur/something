// The hospital map: tiles, the building shell, rooms and placed objects.
import { floodTiles } from './path.js';

export const MAP_W = 32;
export const MAP_H = 32;
export const BUILDING = { x0: 3, y0: 3, x1: 28, y1: 24 };
export const ENTRANCE = { x: 15, y: 24 }; // inside tile at the front door
export const STREET = { x: 15, y: 25 };   // tile just outside the front door
export const SPAWN = { x: 15, y: 31 };    // where people appear / leave

export const ROOM_TYPES = {
  gp: { name: "GP's Office", minW: 3, minH: 3, baseCost: 1200, tileCost: 40, fee: 150 },
};
export const OBJECT_TYPES = {
  reception: { name: 'Reception Desk', cost: 400 },
};

const same = (a, b) => a.x === b.x && a.y === b.y;

export class World {
  constructor() {
    this.width = MAP_W;
    this.height = MAP_H;
    this.tiles = [];
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        const inside = x >= BUILDING.x0 && x <= BUILDING.x1 && y >= BUILDING.y0 && y <= BUILDING.y1;
        this.tiles.push({ x, y, inside, room: null, object: null });
      }
    }
    this.rooms = [];
    this.objects = [];
    this.nextId = 1;
    this.version = 0; // bumped whenever walkability changes, so agents re-plan
  }

  tile(x, y) {
    if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return null;
    return this.tiles[y * MAP_W + x];
  }

  // Can an agent walk from tile a to the orthogonally adjacent tile b?
  canStep(ax, ay, bx, by) {
    const a = this.tile(ax, ay), b = this.tile(bx, by);
    if (!a || !b) return false;
    if (b.object && b.object.blocks) return false;
    if (a.inside !== b.inside) {
      const ok = (same(a, ENTRANCE) && same(b, STREET)) || (same(b, ENTRANCE) && same(a, STREET));
      if (!ok) return false;
    }
    if (a.room !== b.room) {
      if (a.room && !(same(a, a.room.door) && same(b, a.room.outside))) return false;
      if (b.room && !(same(b, b.room.door) && same(a, b.room.outside))) return false;
    }
    return true;
  }

  // Free corridor tile: inside, not part of a room, no object, not reserved for a door/desk.
  isCorridor(x, y) {
    const t = this.tile(x, y);
    return !!t && t.inside && !t.room && !t.object && !this.isReserved(x, y);
  }

  isReserved(x, y) {
    if (x === ENTRANCE.x && y === ENTRANCE.y) return true;
    for (const r of this.rooms) if (r.outside.x === x && r.outside.y === y) return true;
    for (const o of this.objects) {
      if (o.staffSpot.x === x && o.staffSpot.y === y) return true;
      if (o.queueSpot.x === x && o.queueSpot.y === y) return true;
    }
    return false;
  }

  // ---- rooms ---------------------------------------------------------------

  roomPlan(type, ax, ay, bx, by) {
    const def = ROOM_TYPES[type];
    const x0 = Math.min(ax, bx), x1 = Math.max(ax, bx);
    const y0 = Math.min(ay, by), y1 = Math.max(ay, by);
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    const doorX = Math.floor((x0 + x1) / 2);
    const plan = {
      type, x0, y0, x1, y1, w, h,
      cost: def.baseCost + def.tileCost * w * h,
      door: { x: doorX, y: y1 },
      outside: { x: doorX, y: y1 + 1 },
      desk: { x: doorX, y: y0 + 1 },
      staffSpot: { x: doorX, y: y0 },
      patientSpot: { x: doorX + 1, y: y0 + 1 },
      valid: true,
      reason: '',
    };
    const fail = (reason) => { plan.valid = false; plan.reason = reason; return plan; };
    if (w < def.minW || h < def.minH) return fail(`Too small (min ${def.minW}x${def.minH})`);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const t = this.tile(x, y);
        if (!t || !t.inside) return fail('Must be inside the hospital');
        if (t.room || t.object || this.isReserved(x, y)) return fail('Space is occupied');
      }
    }
    if (!this.isCorridor(plan.outside.x, plan.outside.y)) return fail('Door must open onto a corridor');
    return plan;
  }

  buildRoom(plan) {
    const room = {
      id: this.nextId++, type: plan.type, name: ROOM_TYPES[plan.type].name,
      x0: plan.x0, y0: plan.y0, x1: plan.x1, y1: plan.y1,
      door: plan.door, outside: plan.outside, staffSpot: plan.staffSpot, patientSpot: plan.patientSpot,
      staff: null, occupant: null, queue: [],
    };
    for (let y = room.y0; y <= room.y1; y++) for (let x = room.x0; x <= room.x1; x++) this.tile(x, y).room = room;
    const desk = { id: this.nextId++, type: 'gpdesk', x: plan.desk.x, y: plan.desk.y, blocks: true, room };
    this.tile(desk.x, desk.y).object = desk;
    room.desk = desk;
    this.rooms.push(room);
    if (!this.allReachable()) {
      this.rooms.pop();
      this.tile(desk.x, desk.y).object = null;
      for (let y = room.y0; y <= room.y1; y++) for (let x = room.x0; x <= room.x1; x++) this.tile(x, y).room = null;
      return null;
    }
    this.version++;
    return room;
  }

  // ---- objects -------------------------------------------------------------

  objectPlan(type, x, y) {
    const plan = { type, x, y, cost: OBJECT_TYPES[type].cost, valid: true, reason: '' };
    const fail = (reason) => { plan.valid = false; plan.reason = reason; return plan; };
    if (!this.isCorridor(x, y)) return fail('Needs an empty corridor tile');
    if (!this.isCorridor(x, y - 1)) return fail('Needs room behind the desk for staff');
    if (!this.isCorridor(x, y + 1)) return fail('Needs room in front of the desk');
    return plan;
  }

  placeObject(plan) {
    const obj = {
      id: this.nextId++, type: plan.type, x: plan.x, y: plan.y, blocks: true,
      staffSpot: { x: plan.x, y: plan.y - 1 }, queueSpot: { x: plan.x, y: plan.y + 1 },
      staff: null, queue: [],
    };
    this.tile(obj.x, obj.y).object = obj;
    this.objects.push(obj);
    if (!this.allReachable()) {
      this.objects.pop();
      this.tile(obj.x, obj.y).object = null;
      return null;
    }
    this.version++;
    return obj;
  }

  // Every door and service spot must stay reachable from the front entrance.
  allReachable() {
    const reach = new Set(floodTiles(this, ENTRANCE.x, ENTRANCE.y, () => true, MAP_W * MAP_H)
      .map((t) => t.y * MAP_W + t.x));
    const ok = (p) => reach.has(p.y * MAP_W + p.x);
    return this.rooms.every((r) => ok(r.outside) && ok(r.staffSpot) && ok(r.patientSpot))
      && this.objects.every((o) => ok(o.staffSpot) && ok(o.queueSpot));
  }
}
