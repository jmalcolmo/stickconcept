import type { GameMode } from "./types";
import { freePlay } from "./freePlay";
import { zoneRush } from "./zoneRush";

/**
 * The browsable list of game modes. Adding a new mode = write its file and add
 * it here; the menu picks it up automatically. This is the single place the
 * sandbox learns what games exist.
 */
export const MODES: GameMode[] = [freePlay, zoneRush];

export function findMode(id: string): GameMode | undefined {
  return MODES.find((m) => m.id === id);
}
