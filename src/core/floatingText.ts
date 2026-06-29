import type { Config } from "../config";
import { clamp } from "./math";

/**
 * Floating text popups — pure juice. Two flavours feed the same pool:
 *
 *   • `spawnDamage(...)` — the engine fires one wherever the ball slams a wall.
 *     The number is `impactSpeed * HIT_DAMAGE_PER_SPEED` (cosmetic only) and it
 *     grades ember-gold → flame-red with the strength of the hit.
 *
 *   • `spawn(...)` — a mode-driven popup (e.g. Zone Rush's green "+1" on a clear),
 *     reachable via `ctx.popText(...)`. Full control over colour/size/rise.
 *
 * The Engine owns one of these and draws it on top of the world, so the look &
 * feel of every popup stays consistent across modes.
 *
 * Visual language matches the dark-fantasy pixel skin: chunky "Press Start 2P"
 * glyphs, a hard (blur-free) pixel drop-shadow, a coloured glow on strong hits,
 * a punchy pop-in, then a drift-and-fade.
 */
export interface FloatTextOpts {
  /** Fill colour (CSS). Default torch-gold. */
  color?: string;
  /** Font size in px before the pop-in scale. Default 18. */
  size?: number;
  /** Upward drift speed (px/sec). Default 30. */
  rise?: number;
  /** Lifetime in seconds. Default 0.9. */
  life?: number;
  /** Glow colour (CSS, usually rgba). Omit for no glow. */
  glowColor?: string;
  /** Glow blur radius in px when `glowColor` is set. Default 12. */
  glowBlur?: number;
}

interface FloatItem {
  x: number;
  y: number;
  vx: number;
  vy: number;
  text: string;
  size: number; // base font size in px (before the pop-in scale)
  color: string;
  shadowColor: string | null; // coloured glow, or null for none
  shadowBlur: number;
  age: number; // seconds alive
  life: number; // total lifetime in seconds
}

const MAX_ACTIVE = 40; // safety cap so a long rally can't pile popups up forever

export class FloatingText {
  private items: FloatItem[] = [];

  constructor(private cfg: Config) {}

  /**
   * Spawn a damage number at a wall contact.
   * @param dirX,dirY  unit-ish rebound direction (the number drifts this way);
   *                   falls back to straight up if the ball was barely moving.
   */
  spawnDamage(x: number, y: number, damage: number, speed: number, dirX: number, dirY: number): void {
    const heat = clamp(speed / this.cfg.HIT_CRIT_SPEED, 0, 1);

    // Drift along the rebound, with a small random spread + a constant upward
    // bias so the marker always lifts clear of the wall, never sinks into it.
    let dx = dirX;
    let dy = dirY;
    const len = Math.hypot(dx, dy);
    if (len > 0.001) {
      dx /= len;
      dy /= len;
    } else {
      dx = 0;
      dy = -1;
    }
    const spread = (Math.random() - 0.5) * 0.5; // ±~14°
    const cos = Math.cos(spread);
    const sin = Math.sin(spread);
    const rx = dx * cos - dy * sin;
    const ry = dx * sin + dy * cos;
    const drift = 30 + heat * 34;

    this.push({
      // Nudge the number off the wall and into the arena so it never clips the
      // edge it spawned against, regardless of which wall was struck.
      x: x + rx * 18,
      y: y + ry * 18,
      vx: rx * drift,
      vy: ry * drift - 12, // gentle upward lift on top of the rebound drift
      text: damage.toLocaleString(),
      size: 13 + heat * 16, // 13px taps → ~29px crits
      color: heatColor(heat),
      shadowColor: heat > 0.3 ? `rgba(255, 120, 40, ${0.55 * heat})` : null,
      shadowBlur: 6 + heat * 16,
      age: 0,
      life: 0.8 + heat * 0.3,
    });
  }

  /** Spawn an arbitrary popup (mode-driven). Rises gently and fades. */
  spawn(x: number, y: number, text: string, opts: FloatTextOpts = {}): void {
    const rise = opts.rise ?? 30;
    this.push({
      x,
      y,
      vx: 0,
      vy: -rise,
      text,
      size: opts.size ?? 18,
      color: opts.color ?? "#ffd76a",
      shadowColor: opts.glowColor ?? null,
      shadowBlur: opts.glowBlur ?? 12,
      age: 0,
      life: opts.life ?? 0.9,
    });
  }

  private push(item: FloatItem): void {
    this.items.push(item);
    if (this.items.length > MAX_ACTIVE) {
      this.items.splice(0, this.items.length - MAX_ACTIVE);
    }
  }

  update(dt: number): void {
    for (const it of this.items) {
      it.age += dt;
      it.x += it.vx * dt;
      it.y += it.vy * dt;
      it.vx *= 0.9; // ease the horizontal drift out
      it.vy = it.vy * 0.9 - 8 * dt; // keep a gentle upward float
    }
    // Reap the dead (cheap; the list is tiny).
    if (this.items.length > 0) {
      this.items = this.items.filter((it) => it.age < it.life);
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (this.items.length === 0) return;
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const it of this.items) {
      const t = it.age / it.life; // 0..1 progress

      // Pop-in: overshoot to ~1.15 over the first 18%, then settle to 1.
      const intro = t < 0.18 ? easeOutBack(t / 0.18) : 1;
      const scale = 0.45 + 0.55 * intro;

      // Hold opaque, then fade over the last 45% of life.
      const alpha = t < 0.55 ? 1 : 1 - (t - 0.55) / 0.45;

      ctx.save();
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.translate(it.x, it.y);
      ctx.scale(scale, scale);
      ctx.font = `${it.size}px "Press Start 2P", "VT323", monospace`;

      // Hard pixel drop-shadow (no blur) for that chiselled stencil look.
      ctx.fillStyle = "#160b04";
      ctx.fillText(it.text, 2, 3);

      // Coloured glow (crits, score pops, etc.).
      if (it.shadowColor) {
        ctx.shadowColor = it.shadowColor;
        ctx.shadowBlur = it.shadowBlur;
      }
      ctx.fillStyle = it.color;
      ctx.fillText(it.text, 0, 0);
      ctx.restore();
    }
    ctx.restore();
  }

  clear(): void {
    this.items.length = 0;
  }
}

/** Ember-gold → flame-red as the hit gets harder. */
function heatColor(heat: number): string {
  // gold #ffd76a → orange #ff9a3c → flame-red #ff4a26
  const stops = [
    [255, 215, 106],
    [255, 154, 60],
    [255, 74, 38],
  ] as const;
  const seg = heat * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(seg));
  const f = seg - i;
  const a = stops[i]!;
  const b = stops[i + 1]!;
  const r = Math.round(a[0] + (b[0] - a[0]) * f);
  const g = Math.round(a[1] + (b[1] - a[1]) * f);
  const bl = Math.round(a[2] + (b[2] - a[2]) * f);
  return `rgb(${r}, ${g}, ${bl})`;
}

/** Overshooting ease for a punchy pop-in. */
function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const x = t - 1;
  return 1 + c3 * x * x * x + c1 * x * x;
}
