import type { GameMode } from "./types";
import { rectangleArena } from "../maps/rectangle";

/**
 * FREE PLAY — the original prototype, re-homed as a mode.
 *
 * It is deliberately the smallest possible mode: a map plus a single ball, no
 * rules, no score, no win condition. This is the proof that the core is fully
 * decoupled — "the game" the prototype shipped is now just one entry in the
 * registry, and it's barely any code.
 */
export const freePlay: GameMode = {
  id: "free-play",
  name: "Free Play",
  description: "Open arena, one ball, no rules. Practise the catch and the flick.",
  tags: ["solo", "practice"],
  map: rectangleArena,

  setup(ctx) {
    // Spawn one ball at the map's ball spawn (falls back to centre-ish).
    const spawn = ctx.map.spawns.find((s) => s.type === "ball");
    ctx.spawnBall(spawn?.x ?? ctx.map.width * 0.65, spawn?.y ?? ctx.map.height * 0.5);

    ctx.setHud({
      title: "Free Play",
      lines: ["Hold left-click + touch the ball to catch", "Spin and release to flick · Esc to pause"],
    });
  },
};
