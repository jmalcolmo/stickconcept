# Backlog

Roadmap for the Stick & Ball sandbox. Ordered roughly by when it makes sense to
tackle it, not strictly by priority. Updated 2026-06-28.

## Now / done
- [x] Refactor the monolith into **core engine + mode system + browse menu**
      (the `feature/sandbox-core` work).
- [x] Free Play re-homed as a mode; Zone Rush added as the reference mode.
- [x] Vite + TypeScript toolchain.

## Next (good first additions)
- [ ] **Air-hockey-style mode** (the collaborator's idea): goal-mouth map, two
      team goals, score + reset on goal, powerup props that spawn over time.
      This is the first real test of the prop + zone + team plumbing.
- [ ] **AI opponent** for single-player versions of the above. A second
      `PlayerBoard` driven by a simple `InputSource` that chases the ball — slots
      into the existing input abstraction with no physics changes.
- [ ] **More maps**: a hoops-style map (raised target zone), a breakable-floor
      mode (floor as a grid of `Prop`/tiles a hard flick destroys), a circular
      arena (curved walls via many short segments, or add a circle-wall collider).
- [ ] **Per-mode HUD richness**: timers, team colours, goal flashes via
      `drawOverlay`. Possibly a small structured HUD model instead of plain lines.

## Backlogged — local multiplayer
*Decided 2026-06-28 to defer but design for.* The seams are already in place:
each board names an `inputId`; physics reads abstract `InputState` keyed by id.
- [ ] Add a second `InputSource` (gamepad, or a second keyboard mapping).
- [ ] Spawn a second `PlayerBoard` from map `player` spawns (engine already loops
      over them — only the first currently gets the keyboard).
- [ ] Split-screen or shared-screen camera considerations (currently one fixed
      camera; fine for shared-screen).
- [ ] Per-board "held ball" is already modelled (`heldBallId`), so two players
      catching/flicking independently should mostly work today.

## Later — online multiplayer (major)
The stated long-term goal. This is the big fork; design choices to make first:
- [ ] **Authoritative simulation**: move `physics.step` server-side; clients send
      `InputState`, receive world snapshots. The core is already a pure
      `step(world, inputs, dt)` function, which is the right shape for this.
- [ ] **Determinism / reconciliation**: client-side prediction + server
      reconciliation, or snapshot interpolation. Decide early — it shapes the
      netcode.
- [ ] **Transport**: a netcode library (e.g. Colyseus, geckos.io) + a Node
      server. The Vite/npm setup already supports adding these.
- [ ] **Lobbies / matchmaking / rooms.**
- [ ] Replace `Math.random()` in `ModeContext.rng()` with a seeded RNG so
      server and clients agree.

## Later — "true game engine" direction
- [ ] Decouple the renderer from Canvas2D (consider WebGL/PixiJS) once visual
      ambition outgrows shapes.
- [ ] Fixed-timestep simulation with interpolation for frame-rate independence.
- [ ] An asset pipeline (sprites, audio) — Vite supports this when needed.
- [ ] A scene/entity system if entity variety explodes (the current `World` is a
      deliberately simple precursor).

## Cross-cutting / polish
- [ ] Sound design and music.
- [ ] Art pass / theming (the renderer is all CSS-variable-friendly shapes today).
- [ ] Mode-specific tuning overrides layered on top of the global `CFG`.
- [ ] Persisted high scores / settings (localStorage first).
- [ ] Mobile / touch controls (currently mouse + keyboard only).
- [ ] Tests for the physics core (it's now a pure function — easy to unit test).

## Open design questions (carried from the concept docs)
- Whether catching should become more skill-based (match the ball's speed) later.
- What happens to a ball after it scores / hits a target (keep flying / stop /
  respawn) — currently mode-decided, which is the right home for it.
- Enemies, if the original "throw a ball to kill enemies" pitch is revived as a
  mode.
