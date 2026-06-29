import type { GameMode, ModeContext } from "./types";
import type { ArenaMap, Prop } from "../core/types";
import { rectangleArena } from "../maps/rectangle";
import { clamp, hypot } from "../core/math";

// =============================================================
//  BOSS GAUNTLET — a level-based boss rush on the shared physics core.
//
//  Loop (intentionally minimal for now): one persistent ball you flick & catch;
//  defeat the current boss → a short breath → the next boss spawns. Clear the
//  list and it loops (lap++) so you can keep playtesting. No player health, no
//  scoring, no fail state yet — those are deliberately backlogged. This mode is
//  the playground for *feeling out the bosses* first.
//
//  HOW IT SITS ON THE CORE
//    - Each boss is a SOLID Prop. The core bounces the ball off it and fires
//      `ballHitProp`; we read the ball's incoming speed there and subtract HP
//      (hard flicks hurt more — same idea as the wall hitmarkers).
//    - Boss MOVEMENT is just us mutating the prop's x/y each frame.
//    - Boss HP / behavior state lives in this mode (kept off the generic Prop).
//    - Boss VISUALS beyond a plain orb (HP bars, shield rings, names) are drawn
//      in `drawOverlay` — the core renderer only knows generic orbs.
// =============================================================

const ARENA_W = 960;
const ARENA_H = 640;

// --- combat feel ---
const DMG_PER_SPEED = 0.06; // hp removed per px/sec of ball impact speed
const MIN_HIT_SPEED = 60; // px/sec; softer touches deal no damage (anti-spam)
const HIT_COOLDOWN = 0.12; // s; min gap between damage ticks on one boss
const CRIT_SPEED = 650; // px/sec impact that reads as a heavy hit (bigger pop)

// --- ball auto-return (only after a DIRECT, bounce-free hit) ---
const RETURN_SPEED = 380; // px/sec, constant straight-line return speed
const RETURN_DONE_DIST = 26; // px from the captured point at which the return ends

// --- pacing ---
const INTERMISSION = 1.4; // s of calm between a kill and the next boss

// --- shield boss cycle ---
const SHIELD_VULN = 3.0; // s the Aegis is open to damage
const SHIELD_UP = 2.2; // s the Aegis is shielded (immune)

// --- frost boss (slow-orb dropper) ---
const ORB_INTERVAL = 1.8; // s between dropped orbs
const ORB_LIFE = 9; // s an orb lingers before melting
const ORB_RADIUS = 16;
const SLOW_FACTOR = 0.45; // board speedMul while slowed
const SLOW_DURATION = 2.5; // s a slow lasts after touching an orb

// ---------------------------------------------------------------
//  Boss definitions. A spec is the static recipe; a Boss is a live instance.
// ---------------------------------------------------------------

interface BossSpec {
  key: string;
  name: string;
  maxHp: number;
  radius: number;
  color: string;
  /** Wander speed in px/sec. */
  speed: number;
  /** Once, when this boss spawns. */
  onSpawn?(b: Boss): void;
  /** Per-frame behavior beyond basic wander (shields, dropping orbs, splitting). */
  behave?(b: Boss, ctx: ModeContext, gs: GauntletState, dt: number): void;
  /** True while the boss ignores incoming damage (e.g. shield up). */
  invulnerable?(b: Boss): boolean;
}

interface Boss {
  propId: number;
  spec: BossSpec;
  hp: number;
  maxHp: number;
  radius: number;
  vx: number;
  vy: number;
  age: number; // s alive
  hitCooldown: number; // s until it can take another damage tick
  steerTimer: number; // s until it re-picks a wander heading
  timer: number; // generic spec countdown (shield phase / orb drop)
  flag: boolean; // generic one-shot latch (e.g. splitter already split)
  shielded: boolean;
}

interface GauntletState {
  roundIndex: number; // index into ROSTER
  lap: number; // 1-based times through the roster
  bosses: Boss[]; // live bosses (usually 1; >1 for the splitter)
  phase: "fighting" | "intermission";
  phaseTimer: number; // counts down during intermission
  ballId: number;
  slowTimer: number; // remaining player slow debuff
  returning: boolean; // ball is returning to the captured point after a direct hit
  cleanShot: boolean; // ball hasn't bounced off a wall since the last flick
  returnTx: number; // pivot x captured at the instant of the hit (fixed target)
  returnTy: number; // pivot y captured at the instant of the hit
}

// A child the Hydra splits into — small, fast, no further splitting.
const HYDRA_CHILD: BossSpec = {
  key: "hydra-child",
  name: "Hydra Spawn",
  maxHp: 90,
  radius: 22,
  color: "#c46aa0",
  speed: 175,
};

const SHIELD: BossSpec = {
  key: "shield",
  name: "Aegis",
  maxHp: 260,
  radius: 34,
  color: "#7c6cc4",
  speed: 70,
  onSpawn(b) {
    b.shielded = false;
    b.timer = SHIELD_VULN;
  },
  behave(b, _ctx, _gs, dt) {
    b.timer -= dt;
    if (b.timer <= 0) {
      b.shielded = !b.shielded;
      b.timer = b.shielded ? SHIELD_UP : SHIELD_VULN;
    }
  },
  invulnerable: (b) => b.shielded,
};

const FAST: BossSpec = {
  key: "fast",
  name: "Flit",
  maxHp: 120,
  radius: 22,
  color: "#d6643c",
  speed: 235,
};

const TANK: BossSpec = {
  key: "tank",
  name: "Bulwark",
  maxHp: 520,
  radius: 48,
  color: "#5a8a5a",
  speed: 38,
};

const SPLITTER: BossSpec = {
  key: "splitter",
  name: "Hydra",
  maxHp: 240,
  radius: 36,
  color: "#b14a8c",
  speed: 95,
  behave(b, ctx, gs) {
    // At half health, the Hydra dies as one and is reborn as two.
    if (!b.flag && b.hp <= b.maxHp * 0.5) {
      b.flag = true;
      const prop = propOf(ctx, b.propId);
      const cx = prop?.x ?? ARENA_W * 0.5;
      const cy = prop?.y ?? ARENA_H * 0.5;
      removeBoss(ctx, gs, b);
      spawnBoss(ctx, gs, HYDRA_CHILD, cx - 40, cy);
      spawnBoss(ctx, gs, HYDRA_CHILD, cx + 40, cy);
      ctx.popText(cx, cy - b.radius, "SPLIT!", {
        color: "#e89ccb",
        size: 22,
        glowColor: "rgba(232,156,203,0.6)",
        glowBlur: 14,
        rise: 28,
        life: 0.9,
      });
    }
  },
};

const FROST: BossSpec = {
  key: "frost",
  name: "Rimewarden",
  maxHp: 220,
  radius: 38,
  color: "#5aa9d6",
  speed: 80,
  onSpawn(b) {
    b.timer = ORB_INTERVAL;
  },
  behave(b, ctx, _gs, dt) {
    b.timer -= dt;
    if (b.timer <= 0) {
      b.timer = ORB_INTERVAL;
      const prop = propOf(ctx, b.propId);
      if (prop) {
        ctx.spawnProp({
          x: prop.x,
          y: prop.y,
          radius: ORB_RADIUS,
          kind: "slow-orb",
          solid: false,
          color: "#6fc7e8",
          data: { born: ctx.time.elapsed },
        });
      }
    }
  },
};

// Difficulty ramp: ease in fast → learn the shield timing → manage the debuff →
// juggle two targets → grind the tank finale. Then it loops.
const ROSTER: BossSpec[] = [FAST, SHIELD, FROST, SPLITTER, TANK];

// ---------------------------------------------------------------
//  Mode
// ---------------------------------------------------------------

export const bossGauntlet: GameMode = {
  id: "boss-gauntlet",
  name: "Boss Gauntlet",
  description: "A boss rush. Flick the ball to break each boss, then face the next. Endless, for now.",
  tags: ["solo", "combat", "boss-rush"],
  showHitDamage: false, // we pop our own real-HP damage numbers on bosses
  map: buildMap,

  setup(ctx) {
    const gs = ctx.state as GauntletState;
    gs.roundIndex = 0;
    gs.lap = 1;
    gs.bosses = [];
    gs.phase = "fighting";
    gs.phaseTimer = 0;
    gs.slowTimer = 0;
    gs.returning = false;
    gs.cleanShot = false;
    gs.returnTx = 0;
    gs.returnTy = 0;

    const ball = ctx.spawnBall(ARENA_W * 0.3, ARENA_H * 0.5);
    gs.ballId = ball.id;

    // Ball striking a boss → speed-scaled damage (unless the boss is immune).
    ctx.on("ballHitProp", (e) => {
      if (e.kind !== "boss") return;
      const boss = gs.bosses.find((b) => b.propId === e.propId);
      if (!boss) return;
      // Direct hit only: a clean flick (no wall bounce since release) snaps the
      // ball straight back to wherever the pivot is at THIS instant.
      if (gs.cleanShot && e.ballId === gs.ballId) {
        const board = ctx.board(0);
        if (board) {
          gs.returnTx = board.x;
          gs.returnTy = board.y;
          gs.returning = true;
        }
        gs.cleanShot = false; // one return per clean flick
      }
      if (boss.hitCooldown > 0) return;
      const prop = propOf(ctx, boss.propId);
      if (!prop) return;

      if (boss.spec.invulnerable?.(boss)) {
        boss.hitCooldown = HIT_COOLDOWN;
        ctx.popText(prop.x, prop.y - boss.radius, "BLOCKED", {
          color: "#aab6ff",
          size: 16,
          rise: 20,
          life: 0.7,
        });
        return;
      }

      const ball = ctx.world.getBall(e.ballId);
      const speed = ball ? hypot(ball.vx, ball.vy) : 0;
      if (speed < MIN_HIT_SPEED) return;

      const dmg = Math.max(1, Math.round(speed * DMG_PER_SPEED));
      boss.hp -= dmg;
      boss.hitCooldown = HIT_COOLDOWN;

      const crit = speed >= CRIT_SPEED;
      ctx.popText(prop.x, prop.y - boss.radius, crit ? `${dmg}!` : `${dmg}`, {
        color: crit ? "#ffd27a" : "#ff8f6b",
        size: crit ? 28 : 20,
        glowColor: crit ? "rgba(255,180,80,0.6)" : undefined,
        glowBlur: crit ? 16 : 0,
        rise: 30,
        life: 0.9,
      });
    });

    // Driving the board over a dropped slow-orb chills you for a few seconds.
    ctx.on("boardHitProp", (e) => {
      if (e.kind !== "slow-orb") return;
      const board = ctx.board(0);
      if (board) board.speedMul = SLOW_FACTOR;
      gs.slowTimer = SLOW_DURATION;
      const orb = propOf(ctx, e.propId);
      if (orb) {
        ctx.popText(orb.x, orb.y, "SLOWED", { color: "#9fe0ff", size: 16, rise: 22, life: 0.8 });
        ctx.removeProp(orb.id);
      }
    });

    // A clean shot = a flick that hasn't touched a wall yet. Only a clean shot
    // earns the auto-return.
    ctx.on("ballFlicked", (e) => {
      if (e.ballId !== gs.ballId) return;
      gs.cleanShot = true;
      gs.returning = false;
    });
    ctx.on("ballHitWall", (e) => {
      if (e.ballId === gs.ballId) gs.cleanShot = false;
    });

    startRound(ctx, gs);
    pushHud(ctx, gs);
  },

  update(ctx, dt) {
    const gs = ctx.state as GauntletState;

    // Ball auto-return: after a direct hit, drive the free ball in a STRAIGHT
    // line to the pivot point captured at impact (fixed target — no curve, no
    // tracking the player's later movement).
    if (gs.returning) {
      const ball = ctx.world.getBall(gs.ballId);
      if (!ball || ball.heldBy !== null) {
        gs.returning = false; // caught (or gone) — done
      } else {
        const dx = gs.returnTx - ball.x;
        const dy = gs.returnTy - ball.y;
        const dist = hypot(dx, dy);
        if (dist <= RETURN_DONE_DIST) {
          ball.vx = 0;
          ball.vy = 0;
          gs.returning = false; // arrived at the captured point
        } else {
          ball.vx = (dx / dist) * RETURN_SPEED;
          ball.vy = (dy / dist) * RETURN_SPEED;
        }
      }
    }

    // Player slow debuff ticks down regardless of phase.
    if (gs.slowTimer > 0) {
      gs.slowTimer = Math.max(0, gs.slowTimer - dt);
      if (gs.slowTimer === 0) {
        const board = ctx.board(0);
        if (board) board.speedMul = 1;
      }
    }

    if (gs.phase === "intermission") {
      gs.phaseTimer -= dt;
      if (gs.phaseTimer <= 0) {
        advanceRound(ctx, gs);
      }
      pushHud(ctx, gs);
      return;
    }

    // Fighting: move bosses and run their behaviors (snapshot — behaviors may add
    // or remove bosses, e.g. the splitter).
    for (const boss of [...gs.bosses]) {
      boss.age += dt;
      boss.hitCooldown = Math.max(0, boss.hitCooldown - dt);
      moveBoss(ctx, boss, dt);
      boss.spec.behave?.(boss, ctx, gs, dt);
    }

    // Reap the dead.
    for (const boss of [...gs.bosses]) {
      if (boss.hp <= 0) killBoss(ctx, gs, boss);
    }

    expireOrbs(ctx);

    // Round cleared → breathe, then advance.
    if (gs.bosses.length === 0) {
      gs.phase = "intermission";
      gs.phaseTimer = INTERMISSION;
    }

    pushHud(ctx, gs);
  },

  drawOverlay(ctx, c) {
    const gs = ctx.state as GauntletState;

    for (const boss of gs.bosses) {
      const prop = propOf(ctx, boss.propId);
      if (!prop) continue;

      // Shield ring.
      if (boss.shielded) {
        c.save();
        c.strokeStyle = "rgba(150,170,255,0.85)";
        c.lineWidth = 3;
        c.beginPath();
        c.arc(prop.x, prop.y, boss.radius + 7, 0, Math.PI * 2);
        c.stroke();
        c.restore();
      }

      // HP bar above the boss.
      const w = Math.max(48, boss.radius * 2.2);
      const h = 7;
      const x = prop.x - w / 2;
      const y = prop.y - boss.radius - 18;
      const frac = clamp(boss.hp / boss.maxHp, 0, 1);
      c.fillStyle = "rgba(0,0,0,0.6)";
      c.fillRect(x - 1, y - 1, w + 2, h + 2);
      c.fillStyle = "#2a2030";
      c.fillRect(x, y, w, h);
      c.fillStyle = boss.shielded ? "#9aa8ff" : "#d65a5a";
      c.fillRect(x, y, w * frac, h);

      // Name.
      c.font = "11px monospace";
      c.textAlign = "center";
      c.fillStyle = "#c9b890";
      c.fillText(boss.spec.name, prop.x, y - 4);
    }

    // Intermission banner.
    if (gs.phase === "intermission") {
      c.save();
      c.font = "bold 26px monospace";
      c.textAlign = "center";
      c.fillStyle = "rgba(201,184,144,0.92)";
      c.fillText(`Next: ${nextSpec(gs).name}`, ARENA_W / 2, ARENA_H / 2);
      c.restore();
    }

    c.textAlign = "left"; // reset shared canvas state
  },
};

// ---------------------------------------------------------------
//  Rounds
// ---------------------------------------------------------------

function startRound(ctx: ModeContext, gs: GauntletState): void {
  gs.phase = "fighting";
  spawnBoss(ctx, gs, ROSTER[gs.roundIndex]!, ARENA_W * 0.68, ARENA_H * 0.5);
}

function advanceRound(ctx: ModeContext, gs: GauntletState): void {
  gs.roundIndex += 1;
  if (gs.roundIndex >= ROSTER.length) {
    gs.roundIndex = 0;
    gs.lap += 1;
  }
  startRound(ctx, gs);
}

/** The spec that intermission is counting down to. */
function nextSpec(gs: GauntletState): BossSpec {
  const i = (gs.roundIndex + 1) % ROSTER.length;
  return ROSTER[i]!;
}

// ---------------------------------------------------------------
//  Boss lifecycle + movement
// ---------------------------------------------------------------

function spawnBoss(ctx: ModeContext, gs: GauntletState, spec: BossSpec, x: number, y: number): Boss {
  const prop = ctx.spawnProp({
    x,
    y,
    radius: spec.radius,
    kind: "boss",
    solid: true,
    color: spec.color,
  });
  const heading = ctx.rng() * Math.PI * 2;
  const boss: Boss = {
    propId: prop.id,
    spec,
    hp: spec.maxHp,
    maxHp: spec.maxHp,
    radius: spec.radius,
    vx: Math.cos(heading) * spec.speed,
    vy: Math.sin(heading) * spec.speed,
    age: 0,
    hitCooldown: 0,
    steerTimer: 0.6 + ctx.rng() * 0.8,
    timer: 0,
    flag: false,
    shielded: false,
  };
  spec.onSpawn?.(boss);
  gs.bosses.push(boss);
  return boss;
}

/** Remove a boss + its prop without any "defeated" fanfare (used by the splitter). */
function removeBoss(ctx: ModeContext, gs: GauntletState, boss: Boss): void {
  ctx.removeProp(boss.propId);
  const i = gs.bosses.indexOf(boss);
  if (i >= 0) gs.bosses.splice(i, 1);
}

function killBoss(ctx: ModeContext, gs: GauntletState, boss: Boss): void {
  const prop = propOf(ctx, boss.propId);
  if (prop) {
    ctx.popText(prop.x, prop.y, "DEFEATED", {
      color: "#7ee787",
      size: 24,
      glowColor: "rgba(110,231,135,0.6)",
      glowBlur: 16,
      rise: 34,
      life: 1.1,
    });
  }
  removeBoss(ctx, gs, boss);
}

/** Wander: drift at the spec's speed, reflect off the arena, re-aim periodically. */
function moveBoss(ctx: ModeContext, boss: Boss, dt: number): void {
  const prop = propOf(ctx, boss.propId);
  if (!prop) return;

  boss.steerTimer -= dt;
  if (boss.steerTimer <= 0) {
    boss.steerTimer = 0.8 + ctx.rng() * 1.2;
    const heading = ctx.rng() * Math.PI * 2;
    boss.vx = Math.cos(heading) * boss.spec.speed;
    boss.vy = Math.sin(heading) * boss.spec.speed;
  }

  prop.x += boss.vx * dt;
  prop.y += boss.vy * dt;

  // Reflect off the arena walls (keep the whole orb inside the playfield).
  const margin = boss.radius + 18;
  const minX = margin;
  const maxX = ARENA_W - margin;
  const minY = margin;
  const maxY = ARENA_H - margin;
  if (prop.x < minX) {
    prop.x = minX;
    boss.vx = Math.abs(boss.vx);
  } else if (prop.x > maxX) {
    prop.x = maxX;
    boss.vx = -Math.abs(boss.vx);
  }
  if (prop.y < minY) {
    prop.y = minY;
    boss.vy = Math.abs(boss.vy);
  } else if (prop.y > maxY) {
    prop.y = maxY;
    boss.vy = -Math.abs(boss.vy);
  }
}

/** Melt slow-orbs that have outlived ORB_LIFE so the floor doesn't fill up. */
function expireOrbs(ctx: ModeContext): void {
  const now = ctx.time.elapsed;
  for (const p of [...ctx.world.props]) {
    if (p.kind !== "slow-orb") continue;
    const born = (p.data?.born as number) ?? now;
    if (now - born > ORB_LIFE) ctx.removeProp(p.id);
  }
}

// ---------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------

function propOf(ctx: ModeContext, id: number): Prop | undefined {
  return ctx.world.props.find((p) => p.id === id);
}

function buildMap(): ArenaMap {
  const map = rectangleArena(ARENA_W, ARENA_H);
  map.id = "arena-gauntlet";
  map.name = "Gauntlet Arena";
  // Boss spawns are handled by the mode; keep just the player spawn from the base.
  map.spawns = map.spawns.filter((s) => s.type === "player");
  return map;
}

function pushHud(ctx: ModeContext, gs: GauntletState): void {
  const lines: string[] = [`Lap ${gs.lap}  ·  Boss ${gs.roundIndex + 1}/${ROSTER.length}`];
  if (gs.phase === "intermission") {
    lines.push(`Get ready — ${nextSpec(gs).name} approaches`);
  } else {
    const names = gs.bosses.map((b) => b.spec.name).join(" + ");
    lines.push(gs.slowTimer > 0 ? `${names}  (SLOWED)` : names);
  }
  ctx.setHud({ title: "Boss Gauntlet", lines });
}
