// =============================================================
//  CORE CONTRACTS
//
//  Every shape the engine, maps, and modes agree on lives here. Think of this
//  file as the API surface between the invariant "core" (physics, rendering,
//  input) and the pluggable "modes" (rules, scoring, objects).
// =============================================================

export interface Vec2 {
  x: number;
  y: number;
}

// ---------------------------------------------------------------
//  MAP — a declarative description of an arena. This is the "data"
//  half of the hybrid authoring model: a mode points at one of these.
// ---------------------------------------------------------------

/** A thick line segment the ball bounces off of. The rectangle arena is 4 of these. */
export interface WallSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  thickness: number;
  /** Optional per-wall bounciness; falls back to CFG.WALL_RESTITUTION. */
  restitution?: number;
}

export type ZoneShape =
  | { kind: "rect"; x: number; y: number; w: number; h: number }
  | { kind: "circle"; x: number; y: number; r: number };

/**
 * A trigger region. The core detects when a ball ENTERS or EXITS a zone and
 * emits events; it attaches no meaning. A mode decides that a zone tagged
 * "goal" means "score a point" — the core never knows what a goal is.
 */
export interface Zone {
  id: string;
  shape: ZoneShape;
  /** Semantic labels the mode interprets, e.g. ["goal", "team:blue"]. */
  tags: string[];
  /** Optional fill colour for rendering. */
  color?: string;
}

/** A named place to put a player board or a ball when the map loads. */
export interface Spawn {
  type: "player" | "ball";
  x: number;
  y: number;
  angle?: number;
  team?: string;
}

export interface ArenaMap {
  id: string;
  name: string;
  width: number;
  height: number;
  /**
   * Rectangle the player board's PIVOT is confined to. Kept separate from
   * `walls` on purpose: a goal-mouth map wants the board contained while the
   * ball passes through a gap where there is no wall.
   */
  bounds: { left: number; top: number; right: number; bottom: number };
  walls: WallSegment[];
  zones: Zone[];
  spawns: Spawn[];
  /** Canvas background colour. */
  background?: string;
}

// ---------------------------------------------------------------
//  ENTITIES — the live, simulated objects in a World.
// ---------------------------------------------------------------

/** The "stick": a flat board that pivots at its center. The player character. */
export interface PlayerBoard {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number; // facing/orientation in radians
  omega: number; // angular velocity (rad/sec) — drives flick power
  team?: string;
  /** The ball this board currently holds, or null. */
  heldBallId: number | null;
  /** Which input source drives this board (e.g. "kbm"). Enables local MP later. */
  inputId: string;
  /** Set each frame by physics from this board's input — was catch/flick held? */
  action: boolean;
}

export interface Ball {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  /** Board id holding this ball, or null if it's a free physics object. */
  heldBy: number | null;
  // --- attachment, valid only while held ---
  s: number; // offset along the board axis where it was grabbed, in [-L/2, L/2]
  side: 1 | -1; // which face it's stuck to
  // --- zone tracking, used to emit enter/exit events ---
  insideZones: Set<string>;
}

/**
 * A generic, mode-owned circular object: powerups, targets, bumpers, posts.
 * The core only knows how to (a) bounce balls off `solid` props and (b) report
 * overlaps via events. What a prop *means* is entirely the mode's business.
 */
export interface Prop {
  id: number;
  x: number;
  y: number;
  radius: number;
  /** Mode-defined label, e.g. "powerup" | "target" | "bumper". */
  kind: string;
  /** true = balls physically bounce off it; false = pass-through trigger. */
  solid: boolean;
  color?: string;
  /** Arbitrary mode payload (e.g. which powerup this is). */
  data?: Record<string, unknown>;
}

// ---------------------------------------------------------------
//  EVENTS — the seam. The core emits; modes listen. Modes never reach
//  into physics; they react to these.
// ---------------------------------------------------------------

export type GameEvent =
  | { type: "ballCaught"; ballId: number; boardId: number }
  | { type: "ballFlicked"; ballId: number; boardId: number; speed: number }
  | {
      type: "ballHitWall";
      ballId: number;
      wallIndex: number;
      /** Contact point on the wall (where a hit effect should appear). */
      x: number;
      y: number;
      /** Closing speed into the wall, px/sec — how hard the ball struck. */
      speed: number;
    }
  | { type: "ballEnteredZone"; ballId: number; zoneId: string; tags: string[] }
  | { type: "ballExitedZone"; ballId: number; zoneId: string; tags: string[] }
  | { type: "ballHitProp"; ballId: number; propId: number; kind: string }
  | { type: "boardHitProp"; boardId: number; propId: number; kind: string };

export type EventType = GameEvent["type"];

/** Narrow a GameEvent union member by its `type` tag. */
export type EventOf<T extends EventType> = Extract<GameEvent, { type: T }>;
