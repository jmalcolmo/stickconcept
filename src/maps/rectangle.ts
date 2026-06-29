import type { ArenaMap } from "../core/types";

/**
 * The classic closed rectangular arena — the original prototype's playfield,
 * now expressed as data.
 *
 * The four walls are thick capsules whose centrelines sit in the middle of the
 * wall band (at WT/2 from each edge). With WT=16 and a 12px ball, that reproduces
 * the original's exact bounce boundary (ball centre confined to [WT+r, W-WT-r]).
 * `bounds` (the board-pivot clamp) matches the original arena inset.
 */
export function rectangleArena(width = 960, height = 640, wt = 16): ArenaMap {
  const h = wt / 2;
  return {
    id: "arena-rect",
    name: "Closed Arena",
    width,
    height,
    background: "#0d0a10",
    bounds: { left: wt, top: wt, right: width - wt, bottom: height - wt },
    walls: [
      { x1: h, y1: 0, x2: h, y2: height, thickness: wt }, // left
      { x1: width - h, y1: 0, x2: width - h, y2: height, thickness: wt }, // right
      { x1: 0, y1: h, x2: width, y2: h, thickness: wt }, // top
      { x1: 0, y1: height - h, x2: width, y2: height - h, thickness: wt }, // bottom
    ],
    zones: [],
    spawns: [
      { type: "player", x: width * 0.35, y: height * 0.5 },
      { type: "ball", x: width * 0.65, y: height * 0.5 },
    ],
  };
}
