import "./styles.css";
import { CFG } from "./config";
import { Engine } from "./core/engine";
import { Menu } from "./ui/menu";
import { Hud } from "./ui/hud";
import { MODES } from "./modes/registry";
import type { GameMode, HudModel } from "./modes/types";

// ---- DOM references ----
const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} missing`);
  return el as T;
};

const menuScreen = $("menuScreen");
const gameScreen = $("gameScreen");
const modeList = $("modeList");
const canvas = $<HTMLCanvasElement>("game");
const hudEl = $("hud");
const pauseOverlay = $("pauseOverlay");
const overOverlay = $("overOverlay");
const overBody = $("overBody");

// ---- Wiring ----
const hud = new Hud(hudEl);

const engine = new Engine(canvas, CFG, {
  onHud: (m) => hud.render(m),
  onModeOver: (mode, finalHud) => showGameOver(mode, finalHud),
});

let currentMode: GameMode | null = null;
let paused = false;

function showScreen(which: "menu" | "game"): void {
  menuScreen.classList.toggle("hidden", which !== "menu");
  gameScreen.classList.toggle("hidden", which !== "game");
}

function startMode(mode: GameMode): void {
  currentMode = mode;
  paused = false;
  pauseOverlay.classList.add("hidden");
  overOverlay.classList.add("hidden");
  showScreen("game");
  engine.loadMode(mode);
}

function backToMenu(): void {
  engine.unloadMode();
  currentMode = null;
  hud.render(null);
  pauseOverlay.classList.add("hidden");
  overOverlay.classList.add("hidden");
  showScreen("menu");
}

function togglePause(): void {
  if (!currentMode) return;
  paused = !paused;
  engine.setRunning(!paused);
  pauseOverlay.classList.toggle("hidden", !paused);
}

function showGameOver(mode: GameMode, finalHud: HudModel | null): void {
  const title = finalHud?.title ?? mode.name;
  const lines = finalHud?.lines ?? [];
  overBody.innerHTML =
    `<h2>${esc(title)} — Round Over</h2>` +
    lines.map((l) => `<p>${esc(l)}</p>`).join("");
  overOverlay.classList.remove("hidden");
}

// Build the browse menu from the registry.
new Menu(modeList, MODES, startMode);

// Pause / resume / navigation buttons.
$("resumeBtn").addEventListener("click", () => togglePause());
$("pauseMenuBtn").addEventListener("click", backToMenu);
$("playAgainBtn").addEventListener("click", () => currentMode && startMode(currentMode));
$("overMenuBtn").addEventListener("click", backToMenu);

window.addEventListener("keydown", (e) => {
  // Esc toggles pause, but only while in a live round (not on the game-over screen).
  if (e.key === "Escape" && currentMode && overOverlay.classList.contains("hidden")) {
    togglePause();
  }
});

function esc(s: string): string {
  return s.replace(/[&<>]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;"));
}
