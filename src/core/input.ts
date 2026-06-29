// =============================================================
//  INPUT
//
//  Physics reads abstract InputState, never raw DOM events. Each board names an
//  `inputId`; the engine hands physics a map of id -> InputState each frame.
//  Today there is exactly one source ("kbm"). When local multiplayer lands
//  (backlogged), a second gamepad source is *added* — no physics changes.
// =============================================================

export interface InputState {
  moveX: number; // -1..1, A/D
  moveY: number; // -1..1, W/S (down is +)
  /** Horizontal mouse motion accumulated since last sample (drives spin). */
  spinDX: number;
  /** Catch/flick button held this frame. */
  action: boolean;
}

const ZERO: InputState = { moveX: 0, moveY: 0, spinDX: 0, action: false };

export interface InputSource {
  /** Read and CLEAR per-frame accumulators (like spinDX). */
  sample(): InputState;
}

/**
 * Keyboard (WASD) + mouse (horizontal drag = spin, left button = catch/flick).
 *
 * Pointer lock pins the cursor so you can drag one direction forever without the
 * OS cursor hitting a screen edge and stalling the spin. It needs a user gesture
 * and is blocked in some embedded iframes, so we (re-)request it on click and
 * never let a failure break the game.
 */
export class KeyboardMouseInput implements InputSource {
  private keys = { w: false, a: false, s: false, d: false };
  private actionDown = false;
  private spinDX = 0;
  private active = false;
  private canvas: HTMLCanvasElement | null = null;

  /** Wire DOM listeners once. They no-op while `active` is false (e.g. in menus). */
  attach(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;

    window.addEventListener("keydown", (e) => {
      if (!this.active) return;
      const k = e.key.toLowerCase();
      if (k in this.keys) {
        this.keys[k as keyof typeof this.keys] = true;
        e.preventDefault();
      }
    });
    window.addEventListener("keyup", (e) => {
      const k = e.key.toLowerCase();
      if (k in this.keys) {
        this.keys[k as keyof typeof this.keys] = false;
        e.preventDefault();
      }
    });

    window.addEventListener("mousedown", (e) => {
      if (!this.active || e.button !== 0) return;
      this.actionDown = true;
      this.requestLock();
    });
    window.addEventListener("mouseup", (e) => {
      if (e.button === 0) this.actionDown = false;
    });

    window.addEventListener("mousemove", (e) => {
      if (this.active) this.spinDX += e.movementX;
    });
  }

  /** Turn the source on/off. Turning off clears held state so nothing sticks. */
  setActive(on: boolean): void {
    this.active = on;
    if (!on) {
      this.keys.w = this.keys.a = this.keys.s = this.keys.d = false;
      this.actionDown = false;
      this.spinDX = 0;
    }
  }

  requestLock(): void {
    const c = this.canvas;
    if (!c || document.pointerLockElement === c || !c.requestPointerLock) return;
    const p = c.requestPointerLock() as unknown as Promise<void> | undefined;
    if (p && typeof p.catch === "function") p.catch(() => {});
  }

  sample(): InputState {
    if (!this.active) return { ...ZERO };
    const state: InputState = {
      moveX: (this.keys.d ? 1 : 0) - (this.keys.a ? 1 : 0),
      moveY: (this.keys.s ? 1 : 0) - (this.keys.w ? 1 : 0),
      spinDX: this.spinDX,
      action: this.actionDown,
    };
    this.spinDX = 0; // consume accumulated motion
    return state;
  }
}
