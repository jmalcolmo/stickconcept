import type { ArenaMap, Ball, PlayerBoard, Prop } from "./types";
import type { Config } from "../config";

/**
 * The live scene: the loaded map plus every simulated entity. A fresh World is
 * built each time a mode loads. It's a plain state container — the physics
 * mutates it, the renderer reads it, and modes spawn/remove entities through it.
 */
export class World {
  map!: ArenaMap;
  boards: PlayerBoard[] = [];
  balls: Ball[] = [];
  props: Prop[] = [];

  private nextId = 1;

  constructor(private cfg: Config) {}

  loadMap(map: ArenaMap): void {
    this.map = map;
    this.boards = [];
    this.balls = [];
    this.props = [];
    this.nextId = 1;
  }

  private id(): number {
    return this.nextId++;
  }

  spawnBoard(x: number, y: number, inputId: string, opts: { angle?: number; team?: string } = {}): PlayerBoard {
    const board: PlayerBoard = {
      id: this.id(),
      x,
      y,
      vx: 0,
      vy: 0,
      angle: opts.angle ?? 0,
      omega: 0,
      team: opts.team,
      heldBallId: null,
      inputId,
      action: false,
      speedMul: 1,
    };
    this.boards.push(board);
    return board;
  }

  spawnBall(x: number, y: number, opts: { radius?: number } = {}): Ball {
    const ball: Ball = {
      id: this.id(),
      x,
      y,
      vx: 0,
      vy: 0,
      radius: opts.radius ?? this.cfg.BALL_RADIUS,
      heldBy: null,
      s: 0,
      side: 1,
      insideZones: new Set(),
    };
    this.balls.push(ball);
    return ball;
  }

  spawnProp(opts: {
    x: number;
    y: number;
    radius: number;
    kind: string;
    solid?: boolean;
    color?: string;
    data?: Record<string, unknown>;
  }): Prop {
    const prop: Prop = {
      id: this.id(),
      x: opts.x,
      y: opts.y,
      radius: opts.radius,
      kind: opts.kind,
      solid: opts.solid ?? false,
      color: opts.color,
      data: opts.data,
    };
    this.props.push(prop);
    return prop;
  }

  removeBall(id: number): void {
    const i = this.balls.findIndex((b) => b.id === id);
    if (i >= 0) {
      // If a board was holding it, free the board.
      const board = this.boards.find((bd) => bd.heldBallId === id);
      if (board) board.heldBallId = null;
      this.balls.splice(i, 1);
    }
  }

  removeProp(id: number): void {
    const i = this.props.findIndex((p) => p.id === id);
    if (i >= 0) this.props.splice(i, 1);
  }

  getBall(id: number): Ball | undefined {
    return this.balls.find((b) => b.id === id);
  }

  getBoard(id: number): PlayerBoard | undefined {
    return this.boards.find((b) => b.id === id);
  }
}
