import type { HudModel } from "../modes/types";

/** Renders the active mode's scoreboard into a DOM element. */
export class Hud {
  constructor(private el: HTMLElement) {}

  render(model: HudModel | null): void {
    if (!model) {
      this.el.innerHTML = "";
      return;
    }
    const title = model.title ? `<div class="hud-title">${escape(model.title)}</div>` : "";
    const lines = model.lines.map((l) => `<div class="hud-line">${escape(l)}</div>`).join("");
    this.el.innerHTML = title + lines;
  }
}

function escape(s: string): string {
  return s.replace(/[&<>]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;"));
}
