import type { World } from "./world";
import type { Zone } from "./types";
import type { Config } from "../config";

/**
 * Draws a World generically: background, zones, walls, props, balls, boards.
 * It knows nothing about specific modes. A mode can paint extra decoration via
 * its optional `drawOverlay` hook (called by the engine after this).
 */
export class Renderer {
  constructor(
    private ctx: CanvasRenderingContext2D,
    private cfg: Config,
  ) {}

  render(world: World): void {
    const ctx = this.ctx;
    const { map } = world;

    // Background fill.
    ctx.fillStyle = map.background ?? "#11161f";
    ctx.fillRect(0, 0, map.width, map.height);

    // Zones (translucent trigger regions — goals, target pads, etc.).
    for (const zone of map.zones) this.drawZone(zone);

    // Walls (thick, round-capped capsules).
    ctx.lineCap = "round";
    for (const w of map.walls) {
      ctx.lineWidth = w.thickness;
      ctx.strokeStyle = "#1b2230";
      ctx.beginPath();
      ctx.moveTo(w.x1, w.y1);
      ctx.lineTo(w.x2, w.y2);
      ctx.stroke();
      // Thin highlight edge for definition.
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#30363d";
      ctx.beginPath();
      ctx.moveTo(w.x1, w.y1);
      ctx.lineTo(w.x2, w.y2);
      ctx.stroke();
    }
    ctx.lineCap = "butt";

    // Props (powerups, targets, bumpers).
    for (const p of world.props) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fillStyle = p.color ?? (p.solid ? "#8b949e" : "#d29922");
      ctx.fill();
    }

    // Balls.
    for (const b of world.balls) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
      ctx.fillStyle = "#f0883e";
      ctx.fill();
    }

    // Boards (capsule; green while holding a ball, else blue/team colour).
    ctx.lineCap = "round";
    for (const board of world.boards) {
      const ax = Math.cos(board.angle);
      const ay = Math.sin(board.angle);
      const halfLen = this.cfg.BOARD_LENGTH / 2;
      ctx.lineWidth = this.cfg.BOARD_THICKNESS;
      ctx.strokeStyle = board.heldBallId !== null ? "#3fb950" : "#58a6ff";
      ctx.beginPath();
      ctx.moveTo(board.x - halfLen * ax, board.y - halfLen * ay);
      ctx.lineTo(board.x + halfLen * ax, board.y + halfLen * ay);
      ctx.stroke();
      // Pivot dot.
      ctx.beginPath();
      ctx.arc(board.x, board.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = "#0d1117";
      ctx.fill();
    }
    ctx.lineCap = "butt";
  }

  private drawZone(zone: Zone): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = zone.color ?? "rgba(88,166,255,0.10)";
    ctx.strokeStyle = zone.color ?? "rgba(88,166,255,0.35)";
    ctx.lineWidth = 2;
    const s = zone.shape;
    if (s.kind === "rect") {
      ctx.fillRect(s.x, s.y, s.w, s.h);
      ctx.strokeRect(s.x, s.y, s.w, s.h);
    } else {
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }
}
