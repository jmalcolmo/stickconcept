import type { GameMode } from "./types";
import type { ArenaMap } from "../core/types";
import { rectangleArena } from "../maps/rectangle";

// =============================================================
//  ZONE RUSH — the reference mode.
//
//  This exists to PROVE the sandbox works for more than free play, and to be
//  the worked example your buddy copies for the air-hockey-style mode. In ~70
//  lines it exercises every seam:
//    - a custom MAP (a target zone added to the classic arena),
//    - EVENTS (reacting to the ball entering the lit zone),
//    - mode STATE (score + clock),
//    - per-frame UPDATE (countdown, moving the target),
//    - HUD (scoreboard),
//    - a WIN/OVER condition (timer hits zero).
//
//  Rules: a target zone lights up. Flick the ball into it to score, and it jumps
//  to a new random spot. Score as many as you can before the clock runs out.
// =============================================================

const ROUND_SECONDS = 60;
const TARGET_RADIUS = 60;

interface ZoneRushState {
  score: number;
  remaining: number;
  zoneId: string;
}

function buildMap(): ArenaMap {
  const map = rectangleArena();
  map.id = "arena-rush";
  map.name = "Zone Rush";
  // One circular target zone the mode will reposition as it's hit.
  map.zones = [
    {
      id: "target",
      shape: { kind: "circle", x: map.width * 0.7, y: map.height * 0.5, r: TARGET_RADIUS },
      tags: ["target"],
      color: "rgba(63,185,80,0.18)",
    },
  ];
  return map;
}

function moveTarget(ctx: Parameters<GameMode["setup"]>[0]): void {
  // Pick a spot away from the player's spawn side and keep it inside the walls.
  const pad = TARGET_RADIUS + 30;
  const zone = ctx.map.zones.find((z) => z.id === (ctx.state as ZoneRushState).zoneId);
  if (!zone || zone.shape.kind !== "circle") return;
  zone.shape.x = pad + ctx.rng() * (ctx.map.width - 2 * pad);
  zone.shape.y = pad + ctx.rng() * (ctx.map.height - 2 * pad);
}

export const zoneRush: GameMode = {
  id: "zone-rush",
  name: "Zone Rush",
  description: "A target lights up — flick the ball into it. Score as many as you can in 60s.",
  tags: ["solo", "score-attack"],
  map: buildMap,
  showHitDamage: false, // no combat here — score pops with a "+1" instead

  setup(ctx) {
    const state = ctx.state as ZoneRushState;
    state.score = 0;
    state.remaining = ROUND_SECONDS;
    state.zoneId = "target";

    ctx.spawnBall(ctx.map.width * 0.3, ctx.map.height * 0.5);

    // Score when the ball enters the target zone, then relocate the target.
    ctx.on("ballEnteredZone", (e) => {
      if (e.tags.includes("target")) {
        state.score += 1;
        // Pop a "+1" where the zone was cleared (capture before it jumps away).
        const zone = ctx.map.zones.find((z) => z.id === state.zoneId);
        if (zone && zone.shape.kind === "circle") {
          ctx.popText(zone.shape.x, zone.shape.y, "+1", {
            color: "#7ee787",
            size: 26,
            glowColor: "rgba(110, 231, 135, 0.6)",
            glowBlur: 16,
            rise: 34,
            life: 1,
          });
        }
        moveTarget(ctx);
      }
    });

    pushHud(ctx, state);
  },

  update(ctx, dt) {
    const state = ctx.state as ZoneRushState;
    state.remaining = Math.max(0, state.remaining - dt);
    pushHud(ctx, state);
  },

  isOver(ctx) {
    return (ctx.state as ZoneRushState).remaining <= 0;
  },
};

function pushHud(ctx: Parameters<GameMode["setup"]>[0], state: ZoneRushState): void {
  ctx.setHud({
    title: "Zone Rush",
    lines: [`Score: ${state.score}`, `Time: ${state.remaining.toFixed(1)}s`],
  });
}
