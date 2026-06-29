# Game Concept: Spin-Throw Arena Game

> **Design history.** The core throw was redesigned during prototyping (June 2026). The
> character changed from a **round body that orbit-spins a ball** to a **flat board that
> flicks a ball**. This doc describes the **current** design, which is what `index.html`
> actually implements. The original ball + orbit-spin design is preserved verbatim in
> [`game_concept_v1_ball-spin-throw.md`](game_concept_v1_ball-spin-throw.md) so the original
> reasoning isn't lost.

## High-level pitch
Top-down arena game. You play a small character whose only way to kill enemies is by throwing a ball at them. The whole game is built around one core mechanic: catching a ball and **flicking** it off your character with real physics-driven velocity. No guns, no aiming reticle, no power meter — the throw's direction and speed come entirely from how you swing.

The character is a **flat board** (a bat / paddle) that pivots at its own center. You spin the board with the mouse; the ball launches off the *side* of the board when you let go mid-swing. Think of the Rocket League flick: the ball rolls off the surface because the surface rotated out from under it.

## Core loop
1. Player moves the board around an arena (WASD).
2. A ball exists as a free physics object — it rolls, coasts, and bounces off walls.
3. Player catches the ball by touching it with the board while holding left-click.
4. While held, the ball is **locked to the board** and rides along — the player can move and rotate freely to reposition it.
5. Player **releases left-click while spinning** to flick the ball away. Release direction/power come from the board's motion at that instant.
6. Ball flies off, bounces around (losing energy), and (eventually) damages/kills enemies on contact.

## Controls (keyboard + mouse)
- **WASD** — move the board around the arena. Fully independent of rotation; movement and spin don't affect each other.
- **Mouse horizontal drag (left/right)** — spin the board. Driven directly by mouse motion with no inertia: stop the mouse and the spin stops instantly. Vertical mouse motion does nothing. (Pointer lock pins the cursor so you can drag one direction forever; **Esc** frees it, click to re-lock.)
- **Left mouse button (hold / release)** — catch and flick.
  - Hold left-click + touch the ball with the board = catch it.
  - Touch the ball *without* holding = no catch (and a still board kills its momentum — see below).
  - Keep holding = ball stays locked to the board; move/rotate to reposition.
  - Release while spinning = **flick** (launch). Release while still = gentle drop.

## Character model: the board
- The character is a flat board: a thick, round-capped line segment that pivots at the player's center (rendered blue normally, green while holding).
- It has a length (tip-to-tip) and a thickness. Collision treats it as a **capsule** (the segment plus its thickness).
- The pivot is kept inside the arena, but the board's tips may overhang the walls a little when it spins near an edge.

## Catch / hold mechanic
- Contact happens when the ball touches the board capsule. A catch succeeds only if left-click is held at that moment.
- On catch, the ball **locks** to the face it touched, at the point along the board where contact happened (recorded as an offset `s` from the pivot, plus which side/face).
- While held it does **not** slide and does **not** fly off on its own, no matter how hard you spin. It simply rides with the board. This lets you deliberately grab the ball (e.g. in a corner), turn around, carry it to the other side, and then flick — the hold is fully under player control.
- Where along the board you grabbed it matters: a grab nearer the **tip** is a longer lever arm, so it flicks harder. Nearer the center = weaker. (A small built-in skill expression.)

## Flick mechanic (the central mechanic — this is the game)
- The flick is triggered by **releasing** left-click, not by a separate aim/power input.
- On release, the ball launches with the **real velocity of its contact point at that instant**: the rotation about the pivot (`angular velocity × lever arm`), plus the player's running velocity. Because the ball sits out on the board's face, that velocity points roughly along the board's **normal** — i.e. the side of the board shoves it away.
- Release mid-fast-spin = a hard flick; release while barely moving = a soft drop. Direction and power are both encoded by the swing, exactly like an object let go off the end of a bat.
- Spin speed is capped, which caps maximum flick power.

## Dead-board absorb (why a still board kills the ball)
- A core decision to make the flick *the only real way to put speed on the ball*: when a free ball hits the board, the game kills the ball's velocity **relative to the board's moving surface**.
  - A **still** board → the ball drops dead against it (almost no bounce, slide gripped away). You can't farm momentum by passively bouncing the ball off yourself.
  - A **moving / spinning** board → the ball inherits the surface's motion, so a swing still smacks a loose ball.
- This is continuous (no on/off threshold): the faster the board's surface is moving at the contact point, the more it drives the ball; at rest it absorbs.

## Arena / bounce
- A bounded rectangular space with solid walls.
- Free balls coast with light friction and bounce off walls, losing a meaningful chunk of speed on each wall hit (tuned down from elastic so loose balls settle rather than pinball forever).

## Enemies (not yet designed)
- Same as the original plan: likely start as simple stationary targets the ball can hit and kill, with richer behavior designed later once the core flick feels good.
- Still out of scope for the prototype.

## Tuning knobs (live in `index.html`, the `CFG` block)
Left intentionally open for hands-on playtesting rather than decided in the abstract:
- `BOARD_LENGTH`, `BOARD_THICKNESS` — board size / lever range.
- `ROTATION_SENSITIVITY`, `MAX_ANGULAR_VELOCITY` — spin feel and the cap on flick power.
- `BOARD_GRIP` — how dead a still board is (toward 1 = full dead-stop).
- `PLAYER_RESTITUTION` — the faint bounce left in a still board.
- `WALL_RESTITUTION`, `BALL_FRICTION` — how lively loose balls are.
- `PLAYER_SPEED`, `ADD_PLAYER_VELOCITY_ON_THROW`, `RELEASE_NUDGE`.

## What changed from the original design (v1 → v2)
- **Character:** round body → flat board (bat/paddle).
- **Throw:** ball orbited the body and kept its tangential velocity on release → ball is locked to the board while held and launches off the board's face when you release mid-swing.
- **Hold:** "ball orbits with you and can be thrown anytime by releasing" → "ball is pinned and stays put until you choose to flick; you can carry/reposition it freely."
- **New rule:** a still board **absorbs** the ball (kills its momentum) instead of bouncing it elastically — making the flick the only real source of ball speed.
- **Feel:** overall ball speed lowered and more energy lost per bounce.
- **Removed:** the "set straight up" (Space) action from v1.
- **Carried over:** keyboard + mouse, horizontal-drag spin, WASD independent of rotation, catch-only-while-holding, throw velocity comes from real physics (not a fake aim vector), tiny first-build scope (no enemies/health/scoring/sound yet).

## Open questions / undecided, for future sessions
- Enemies: behavior beyond stationary targets (movement, attacks, health, variety); whether they interact with bounce physics.
- Arena: size, shape, obstacles, hazards, multiple levels.
- Scoring, win/lose conditions, lives, difficulty progression.
- What happens to the ball after it kills an enemy (keep flying / stop / respawn).
- Whether catching should become more skillful later (e.g. having to match the ball's speed to catch it, instead of the current reliable hold-to-stick).
- Visual/art style, sound design, UI/HUD.
- Final tuning values for the knobs above.

## Related files
- [`game_concept_v1_ball-spin-throw.md`](game_concept_v1_ball-spin-throw.md): the original (superseded) ball + orbit-spin design, kept verbatim for history.
- `game_prototype_prompt.md`: the literal build prompt for the first playable prototype (describes the original v1 mechanic).
- `../index.html`: the live prototype implementing this current design.
