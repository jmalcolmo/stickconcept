import type { Ball, PlayerBoard, Prop, Zone } from "./types";
import type { Config } from "../config";
import type { InputState } from "./input";
import type { EventBus } from "./events";
import type { World } from "./world";
import { clamp, damp, closestPointOnSegment, hypot } from "./math";

/**
 * Advance the whole simulation one step. This is the INVARIANT CORE — the exact
 * board move / spin / flick / dead-board-absorb feel from the original prototype,
 * generalized to:
 *   - any number of boards (each driven by its own input source),
 *   - any number of balls,
 *   - arbitrary wall SEGMENTS (the rectangle arena is just 4 of them),
 *   - mode-owned props (bumpers + trigger pickups),
 *   - zone enter/exit detection.
 *
 * It mutates `world` and emits events on `bus`. It contains NO game rules — no
 * score, no goals, no win conditions. Those live in modes, which listen to the
 * events this emits.
 */
export function step(
  world: World,
  inputs: Map<string, InputState>,
  dt: number,
  bus: EventBus,
  cfg: Config,
): void {
  const { map } = world;

  // --- 1. Boards: movement + spin (independent systems, exactly as before) ---
  for (const board of world.boards) {
    const input = inputs.get(board.inputId) ?? { moveX: 0, moveY: 0, spinDX: 0, action: false };
    updateBoardMotion(board, input, dt, cfg, map.bounds);
    board.action = input.action; // stash for the ball/board interaction below
  }

  // --- 2. Balls ---
  for (const ball of world.balls) {
    if (ball.heldBy !== null) {
      simulateHeldBall(ball, world, dt, bus, cfg);
    } else {
      simulateFreeBall(ball, world, dt, bus, cfg);
    }
  }

  // --- 3. Boards vs props (e.g. driving over a powerup pickup) ---
  for (const board of world.boards) {
    for (const prop of world.props) {
      if (boardOverlapsProp(board, prop, cfg)) {
        bus.emit({ type: "boardHitProp", boardId: board.id, propId: prop.id, kind: prop.kind });
      }
    }
  }
}

// ---------------------------------------------------------------
//  Board motion
// ---------------------------------------------------------------
function updateBoardMotion(
  board: PlayerBoard,
  input: InputState,
  dt: number,
  cfg: Config,
  bounds: { left: number; top: number; right: number; bottom: number },
): void {
  // Linear movement (fully independent of rotation).
  let mx = input.moveX;
  let my = input.moveY;
  if (mx !== 0 || my !== 0) {
    const len = hypot(mx, my);
    mx /= len;
    my /= len;
  }
  board.vx = mx * cfg.PLAYER_SPEED;
  board.vy = my * cfg.PLAYER_SPEED;
  board.x += board.vx * dt;
  board.y += board.vy * dt;
  // Keep the pivot inside the map bounds (board tips may overhang).
  board.x = clamp(board.x, bounds.left + cfg.PLAYER_BOUND_RADIUS, bounds.right - cfg.PLAYER_BOUND_RADIUS);
  board.y = clamp(board.y, bounds.top + cfg.PLAYER_BOUND_RADIUS, bounds.bottom - cfg.PLAYER_BOUND_RADIUS);

  // Spin: driven DIRECTLY by horizontal mouse motion, no inertia. omega is the
  // real angular velocity for THIS frame — that's what the flick uses.
  let deltaAngle = input.spinDX * cfg.ROTATION_SENSITIVITY;
  const maxDelta = cfg.MAX_ANGULAR_VELOCITY * dt;
  deltaAngle = clamp(deltaAngle, -maxDelta, maxDelta);
  board.angle += deltaAngle;
  board.omega = dt > 0 ? deltaAngle / dt : 0;
}

// ---------------------------------------------------------------
//  Held ball: rides locked to the board; releasing the button flicks it.
// ---------------------------------------------------------------
function simulateHeldBall(ball: Ball, world: World, _dt: number, bus: EventBus, cfg: Config): void {
  const board = world.getBoard(ball.heldBy!);
  if (!board) {
    // Holder vanished — drop the ball as a free object.
    ball.heldBy = null;
    return;
  }

  const ax = Math.cos(board.angle);
  const ay = Math.sin(board.angle);
  const nx = -ay;
  const ny = ax;
  const faceOffset = cfg.BOARD_THICKNESS / 2 + ball.radius;

  // The held ball is LOCKED to the board at a fixed point and rides along.
  const h = ball.side * faceOffset;
  const rx = ball.s * ax + h * nx;
  const ry = ball.s * ay + h * ny;
  ball.x = board.x + rx;
  ball.y = board.y + ry;

  if (board.action) return; // still holding — keep riding

  // RELEASE = flick. Launch with the contact point's real velocity at this
  // instant: rotation about the pivot (omega * arm), plus the player's running
  // velocity. Release mid-spin = hard flick; release while still = gentle drop.
  const rotVx = -board.omega * ry;
  const rotVy = board.omega * rx;
  let vX = rotVx;
  let vY = rotVy;
  if (cfg.ADD_PLAYER_VELOCITY_ON_THROW) {
    vX += board.vx;
    vY += board.vy;
  }
  ball.vx = vX;
  ball.vy = vY;

  // Nudge out along the launch direction so it doesn't instantly re-hit the board.
  const sp = hypot(vX, vY);
  if (sp > 0) {
    ball.x += (vX / sp) * (ball.radius + cfg.RELEASE_NUDGE);
    ball.y += (vY / sp) * (ball.radius + cfg.RELEASE_NUDGE);
  }

  ball.heldBy = null;
  board.heldBallId = null;
  bus.emit({ type: "ballFlicked", ballId: ball.id, boardId: board.id, speed: sp });
}

// ---------------------------------------------------------------
//  Free ball: integrate, bounce off walls + props, interact with boards, zones.
// ---------------------------------------------------------------
function simulateFreeBall(ball: Ball, world: World, dt: number, bus: EventBus, cfg: Config): void {
  // Coast with light friction.
  ball.vx *= damp(cfg.BALL_FRICTION, dt);
  ball.vy *= damp(cfg.BALL_FRICTION, dt);
  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;

  collideBallWithWalls(ball, world, bus, cfg);
  collideBallWithProps(ball, world, bus, cfg);

  // Board interactions: catch (if that board holds the button) or absorb/smack.
  for (const board of world.boards) {
    interactBoardAndBall(board, ball, bus, cfg);
    if (ball.heldBy !== null) return; // got caught; stop processing it as free
  }

  updateZoneMembership(ball, world.map.zones, bus);
}

function collideBallWithWalls(ball: Ball, world: World, bus: EventBus, cfg: Config): void {
  const walls = world.map.walls;
  for (let i = 0; i < walls.length; i++) {
    const w = walls[i]!;
    const cp = closestPointOnSegment(ball.x, ball.y, w.x1, w.y1, w.x2, w.y2);
    let dx = ball.x - cp.x;
    let dy = ball.y - cp.y;
    let dist = hypot(dx, dy);
    const touch = w.thickness / 2 + ball.radius;
    if (dist > touch) continue;

    // Degenerate: ball centre exactly on the segment — push along segment normal.
    if (dist === 0) {
      const sx = w.x2 - w.x1;
      const sy = w.y2 - w.y1;
      const sl = hypot(sx, sy) || 1;
      dx = -sy / sl;
      dy = sx / sl;
      dist = 0.0001;
    }

    const nx = dx / dist;
    const ny = dy / dist;
    const vn = ball.vx * nx + ball.vy * ny;
    if (vn < 0) {
      const e = w.restitution ?? cfg.WALL_RESTITUTION;
      ball.vx -= (1 + e) * vn * nx;
      ball.vy -= (1 + e) * vn * ny;
      // `-vn` is the closing speed normal to the wall: how hard it struck.
      bus.emit({ type: "ballHitWall", ballId: ball.id, wallIndex: i, x: cp.x, y: cp.y, speed: -vn });
    }
    // Depenetrate.
    ball.x = cp.x + nx * touch;
    ball.y = cp.y + ny * touch;
  }
}

function collideBallWithProps(ball: Ball, world: World, bus: EventBus, cfg: Config): void {
  // Iterate over a snapshot so a handler removing a prop can't break iteration
  // (handlers run synchronously via emit below).
  for (const prop of [...world.props]) {
    const dx = ball.x - prop.x;
    const dy = ball.y - prop.y;
    const touch = prop.radius + ball.radius;
    const dist = hypot(dx, dy);
    if (dist > touch) continue;

    bus.emit({ type: "ballHitProp", ballId: ball.id, propId: prop.id, kind: prop.kind });

    if (prop.solid) {
      const nx = dist > 0 ? dx / dist : 1;
      const ny = dist > 0 ? dy / dist : 0;
      const vn = ball.vx * nx + ball.vy * ny;
      if (vn < 0) {
        const e = cfg.PROP_RESTITUTION;
        ball.vx -= (1 + e) * vn * nx;
        ball.vy -= (1 + e) * vn * ny;
      }
      ball.x = prop.x + nx * (touch + 0.5);
      ball.y = prop.y + ny * (touch + 0.5);
    }
  }
}

/**
 * The catch + dead-board-absorb mechanic — ported verbatim from the prototype,
 * now per (board, ball) pair. The board is a capsule: segment + thickness.
 */
function interactBoardAndBall(board: PlayerBoard, ball: Ball, bus: EventBus, cfg: Config): void {
  const ax = Math.cos(board.angle);
  const ay = Math.sin(board.angle);
  const nx = -ay;
  const ny = ax;
  const halfLen = cfg.BOARD_LENGTH / 2;

  const Ax = board.x - halfLen * ax;
  const Ay = board.y - halfLen * ay;
  const Bx = board.x + halfLen * ax;
  const By = board.y + halfLen * ay;
  const cp = closestPointOnSegment(ball.x, ball.y, Ax, Ay, Bx, By);
  const dx = ball.x - cp.x;
  const dy = ball.y - cp.y;
  const dist = hypot(dx, dy);
  const touchDist = cfg.BOARD_THICKNESS / 2 + ball.radius;
  if (dist > touchDist) return;

  const cnx = dist > 0 ? dx / dist : nx;
  const cny = dist > 0 ? dy / dist : ny;

  if (board.action && board.heldBallId === null) {
    // CATCH: stick the ball to the face it touched. Record where along the board
    // (s) and which side, so it can ride and eventually flick off.
    const relx = ball.x - board.x;
    const rely = ball.y - board.y;
    ball.s = clamp(relx * ax + rely * ay, -halfLen, halfLen);
    ball.side = relx * nx + rely * ny >= 0 ? 1 : -1;
    ball.heldBy = board.id;
    board.heldBallId = ball.id;
    bus.emit({ type: "ballCaught", ballId: ball.id, boardId: board.id });
    return;
  }

  // ABSORB / SMACK: kill the ball's velocity RELATIVE to the board's moving
  // surface. A still board → the ball drops dead (the flick is the only real way
  // to put speed on the ball). A spinning/moving board drags the ball along.
  const rcx = cp.x - board.x;
  const rcy = cp.y - board.y;
  const pvx = board.vx - board.omega * rcy; // board surface velocity at the contact point
  const pvy = board.vy + board.omega * rcx;
  const rvx = ball.vx - pvx;
  const rvy = ball.vy - pvy;
  const vn = rvx * cnx + rvy * cny;
  const tnx = -cny;
  const tny = cnx;
  const vt = rvx * tnx + rvy * tny;
  const newVn = vn < 0 ? -vn * cfg.PLAYER_RESTITUTION : vn; // faint bounce only if approaching
  const newVt = vt * (1 - cfg.BOARD_GRIP); // grip kills the slide-along
  ball.vx = pvx + newVn * cnx + newVt * tnx;
  ball.vy = pvy + newVn * cny + newVt * tny;
  ball.x = cp.x + cnx * (touchDist + 0.5);
  ball.y = cp.y + cny * (touchDist + 0.5);
}

function boardOverlapsProp(board: PlayerBoard, prop: Prop, cfg: Config): boolean {
  const ax = Math.cos(board.angle);
  const ay = Math.sin(board.angle);
  const halfLen = cfg.BOARD_LENGTH / 2;
  const Ax = board.x - halfLen * ax;
  const Ay = board.y - halfLen * ay;
  const Bx = board.x + halfLen * ax;
  const By = board.y + halfLen * ay;
  const cp = closestPointOnSegment(prop.x, prop.y, Ax, Ay, Bx, By);
  const dist = hypot(prop.x - cp.x, prop.y - cp.y);
  return dist <= cfg.BOARD_THICKNESS / 2 + prop.radius;
}

// ---------------------------------------------------------------
//  Zones: emit enter/exit as a ball's centre crosses a trigger region.
// ---------------------------------------------------------------
function updateZoneMembership(ball: Ball, zones: Zone[], bus: EventBus): void {
  for (const zone of zones) {
    const inside = pointInZone(zone, ball.x, ball.y);
    const wasInside = ball.insideZones.has(zone.id);
    if (inside && !wasInside) {
      ball.insideZones.add(zone.id);
      bus.emit({ type: "ballEnteredZone", ballId: ball.id, zoneId: zone.id, tags: zone.tags });
    } else if (!inside && wasInside) {
      ball.insideZones.delete(zone.id);
      bus.emit({ type: "ballExitedZone", ballId: ball.id, zoneId: zone.id, tags: zone.tags });
    }
  }
}

function pointInZone(zone: Zone, x: number, y: number): boolean {
  const s = zone.shape;
  if (s.kind === "rect") {
    return x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h;
  }
  return hypot(x - s.x, y - s.y) <= s.r;
}
