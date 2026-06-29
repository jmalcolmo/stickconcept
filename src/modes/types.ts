import type { ArenaMap, Ball, PlayerBoard, Prop, EventType, EventOf } from "../core/types";
import type { World } from "../core/world";
import type { Config } from "../config";

/** Lines of text shown in the in-game HUD (top-centre scoreboard). */
export interface HudModel {
  title?: string;
  lines: string[];
}

/**
 * Everything a mode is allowed to touch. The engine builds one of these per
 * loaded mode and passes it to every hook. Modes go through this surface
 * instead of reaching into the engine — that's what keeps them decoupled.
 */
export interface ModeContext {
  readonly world: World;
  readonly map: ArenaMap;
  readonly cfg: Config;

  /** Subscribe to a core event. Auto-unsubscribed when the mode unloads. */
  on<T extends EventType>(type: T, handler: (e: EventOf<T>) => void): void;

  // Entity helpers (thin pass-throughs to World, listed here so a mode author
  // sees the whole API in one place).
  spawnBall(x: number, y: number, opts?: { radius?: number }): Ball;
  spawnProp(opts: {
    x: number;
    y: number;
    radius: number;
    kind: string;
    solid?: boolean;
    color?: string;
    data?: Record<string, unknown>;
  }): Prop;
  removeBall(id: number): void;
  removeProp(id: number): void;

  /** The i-th player board (default 0). Most single-player modes use board 0. */
  board(i?: number): PlayerBoard | undefined;

  /** Seconds since this mode loaded, plus a high-res `now`. */
  readonly time: { elapsed: number; now: number };

  /** Deterministic-friendly RNG hook (currently Math.random; swappable later). */
  rng(): number;

  /**
   * Free-form scratch storage for the mode's own state (score, timers, etc.).
   * Typed loosely so a mode can cast it once to its own interface, e.g.
   * `const s = ctx.state as MyState`. `setup` is responsible for initialising it.
   */
  readonly state: Record<string, any>;

  /** Push the scoreboard the player sees. Call it in setup and/or update. */
  setHud(model: HudModel): void;
}

/**
 * A game mode = a declarative MAP + code RULES. This is the "hybrid authoring"
 * contract. The smallest possible mode just provides `map` + `setup`; Free Play
 * is barely more than that. Air-hockey-style modes add `update` (powerup spawns,
 * a clock) and event handlers (goal scored -> score + reset).
 */
export interface GameMode {
  id: string;
  name: string;
  description: string;
  /** Optional labels for the browse menu (e.g. ["solo", "practice"]). */
  tags?: string[];

  /** The arena. Either a fixed map or a factory (use a factory for randomness). */
  map: ArenaMap | (() => ArenaMap);

  /** Build the scene: spawn balls/props, init score, subscribe to events. */
  setup(ctx: ModeContext): void;

  /** Per-frame logic: timers, powerup spawns, AI. Optional. */
  update?(ctx: ModeContext, dt: number): void;

  /** Extra canvas decoration drawn on top of the core render. Optional. */
  drawOverlay?(ctx: ModeContext, c: CanvasRenderingContext2D): void;

  /** Return true to end the round (engine shows the post-game screen). Optional. */
  isOver?(ctx: ModeContext): boolean;

  /** Cleanup (rarely needed; subscriptions are auto-removed). Optional. */
  teardown?(ctx: ModeContext): void;
}
