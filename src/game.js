// Simulation: money, calendar, staff and patient behaviour.
import { World, ENTRANCE, SPAWN, ROOM_TYPES } from './world.js';
import { findPath, floodTiles } from './path.js';

export const DAY_SECONDS = 2;
export const DAYS_PER_MONTH = 30;
export const STAFF_TYPES = {
  doctor: { name: 'Doctor', hireCost: 500, salary: 900 },
  receptionist: { name: 'Receptionist', hireCost: 200, salary: 400 },
};
const PATIENT_PATIENCE = 75;
const NAMES = ['Ada', 'Bob', 'Cyd', 'Dot', 'Eli', 'Fay', 'Gus', 'Hal', 'Ivy', 'Jo', 'Kit', 'Lou', 'Max', 'Ned', 'Ora', 'Pip'];
const ILLNESSES = ['Bloaty Head', 'Slack Tongue', 'Invisibility', 'Hairyitis', 'Broken Wind', 'King Complex', 'Spare Ribs'];

export class Agent {
  constructor(id, kind, x, y) {
    this.id = id;
    this.kind = kind;
    this.x = x + 0.5;
    this.y = y + 0.5;
    this.path = [];
    this.target = null;
    this.speed = kind === 'patient' ? 2 : 2.6;
    this.state = 'enter';
    this.timer = 0;
    this.walkPhase = Math.random() * 10;
  }

  get tx() { return Math.floor(this.x); }
  get ty() { return Math.floor(this.y); }
  get moving() { return this.path.length > 0; }
  get arrived() { return !this.moving && !!this.target && this.tx === this.target.x && this.ty === this.target.y; }

  goTo(world, x, y) {
    if (this.target && this.target.x === x && this.target.y === y && this.pathVersion === world.version) return true;
    const path = findPath(world, this.tx, this.ty, x, y);
    if (!path) return false;
    this.path = path;
    this.target = { x, y };
    this.pathVersion = world.version;
    return true;
  }

  update(dt) {
    if (!this.path.length) return;
    this.walkPhase += dt * 10;
    let budget = this.speed * dt;
    while (budget > 0 && this.path.length) {
      const n = this.path[0];
      const dx = n.x + 0.5 - this.x, dy = n.y + 0.5 - this.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= budget) {
        this.x = n.x + 0.5;
        this.y = n.y + 0.5;
        budget -= dist;
        this.path.shift();
      } else {
        this.x += (dx / dist) * budget;
        this.y += (dy / dist) * budget;
        budget = 0;
      }
    }
  }
}

export class Game {
  constructor() {
    this.world = new World();
    this.agents = [];
    this.money = 15000;
    this.reputation = 50;
    this.time = 0;
    this.day = 0;
    this.treated = 0;
    this.spawnTimer = 3;
    this.log = [];
    this.won = false;
    this.say('Welcome, Hospital Director! Build a Reception Desk and a GP\'s Office, then hire staff.');
  }

  say(msg) {
    this.log.unshift({ msg, t: this.time });
    if (this.log.length > 6) this.log.pop();
  }

  get date() {
    const month = Math.floor(this.day / DAYS_PER_MONTH);
    return { day: (this.day % DAYS_PER_MONTH) + 1, month: (month % 12) + 1, year: 1997 + Math.floor(month / 12) };
  }

  spend(amount, what) {
    if (this.money < amount) { this.say(`Not enough money for ${what}.`); return false; }
    this.money -= amount;
    return true;
  }

  // ---- player actions ------------------------------------------------------

  buildRoom(plan) {
    if (!plan.valid) { this.say(plan.reason); return false; }
    if (!this.spend(plan.cost, ROOM_TYPES[plan.type].name)) return false;
    const room = this.world.buildRoom(plan);
    if (!room) { this.money += plan.cost; this.say('That would block a path.'); return false; }
    this.say(`Built a ${room.name} for $${plan.cost}.`);
    return true;
  }

  placeObject(plan) {
    if (!plan.valid) { this.say(plan.reason); return false; }
    if (!this.spend(plan.cost, 'that')) return false;
    const obj = this.world.placeObject(plan);
    if (!obj) { this.money += plan.cost; this.say('That would block a path.'); return false; }
    this.say(`Placed a Reception Desk for $${plan.cost}.`);
    return true;
  }

  hire(kind) {
    const def = STAFF_TYPES[kind];
    if (!this.spend(def.hireCost, `a ${def.name}`)) return;
    const a = new Agent(this.world.nextId++, kind, SPAWN.x, SPAWN.y);
    a.name = `${def.name === 'Doctor' ? 'Dr. ' : ''}${NAMES[Math.floor(Math.random() * NAMES.length)]}`;
    a.salary = def.salary;
    a.state = 'idle';
    this.agents.push(a);
    this.say(`Hired ${a.name} (${def.name}).`);
  }

  // ---- simulation ----------------------------------------------------------

  update(dt) {
    this.time += dt;
    const newDay = Math.floor(this.time / DAY_SECONDS);
    while (this.day < newDay) {
      this.day++;
      if (this.day % DAYS_PER_MONTH === 0) this.payday();
    }

    this.spawnTimer -= dt;
    const patients = this.agents.filter((a) => a.kind === 'patient').length;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = Math.max(2.5, 11 - this.reputation / 10) * (0.7 + Math.random() * 0.6);
      if (patients < 40) this.spawnPatient();
    }

    for (const a of this.agents) {
      if (a.kind === 'patient') this.updatePatient(a, dt);
      else this.updateStaff(a);
      a.update(dt);
    }
    this.agents = this.agents.filter((a) => !a.gone);

    if (!this.won && this.money >= 25000 && this.reputation >= 70) {
      this.won = true;
      this.say('You won! $25,000 in the bank and a reputation of 70+. Keep playing if you like.');
    }
  }

  payday() {
    const wages = this.agents.filter((a) => a.salary).reduce((s, a) => s + a.salary, 0);
    this.money -= wages;
    if (wages) this.say(`Paid $${wages} in staff wages.`);
  }

  spawnPatient() {
    const p = new Agent(this.world.nextId++, 'patient', SPAWN.x, SPAWN.y);
    p.name = NAMES[Math.floor(Math.random() * NAMES.length)];
    p.illness = ILLNESSES[Math.floor(Math.random() * ILLNESSES.length)];
    p.patience = PATIENT_PATIENCE;
    p.hue = Math.floor(Math.random() * 360);
    this.agents.push(p);
  }

  // Tiles where the i-th person in a queue stands, starting at `base` and spreading out.
  queueSpot(base, i) {
    if (i === 0) return base;
    const w = this.world;
    const spots = floodTiles(w, base.x, base.y, (x, y) => !(x === base.x && y === base.y) && w.isCorridor(x, y), i + 1);
    return spots[i - 1] ?? spots[spots.length - 1] ?? base;
  }

  isStaffed(station) {
    return !!station.staff && station.staff.state === 'working';
  }

  leaveQueue(p) {
    if (p.station) {
      const q = p.station.queue;
      const i = q.indexOf(p);
      if (i >= 0) q.splice(i, 1);
      p.station = null;
    }
  }

  sendHome(p, happy) {
    this.leaveQueue(p);
    p.state = 'leave';
    p.happy = happy;
    p.timer = 0;
  }

  updatePatient(p, dt) {
    const w = this.world;
    const waiting = p.state === 'reception' || p.state === 'gp';
    if (waiting) {
      p.patience -= dt;
      if (p.patience <= 0) {
        this.reputation = Math.max(0, this.reputation - 2);
        this.say(`${p.name} got fed up waiting and stormed out!`);
        this.sendHome(p, false);
      }
    }

    switch (p.state) {
      case 'enter':
        p.goTo(w, ENTRANCE.x, ENTRANCE.y);
        if (p.arrived) p.state = 'reception';
        break;

      case 'reception':
      case 'gp': {
        const wantDesk = p.state === 'reception';
        if (p.station && !this.isStaffed(p.station)) this.leaveQueue(p);
        if (!p.station) {
          const options = wantDesk ? w.objects.filter((o) => o.type === 'reception') : w.rooms.filter((r) => r.type === 'gp');
          const staffed = options.filter((s) => this.isStaffed(s));
          staffed.sort((a, b) => a.queue.length - b.queue.length);
          if (staffed.length) {
            p.station = staffed[0];
            p.station.queue.push(p);
            p.timer = 0;
          } else {
            // Nobody to see them: mill about near the entrance.
            if (!p.loiter || !w.isCorridor(p.loiter.x, p.loiter.y)) {
              const spots = floodTiles(w, ENTRANCE.x, ENTRANCE.y, (x, y) => w.isCorridor(x, y), 30);
              p.loiter = spots[Math.floor(Math.random() * spots.length)] ?? ENTRANCE;
            }
            p.goTo(w, p.loiter.x, p.loiter.y);
            break;
          }
        }
        const s = p.station;
        const i = s.queue.indexOf(p);
        const base = wantDesk ? s.queueSpot : s.outside;
        const spot = this.queueSpot(base, i);
        p.goTo(w, spot.x, spot.y);
        if (i !== 0 || !p.arrived) break;
        if (wantDesk) {
          p.timer += dt;
          if (p.timer >= 2) {
            this.leaveQueue(p);
            p.state = 'gp';
            p.timer = 0;
          }
        } else if (!s.occupant) {
          this.leaveQueue(p);
          s.occupant = p;
          p.room = s;
          p.state = 'consult';
          p.timer = 0;
        }
        break;
      }

      case 'consult': {
        const r = p.room;
        p.goTo(w, r.patientSpot.x, r.patientSpot.y);
        if (!p.arrived) break;
        p.timer += dt;
        if (p.timer >= 4) {
          const fee = ROOM_TYPES[r.type].fee;
          this.money += fee;
          this.treated++;
          this.reputation = Math.min(100, this.reputation + 1);
          this.say(`${p.name} was cured of ${p.illness}. +$${fee}`);
          r.occupant = null;
          p.room = null;
          this.sendHome(p, true);
        }
        break;
      }

      case 'leave':
        if (!p.goTo(w, SPAWN.x, SPAWN.y)) p.gone = true;
        if (p.arrived) p.gone = true;
        break;
    }
  }

  updateStaff(s) {
    const w = this.world;
    switch (s.state) {
      case 'idle': {
        const stations = s.kind === 'doctor'
          ? w.rooms.filter((r) => r.type === 'gp' && !r.staff)
          : w.objects.filter((o) => o.type === 'reception' && !o.staff);
        if (stations.length) {
          s.station = stations[0];
          s.station.staff = s;
          s.state = 'toStation';
        } else {
          s.goTo(w, ENTRANCE.x, ENTRANCE.y);
        }
        break;
      }
      case 'toStation':
        s.goTo(w, s.station.staffSpot.x, s.station.staffSpot.y);
        if (s.arrived) s.state = 'working';
        break;
      case 'working':
        break;
    }
  }
}
