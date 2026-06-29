import type { World } from "./world";
import type { Zone } from "./types";
import type { Config } from "../config";

/**
 * Draws a World generically: dungeon floor, zones, walls, props, balls, boards.
 * It knows nothing about specific modes. A mode can paint extra decoration via
 * its optional `drawOverlay` hook (called by the engine after this).
 *
 * Visual language: dark-fantasy pixel. A black/grey stone vault — parchment &
 * bone, ember gold. Entities are flat-shaded in a few tones so they read as
 * pixel art rather than smooth vector.
 */
export class Renderer {
  constructor(
    private ctx: CanvasRenderingContext2D,
    private cfg: Config,
  ) {}

  render(world: World): void {
    const ctx = this.ctx;
    const { map } = world;

    this.drawFloor(map.width, map.height);

    // Zones (translucent trigger regions — goals, target pads, etc.).
    for (const zone of map.zones) this.drawZone(zone);

    // Walls — carved stone ramparts: dark body, torch-warmed top edge.
    ctx.lineCap = "round";
    for (const w of map.walls) {
      ctx.lineWidth = w.thickness;
      ctx.strokeStyle = "#221b29";
      ctx.beginPath();
      ctx.moveTo(w.x1, w.y1);
      ctx.lineTo(w.x2, w.y2);
      ctx.stroke();
      // Inner shadow core for depth.
      ctx.lineWidth = Math.max(2, w.thickness - 8);
      ctx.strokeStyle = "#171120";
      ctx.beginPath();
      ctx.moveTo(w.x1, w.y1);
      ctx.lineTo(w.x2, w.y2);
      ctx.stroke();
      // Thin torch-lit highlight along the stone lip.
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#4a3a2c";
      ctx.beginPath();
      ctx.moveTo(w.x1, w.y1);
      ctx.lineTo(w.x2, w.y2);
      ctx.stroke();
    }
    ctx.lineCap = "butt";

    // Props (powerups, targets, bumpers) — flat-shaded stone/ember orbs.
    for (const p of world.props) {
      const base = p.color ?? (p.solid ? "#5a4a3a" : "#b14a2c");
      this.drawOrb(p.x, p.y, p.radius, base);
    }

    // Balls — pale moonstone orbs, flat-shaded for a pixel look.
    for (const b of world.balls) {
      this.drawOrb(b.x, b.y, b.radius, "#c9b890", { light: "#ece0c2", dark: "#7c6a48" });
    }

    // Boards — the "stick". Cold iron at rest; ember-gold while it grips a ball.
    ctx.lineCap = "round";
    for (const board of world.boards) {
      const ax = Math.cos(board.angle);
      const ay = Math.sin(board.angle);
      const halfLen = this.cfg.BOARD_LENGTH / 2;
      const x1 = board.x - halfLen * ax;
      const y1 = board.y - halfLen * ay;
      const x2 = board.x + halfLen * ax;
      const y2 = board.y + halfLen * ay;
      const holding = board.heldBallId !== null;

      // Dark outline pass for crisp definition.
      ctx.lineWidth = this.cfg.BOARD_THICKNESS + 4;
      ctx.strokeStyle = "#0c0810";
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      // Body — glows when carrying.
      if (holding) {
        ctx.save();
        ctx.shadowColor = "rgba(220, 150, 60, 0.85)";
        ctx.shadowBlur = 16;
      }
      ctx.lineWidth = this.cfg.BOARD_THICKNESS;
      ctx.strokeStyle = holding ? "#d68a32" : "#6b6470";
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      if (holding) ctx.restore();

      // Top highlight strip for a forged sheen.
      const nx = -ay; // unit normal
      const ny = ax;
      const off = this.cfg.BOARD_THICKNESS * 0.28;
      ctx.lineWidth = Math.max(2, this.cfg.BOARD_THICKNESS * 0.28);
      ctx.strokeStyle = holding ? "#f0c878" : "#9b94a4";
      ctx.beginPath();
      ctx.moveTo(x1 - nx * off, y1 - ny * off);
      ctx.lineTo(x2 - nx * off, y2 - ny * off);
      ctx.stroke();

      // Pivot rivet.
      ctx.beginPath();
      ctx.arc(board.x, board.y, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = "#0c0810";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(board.x, board.y, 1.6, 0, Math.PI * 2);
      ctx.fillStyle = holding ? "#f0c878" : "#b8a86a";
      ctx.fill();
    }
    ctx.lineCap = "butt";

    this.drawVignette(map.width, map.height);
  }

  /** Black/grey ombré floor — a dark stone gradient, light above fading to black. */
  private drawFloor(w: number, h: number): void {
    const ctx = this.ctx;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#23232a");
    g.addColorStop(0.5, "#141418");
    g.addColorStop(1, "#050506");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  /** A flat-shaded sphere: dark rim, body tone, and an upper-left light cap. */
  private drawOrb(
    x: number,
    y: number,
    r: number,
    base: string,
    tones?: { light: string; dark: string },
  ): void {
    const ctx = this.ctx;
    const dark = tones?.dark ?? "#0c0810";
    const light = tones?.light ?? "rgba(255, 255, 255, 0.35)";
    // Rim / outline.
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = dark;
    ctx.fill();
    // Body.
    ctx.beginPath();
    ctx.arc(x, y, r - 1.5, 0, Math.PI * 2);
    ctx.fillStyle = base;
    ctx.fill();
    // Light cap (upper-left).
    ctx.beginPath();
    ctx.arc(x - r * 0.28, y - r * 0.28, r * 0.5, 0, Math.PI * 2);
    ctx.fillStyle = light;
    ctx.fill();
    // Specular pip.
    ctx.beginPath();
    ctx.arc(x - r * 0.34, y - r * 0.34, r * 0.16, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
    ctx.fill();
  }

  /** Darken the edges so the eye stays in the torchlit arena. */
  private drawVignette(w: number, h: number): void {
    const ctx = this.ctx;
    const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.72);
    g.addColorStop(0, "rgba(0, 0, 0, 0)");
    g.addColorStop(1, "rgba(5, 3, 8, 0.55)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  private drawZone(zone: Zone): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = zone.color ?? "rgba(200, 155, 60, 0.10)";
    ctx.strokeStyle = zone.color ?? "rgba(200, 155, 60, 0.40)";
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
