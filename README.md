# something — a Theme Hospital–style game in the browser

A small, dependency-free JavaScript starter for a *Theme Hospital*-like management game
that runs in any modern browser (Canvas 2D + ES modules, no build step).

## Run it

ES modules don't load from `file://`, so serve the folder with any static server:

```sh
python3 -m http.server 8000      # or: npx serve .
# then open http://localhost:8000
```

## How to play

1. **Reception Desk**: click a corridor tile to place it ($400).
2. **GP's Office**: drag out a rectangle (min 3x3). The door is in the middle of the front wall.
3. **Hire Receptionist** and **Hire Doctor**. Staff walk in and go to a free desk or office.
4. Patients arrive, queue at reception, then queue at a GP's office, pay $150 and leave happy.
   If they wait too long they storm out and your reputation drops.
5. Staff get paid every month. Reach **$25,000 and reputation 70** to win.

Controls: drag or WASD/arrows to scroll, mouse wheel to zoom, Space to pause, Esc/right-click to cancel a tool.
`window.game` is exposed so you can inspect the simulation from the dev console.

## Code layout

| File | What it does |
| --- | --- |
| `src/iso.js` | Isometric projection: tile ↔ screen coordinates (2:1 diamonds, 64x32). |
| `src/world.js` | The map, building shell, rooms, objects, wall/door walkability (`canStep`), build validation. |
| `src/path.js` | A* pathfinding and a BFS flood used for queues and reachability checks. |
| `src/game.js` | Simulation: money, calendar, wages, patient and staff state machines. |
| `src/render.js` | Draws floors, then depth-sorts walls, furniture and people (painter's algorithm). |
| `src/main.js` | Canvas setup, camera, mouse/keyboard tools, HUD, fixed 60 Hz game loop. |

## How to grow it into a real Theme Hospital remake

There are three realistic routes:

### 1. Run CorsixTH in the browser (closest to the original)
[CorsixTH](https://github.com/CorsixTH/CorsixTH) is the open-source re-implementation of
Theme Hospital's engine (C++ + Lua + SDL2). It needs the **original game data files**, which
you can buy cheaply (e.g. on GOG / EA app). You could compile it to WebAssembly with
[Emscripten](https://emscripten.org/) (SDL2 and Lua both build with it), let the user pick
their Theme Hospital folder with an `<input type="file" webkitdirectory>`, and mount those files into
Emscripten's virtual filesystem. That's the most faithful result, but it's a C++ porting job,
not a JavaScript one.

### 2. Write your own JS engine that reads the original data files
This is the approach this repo is set up for. You'd replace the placeholder shapes with
real sprites decoded from the user's own copy of the game:

- `*.TAB` + `*.DAT`: sprite tables and pixel data (many files are **RNC-compressed**, so
  you need an RNC ProPack decompressor).
- `*.PAL`: 256-colour palettes (6-bit RGB, multiply by 4).
- `LEVEL.*` / `*.SAM`: level and configuration data. `SOUND-0.DAT` holds the sounds.
- CorsixTH's source (`CorsixTH/Src/th_gfx*.cpp`, `rnc.cpp`) is the best documentation of
  these formats.

Never ship the original assets in the repo or on a public site. They're copyrighted by EA.
Load them from the player's own install at runtime.

### 3. Make a spiritual successor with your own art
Keep the mechanics, replace the art and sound with your own (or CC-licensed) assets.
This is the only option you can publish freely. Swap the shape drawing in `render.js` for
sprite sheets drawn with `ctx.drawImage`.

### Next features to add (roughly in order)
- More rooms: Diagnosis (Ward, General Diagnosis) → Treatment (Pharmacy, Psychiatry, Inflation…)
  with a diagnose → treat pipeline per illness.
- Nurses, handymen (litter, broken machines), janitors; staff tiredness and a Staff Room.
- Furniture: benches (patients sit while queueing), plants, radiators, drinks machines.
- Thirst / warmth / bladder needs, vomit, rats, epidemics, emergencies.
- Room editing: sell/move rooms, choose door position, windows.
- Save/load (`JSON.stringify` the world into `localStorage`), multiple levels with goals.
- Performance: if the map gets big, switch to [PixiJS](https://pixijs.com/) (WebGL) and
  cache the static floor/walls in an offscreen canvas.
