// =============================================================
//  CORE TUNING — the "feel" of the stick & ball.
//
//  These are intentionally global to the whole sandbox: every game mode shares
//  the same core flick/absorb physics so the *character* feels identical no
//  matter what game you load. Modes change the MAP, OBJECTS, and RULES — not
//  these numbers. (A mode could expose its own knobs on top, but the core feel
//  lives here.)
// =============================================================
export interface Config {
  PLAYER_SPEED: number;
  PLAYER_BOUND_RADIUS: number;
  ROTATION_SENSITIVITY: number;
  MAX_ANGULAR_VELOCITY: number;
  BOARD_LENGTH: number;
  BOARD_THICKNESS: number;
  BALL_RADIUS: number;
  BALL_FRICTION: number;
  WALL_RESTITUTION: number;
  PLAYER_RESTITUTION: number;
  BOARD_GRIP: number;
  PROP_RESTITUTION: number;
  ADD_PLAYER_VELOCITY_ON_THROW: boolean;
  RELEASE_NUDGE: number;
}

export const CFG: Config = {
  // Player movement (independent of rotation)
  PLAYER_SPEED: 260, // px/sec, WASD movement speed
  PLAYER_BOUND_RADIUS: 14, // how far the pivot is kept from the bounds (board tips may overhang)

  // Spin / rotation (driven DIRECTLY by horizontal mouse motion — 1:1, no inertia)
  ROTATION_SENSITIVITY: 0.01, // radians the player rotates per pixel of horizontal mouse motion
  MAX_ANGULAR_VELOCITY: 16, // rad/sec hard cap on spin speed (clamps a violent swipe -> caps flick power)

  // The character is a flat BOARD (a thick line) that pivots at the player's center.
  BOARD_LENGTH: 92, // px, tip-to-tip length
  BOARD_THICKNESS: 16, // px, how thick the board renders / collides

  // Ball
  BALL_RADIUS: 12,
  BALL_FRICTION: 0.997, // per-frame (60fps) linear damping on a free ball (1 = frictionless)

  // Collisions / bounce
  WALL_RESTITUTION: 0.75, // how bouncy arena walls are (1 = perfectly elastic)
  PLAYER_RESTITUTION: 0.1, // bounce off a STILL board — keep low so a still board kills momentum
  BOARD_GRIP: 0.85, // how much of the ball's slide along the board is killed on contact
  PROP_RESTITUTION: 0.9, // bounciness of solid mode props (bumpers, posts)

  // Throw
  ADD_PLAYER_VELOCITY_ON_THROW: true, // also impart the player's running velocity to the thrown ball
  RELEASE_NUDGE: 2, // px the ball is pushed outward on release so it doesn't instantly re-collide
};
