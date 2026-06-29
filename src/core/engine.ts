import type { Config } from "../config";
import type { ArenaMap, EventType, EventOf } from "./types";
import type { GameMode, HudModel, ModeContext } from "../modes/types";
import { World } from "./world";
import { EventBus } from "./events";
import { KeyboardMouseInput, type InputState } from "./input";
import { Renderer } from "./renderer";
import { step } from "./physics";

const PRIMARY_INPUT = "kbm";

export interface EngineCallbacks {
  /** Called when the active mode reports it's over. Receives the final HUD. */
  onModeOver?: (mode: GameMode, hud: HudModel | null) => void;
  /** Called when the HUD model changes, so the DOM HUD can re-render. */
  onHud?: (hud: HudModel | null) => void;
}

/**
 * Owns the game loop and the mode lifecycle. Knows how to run the core sim and
 * hand off to whatever mode is loaded — it has no game-specific logic itself.
 */
export class Engine {
  readonly world: World;
  private readonly bus = new EventBus();
  private readonly input = new KeyboardMouseInput();
  private readonly renderer: Renderer;
  private readonly inputs = new Map<string, InputState>();

  private mode: GameMode | null = null;
  private ctx: ModeContext | null = null;
  private subscriptions: Array<() => void> = [];
  private hud: HudModel | null = null;
  private modeStart = 0;
  private running = false;
  private over = false;
  private last = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    private cfg: Config,
    private callbacks: EngineCallbacks = {},
  ) {
    const c = canvas.getContext("2d");
    if (!c) throw new Error("2D canvas context unavailable");
    this.world = new World(cfg);
    this.renderer = new Renderer(c, cfg);
    this.input.attach(canvas);
    requestAnimationFrame(this.frame);
  }

  /** Load a mode: build its map, spawn boards, run setup, start simulating. */
  loadMode(mode: GameMode): void {
    this.unloadMode();

    const map: ArenaMap = typeof mode.map === "function" ? mode.map() : mode.map;
    this.canvas.width = map.width;
    this.canvas.height = map.height;
    this.world.loadMap(map);

    // Spawn player boards from the map's player spawns (first gets the keyboard).
    const playerSpawns = map.spawns.filter((s) => s.type === "player");
    if (playerSpawns.length === 0) {
      // No explicit spawn — drop one board at the centre so every map is playable.
      this.world.spawnBoard(map.width * 0.35, map.height * 0.5, PRIMARY_INPUT);
    } else {
      playerSpawns.forEach((s, i) => {
        this.world.spawnBoard(s.x, s.y, i === 0 ? PRIMARY_INPUT : `p${i}`, {
          angle: s.angle,
          team: s.team,
        });
      });
    }

    this.mode = mode;
    this.modeStart = performance.now();
    this.over = false;
    this.hud = null;
    this.ctx = this.makeContext(map);

    mode.setup(this.ctx);
    this.emitHud();

    this.input.setActive(true);
    this.input.requestLock();
    this.running = true;
    this.last = performance.now();

    // Paint the opening scene immediately so the arena is on-screen this tick,
    // instead of flashing an empty canvas until the first animation frame.
    this.paint();
  }

  unloadMode(): void {
    if (this.mode && this.ctx && this.mode.teardown) this.mode.teardown(this.ctx);
    for (const unsub of this.subscriptions) unsub();
    this.subscriptions = [];
    this.bus.clear();
    this.mode = null;
    this.ctx = null;
    this.running = false;
    this.input.setActive(false);
  }

  /** Pause/resume simulation without tearing the mode down (e.g. menu overlay). */
  setRunning(on: boolean): void {
    if (!this.mode) return;
    this.running = on;
    this.input.setActive(on);
    if (on) {
      this.last = performance.now();
      this.input.requestLock();
    }
  }

  private makeContext(map: ArenaMap): ModeContext {
    const time = { elapsed: 0, now: performance.now() };
    const ctx: ModeContext = {
      world: this.world,
      map,
      cfg: this.cfg,
      on: <T extends EventType>(type: T, handler: (e: EventOf<T>) => void) => {
        this.subscriptions.push(this.bus.on(type, handler));
      },
      spawnBall: (x, y, opts) => this.world.spawnBall(x, y, opts),
      spawnProp: (opts) => this.world.spawnProp(opts),
      removeBall: (id) => this.world.removeBall(id),
      removeProp: (id) => this.world.removeProp(id),
      board: (i = 0) => this.world.boards[i],
      time,
      rng: () => Math.random(),
      state: {},
      setHud: (model) => {
        this.hud = model;
        this.emitHud();
      },
    };
    return ctx;
  }

  private emitHud(): void {
    this.callbacks.onHud?.(this.hud);
  }

  private frame = (now: number): void => {
    requestAnimationFrame(this.frame);
    if (!this.running || !this.mode || !this.ctx) return;

    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt > 0.033) dt = 0.033; // clamp big hitches (tab switch) for stable physics

    // Refresh mode timing.
    (this.ctx.time as { elapsed: number; now: number }).elapsed = (now - this.modeStart) / 1000;
    (this.ctx.time as { elapsed: number; now: number }).now = now;

    // 1. Sample input -> abstract state keyed by input id.
    this.inputs.set(PRIMARY_INPUT, this.input.sample());

    // 2. Core physics (emits events the mode is subscribed to).
    step(this.world, this.inputs, dt, this.bus, this.cfg);

    // 3. Mode logic.
    this.mode.update?.(this.ctx, dt);

    // 4. Render: core scene, then optional mode overlay.
    this.paint();

    // 5. Win/lose check (fires once).
    if (!this.over && this.mode.isOver?.(this.ctx)) {
      this.over = true;
      this.running = false;
      this.input.setActive(false);
      this.callbacks.onModeOver?.(this.mode, this.hud);
    }
  };

  /** Draw the current world: core scene, then the active mode's overlay. */
  private paint(): void {
    if (!this.mode || !this.ctx) return;
    const c = this.canvas.getContext("2d")!;
    this.renderer.render(this.world);
    this.mode.drawOverlay?.(this.ctx, c);
  }
}
