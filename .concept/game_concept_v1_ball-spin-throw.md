> **STATUS: SUPERSEDED (archived June 2026).** This is the *original* design — a round
> character that builds throw power by spinning a ball around its circumference and releasing
> it with the ball's tangential (orbit) velocity. It was replaced during prototyping by the
> **board + flick** model. See [`game_concept_reference.md`](game_concept_reference.md) for the
> current, live design. This file is kept verbatim so the original reasoning isn't lost.

---

# Game Concept: Spin-Throw Arena Game

## High-level pitch
Top-down arena game. You play a small character whose only way to kill enemies is by throwing a ball at them. The entire game is built around one core mechanic: catching a ball, building up throw power by spinning your character, and releasing it at the right moment to launch the ball with real physics-driven velocity. No guns, no abstract aiming reticle, the throw direction and speed come directly from how you spun.

This doc exists to capture the full concept and every design decision made so far, separate from the actual build prompt (see `game_prototype_prompt.md` for the literal prompt handed to Claude Code for the first prototype).

## Core loop
1. Player moves around an arena.
2. A ball exists as a free physics object, it can roll and bounce off walls and characters.
3. Player catches the ball by making contact with it (walking into it, or it rolling into them) while choosing to catch.
4. While holding the ball, player spins themselves, which spins the ball with them.
5. Player releases the ball mid-spin, launching it based on the spin's actual velocity at that moment.
6. Ball flies off, bounces around the arena, and (eventually) damages/kills enemies on contact.

## Controls (current decision, keyboard + mouse)
- **WASD**: moves the player around the arena. Fully independent of rotation, movement and spin don't affect each other.
- **Mouse horizontal drag (left/right)**: controls player rotation/spin. Dragging one direction spins the player one way, the other direction spins the opposite way. Vertical mouse movement does nothing.
  - Note: original idea was vertical drag (up = rotate left, down = rotate right), but this was changed to horizontal drag because it's physically easier to do with a mouse.
- **Left mouse button (hold/release)**: controls catching and throwing.
  - Hold left-click + touch the ball = catch it.
  - Walk into the ball WITHOUT holding left-click = ball just bounces off you like an obstacle, no catch.
  - Keep holding left-click while spinning = ball stays attached and orbits with you.
  - Release left-click while spinning = ball launches.

## Catch mechanic details
- Contact can happen two ways: player walks up and touches a stationary/slow ball, or a moving ball collides into the player.
- Catch only succeeds if left mouse button is held down at the moment of contact.
- If not held, the ball behaves like it hit a wall/obstacle and bounces off normally.

## Holding / spinning mechanic details
- Once caught, the ball doesn't snap to the player's center, it attaches to a point on the circumference of the player's circle/body, like it's sitting on the edge of them.
- When the player spins (via mouse drag), the entire player + ball system rotates together. The player's body visibly rotates, not just the ball.
- Visually, while spinning with the ball held, the ball looks like an extension of the character, orbiting around them at a fixed radius (the player's circumference).
- The rotation should be tracked as a real angular velocity (not just a snapped position), because that velocity is what determines throw power later.

## Throw mechanic details (the key design insight)
- This was the central question we worked through: what determines the ball's launch direction, the way the character is facing, or the spin itself?
- Resolved answer: neither is a separate fake input. Since the ball sits on the circumference and orbits with the player, it already has a real tangential velocity at every instant, just like an object on a string. On release, the ball simply keeps whatever direction and speed it physically had at that exact moment, derived naturally from angular velocity and orbit radius.
- This means there's no need for a separate "aim direction" or "power meter" system, the physics of the orbiting ball already encodes both direction and power based on timing of release.
- After release the ball becomes a fully free physics object again and bounces off arena walls like normal.

## Enemies (not yet designed)
- Original idea: enemies will likely start as simple stationary targets, just objects the ball can hit and kill, with more complex enemy behavior to be designed later once the core throw mechanic feels good.
- Explicitly out of scope for the first prototype. To be revisited after the core mechanic is validated and feels fun.

## Arena
- A bounded rectangular space with solid walls.
- Ball bounces off walls (and presumably off enemies once they exist).
- No other arena details decided yet (size, obstacles, hazards, multiple rooms, etc. all undecided).

## Decisions explicitly made during this conversation
- Input scheme is keyboard + mouse (not controller, that was an earlier idea that got replaced).
- Mouse rotation control is horizontal drag, not vertical.
- Ball launch velocity = real orbit/tangential velocity at release, not facing direction, not a separate calculated throw vector.
- Player visibly rotates along with the ball when spinning while holding it (not just the ball spinning around a stationary-facing player).
- Movement (WASD) and rotation/spin (mouse) are fully independent systems, neither affects the other.
- First build scope is intentionally tiny: movement, catch, spin/hold, throw, and wall bounce only. No enemies, no health, no scoring, no UI, no sound, no multiple balls.

## Open questions / undecided, for future sessions
- What enemies actually do beyond being stationary targets (movement patterns, attacks, health, variety).
- Whether enemies themselves interact with the ball's bounce physics (the prototype prompt only specifies walls for now).
- Arena size, shape, layout, obstacles, multiple arenas/levels.
- Scoring, win/lose conditions, lives, difficulty progression.
- What happens to the ball after it kills an enemy, does it keep flying, stop, respawn elsewhere.
- Visual/art style, sound design, UI/HUD.
- Tuning values for rotation sensitivity, orbit radius, and wall bounce damping, deliberately left for hands-on playtesting once the prototype exists rather than decided in the abstract.

## Related files
- `game_prototype_prompt.md`: the actual literal prompt written for Claude Code to build the first playable prototype covering just movement, catch, spin, and throw mechanics with real orbit-physics-based launch velocity.
