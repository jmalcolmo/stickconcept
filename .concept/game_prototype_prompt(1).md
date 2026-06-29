# Prototype: Spin-Throw Arena Game

Build a small playable prototype of a top-down arena game. Focus only on the core mechanic below, no enemies, no levels, no UI polish yet.

## Stack
Use whatever you think fits best for a fast 2D physics prototype (e.g. HTML5 Canvas + JS, or a simple game framework). Single player, single screen, no build pipeline needed if avoidable. Optimize for fast iteration.

## Core entities
- **Player**: a circle (or simple shape) that moves around the arena.
- **Ball**: a separate physics object that can roll/bounce freely around the arena, bouncing off walls.
- **Arena**: a bounded rectangular space with solid walls the ball bounces off of.

## Controls
- **WASD**: moves the player around the arena. Movement is fully independent of rotation/spin below, it does not affect or get affected by the player's current rotation.
- **Mouse horizontal movement (drag left/right)**: rotates the player. Dragging the mouse to one side spins the player one direction, dragging to the other side spins it the other direction. Vertical mouse movement is ignored.
- **Left mouse button (hold/release)**: controls whether the player is holding the ball, see catch/throw logic below.

## Catch mechanic
- If the player's circle touches the ball's circle (whether the player walks into a stationary ball, or a moving ball collides into the player) AND the left mouse button is held down at the moment of contact, the player catches the ball.
- If left mouse button is NOT held at the moment of contact, the ball simply bounces off the player like a wall/obstacle, no catch occurs.

## Holding and spinning mechanic
- Once caught, the ball attaches to a fixed point on the circumference of the player's circle (i.e. the ball sits on the edge of the player, not the center).
- While left mouse button is held, the player can continue to move (WASD) and rotate (mouse horizontal drag). As the player rotates, the ball rotates with it, staying fixed on the circumference, like a ball on a string orbiting the player.
- The rotation speed (angular velocity) driven by mouse drag should feel controllable and should be trackable as a real velocity value (not just a position snap), since it determines throw power.

## Throw mechanic
- When the player releases the left mouse button while holding the ball, the ball is launched.
- The launch velocity is the ball's actual tangential velocity at the exact moment of release, i.e. whatever direction and speed the ball was physically moving as a point orbiting the player's circumference (a function of angular velocity and orbit radius at that instant). Do not fake this with a separate "facing direction" launch, derive it from the real orbit physics.
- After release, the ball becomes a free physics object again, continuing in that direction/speed and bouncing off arena walls.

## Out of scope for this prototype
- Enemies, health, damage, scoring
- Multiple balls
- Menus, UI, sound
- Anything beyond: move, catch, spin, throw, bounce off walls

## Goal of this build
A single playable scene where I can: walk up to a stationary ball, hold left-click and catch it, drag the mouse left/right to spin up velocity while the ball orbits me, then release left-click and watch the ball fly off in the direction/speed determined by that spin, then bounce realistically off the arena walls.

Please implement this, then briefly note any physics tuning values (rotation speed sensitivity, orbit radius, wall bounce damping) you used so I can easily tweak them.
