import type { GameMode } from "../modes/types";

/**
 * The mode-browser shell: a grid of cards you pick a game from. Builds itself
 * from the registry, so new modes show up automatically. Owns nothing about the
 * simulation — it just calls back with the chosen mode.
 */
export class Menu {
  constructor(
    private root: HTMLElement,
    private modes: GameMode[],
    private onPick: (mode: GameMode) => void,
  ) {
    this.build();
  }

  private build(): void {
    const grid = document.createElement("div");
    grid.className = "mode-grid";

    for (const mode of this.modes) {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "mode-card";
      card.innerHTML = `
        <span class="mode-name">${esc(mode.name)}</span>
        <span class="mode-desc">${esc(mode.description)}</span>
        ${mode.tags?.length ? `<span class="mode-tags">${mode.tags.map((t) => `<em>${esc(t)}</em>`).join("")}</span>` : ""}
      `;
      card.addEventListener("click", () => this.onPick(mode));
      grid.appendChild(card);
    }

    this.root.appendChild(grid);
  }
}

function esc(s: string): string {
  return s.replace(/[&<>]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;"));
}
