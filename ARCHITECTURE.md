# Architecture — Stick & Ball Sandbox

This project is a **sandbox**: one shared physics "core" (the stick + ball feel)
that hosts many small **game modes**. Free Play, a future air-hockey-style mode,
a hoops mode, a breakable-floor mode — all run on the same character physics and
differ only in their **map**, **objects**, and **rules**.

The guiding rule:

> **The core never knows what a goal, a powerup, or a score is.** It simulates
> boards, balls, walls, props, and zones, and it *emits events*. Modes listen to
> those events and decide what they mean.

That one boundary is what lets you (and a collaborator) build wildly different
games without ever editing — or risking — the flick that makes the game feel good.

---

## The two halves

### 1. The core (invariant) — `src/core/`, `src/config.ts`

The "stick and ball." Identical in every mode.

| File | Responsibility |
| --- | --- |
| `config.ts` | The feel knobs (`CFG`). Movement speed, spin sensitivity, flick power cap, grip, restitution. Shared by all modes. |
| `core/types.ts` | Every shared shape: `ArenaMap`, `Zone`, `WallSegment`, `Ball`, `PlayerBoard`, `Prop`, and the `GameEvent` union. The contract between core and modes. |
| `core/physics.ts` | The simulation. Board move + 1:1 mouse spin + the catch + the **flick** + the dead-board absorb — ported verbatim, then generalized to N balls, arbitrary wall segments, props, and zone triggers. Emits events; contains **zero** game rules. |
| `core/world.ts` | The live scene: the loaded map plus `boards[]`, `balls[]`, `props[]`. Spawns/removes entities and hands out ids. |
| `core/events.ts` | A tiny typed `EventBus`. The decoupling seam. |
| `core/input.ts` | `InputSource` abstraction. Physics reads abstract `InputState`, never raw DOM. One source today (`kbm`); a second is *added*, not retrofitted, for local multiplayer. |
| `core/renderer.ts` | Draws any `World` generically — no hardcoded arena. |
| `core/engine.ts` | The game loop + the mode lifecycle (`loadMode`, `unloadMode`, pause). Ties input → physics → mode → render together. |

### 2. The modes (pluggable) — `src/modes/`, `src/maps/`

The games. Each is a **declarative map + code rules** (the "hybrid" model).

| File | Responsibility |
| --- | --- |
| `modes/types.ts` | `GameMode` + `ModeContext` — the API a mode author codes against. |
| `modes/registry.ts` | The browsable list. Add a mode here and it appears in the menu. |
| `modes/freePlay.ts` | The original prototype, re-homed. A map + one ball, no rules. |
| `modes/zoneRush.ts` | The **reference mode** — copy this. Exercises every seam (custom map, events, state, per-frame update, HUD, win condition) in ~70 lines. |
| `maps/rectangle.ts` | The classic closed arena, now expressed as data. |
| `ui/menu.ts`, `ui/hud.ts` | The browse/select shell and the scoreboard. |

---

## How a frame runs (`engine.ts`)

```
1. input.sample()            → InputState per input id
2. physics.step(world, …)    → mutates world, EMITS events
                               (mode's event handlers fire here, synchronously)
3. mode.update?(ctx, dt)     → timers, powerup spawns, AI
4. renderer.render(world)     → core scene
   mode.drawOverlay?(…)      → optional extra decoration
5. mode.isOver?(ctx)         → if true, show the post-game screen
```

The mode subscribed to events in `setup()`, so by the time `update()` runs, all
"a ball entered a goal", "a ball hit a powerup" reactions have already happened.

---

## The data model, briefly

- **`ArenaMap`** — declarative arena: `width/height`, `bounds` (the rectangle the
  board's pivot is confined to), `walls` (thick line segments the ball bounces
  off — the rectangle arena is just 4 of them), `zones` (trigger regions), and
  `spawns`. `bounds` and `walls` are deliberately separate so a goal-mouth map can
  contain the board while letting the ball pass through a gap.
- **`Zone`** — a `rect` or `circle` trigger with `tags`. The core reports when a
  ball enters/exits; a mode decides that `tags: ["goal"]` means "score".
- **`Prop`** — a generic circular object (powerup, target, bumper). `solid` props
  bounce balls; non-solid props are pass-through triggers. The core reports
  overlaps via `ballHitProp` / `boardHitProp`; the mode decides what they do.

---

## Adding things

### A new map
Write a function returning an `ArenaMap` in `src/maps/`. See `rectangle.ts`. For
an air-hockey field: same rectangle, but split the left and right walls to leave a
goal mouth, and add two `goal` zones tagged by team.

### A new game mode (the air-hockey example)
1. Create `src/modes/airHockey.ts` exporting a `GameMode`.
2. `map`: a factory returning your goal-mouth map.
3. `setup(ctx)`: `ctx.spawnBall(...)`, init `ctx.state` (scores), and
   `ctx.on("ballEnteredZone", e => { if (e.tags.includes("goal")) … })`.
4. `update(ctx, dt)`: tick a clock, occasionally `ctx.spawnProp({ kind:"powerup", … })`.
5. Handle pickups with `ctx.on("boardHitProp", …)` and `ctx.removeProp(id)`.
6. `setHud(...)` to show the score; `isOver(...)` for the final whistle.
7. Add it to `registry.ts`.

No core file is touched. That's the whole point.

---

## What is intentionally **not** here yet

Single-player only. No networking, no AI opponents, no enemies, no sound, no
asset pipeline. The core is structured so these are *additive* — see
[`BACKLOG.md`](BACKLOG.md) for the planned path, including local then online
multiplayer and the eventual "true engine" direction.

## Toolchain

Vite + TypeScript (strict). `npm run dev` for the HMR dev server, `npm run build`
for a static production bundle, `npm run typecheck` for a type-only pass. The
original single-file prototype lives in git history before the `feature/sandbox-core`
refactor.
