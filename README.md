<p align="center"><img src="public/assets/physick-logo.svg" alt="Physick" width="520"></p>

**Physick** is a naval game built with [three.js](https://threejs.org) and [Rapier](https://rapier.rs). You start aboard a destroyer moored at a naval air station: walk her decks, take the helm and sail her out, man her guns, or walk down the gangway and fly a fighter jet off the airfield.

## Controls

**On deck**
- `W A S D` walk, `Shift` run, `Space` jump
- `LMB` pick up the item you're looking at (it's held in your robot-arm hand); `LMB` again to put it down where you're looking
- `RMB` throw the held item, `F` use it (medkits heal, coffee perks you up)
- `E` take the helm (on the bridge, behind the wheel) or man a gun (stand behind it)
- `Esc` pause

**In a jet** (walk up to one on the airfield and press `E`)
- `W` / `S` throttle, `Shift` afterburner (at full throttle)
- Mouse to pitch and roll (the stick re-centres when you stop moving the mouse), `A` / `D` rudder and nosewheel steering
- `B` (or `Space`) brakes, `G` landing gear, `LMB` cannon, `C` cockpit / chase view
- `E` to climb out once you've landed and stopped
- Take off: line up on the runway, full throttle (+ afterburner), and pull back gently once you pass ~115 kn. Land: gear down, about 135 kn, a gentle descent onto the runway, then brakes.

**On a gun**
- Mouse to train and elevate, `LMB` to fire (hold for the CIWS), `E` to step away
- The 5-inch gun forward fires shells on a ballistic arc; the two CIWS mounts on the 01 deck aft fire tracer streams over their own side and astern
- Sink the red-and-white target rafts floating around the ship

**At the helm**
- `W` / `S` move the engine order telegraph up / down (BACK 1/3, STOP, AHEAD 1/3, 2/3, FULL, FLANK)
- `A` / `D` put the rudder over to port / starboard (it eases back amidships when you let go)
- `H` sound the ship's horn
- `E` leave the helm

**Going ashore:** while the ship is moored, walk to the gangway amidships on the side facing the quay and press `E`. Press `E` at the foot of the gangway to come back aboard. Sail away by ringing up the engines at the helm; to moor again, bring her back alongside the quay, slowly and roughly parallel, and ring STOP.

**Getting below:** the doorways in the middle of the superstructure, on both sides of the main deck.

**Getting to the bridge:** from the flight deck at the stern, walk forward along either side of the hangar, climb the stairs amidships to the 01 level, go forward between the funnels and the boats, and through the door at the back of the bridge.

## What's in it

- **Ocean:** Gerstner waves in a shader, with a matching CPU wave function so the ship heaves, pitches and rolls on the waves you see. Bow wave, Kelvin wake and churned water astern scale with speed.
- **The ship:** a procedural destroyer: lofted hull with hull number, walkable main deck, 5-inch gun, VLS, superstructure with stairs, two funnels, boats, CIWS, hangar and flight deck, a mast with spinning radar, and an enclosed bridge with consoles, wheel and engine telegraph. She heels into turns.
- **Interior:** doorways amidships on both sides open into a cross passage, with the crew mess forward (tables, galley, mugs and rations) and the storeroom aft (shelving racks and lockers stocked with ammo boxes, toolboxes, medkits, extinguishers, jerry cans, life jackets, rope, spare shells and more). Everything can be picked up, carried, re-shelved or thrown.
- **Your hand:** a robotic arm; whatever you pick up is shown clamped in its gripper.
- **Gunnery:** man the 5-inch gun or either CIWS; rounds fly in world space with gravity and the ship's own speed, splash into the sea and blow up target rafts.
- **Naval air station:** a quay with bollards and lamp posts, an apron with three hangars, a control tower, container stacks and fuel tanks, a 1.3 km runway with a parallel taxiway, and a windsock. It has its own physics world, so you can walk around it while the ship sails off.
- **Fighter jets:** procedural twin-tail navy fighters with a physical-ish flight model (thrust, drag, lift from angle of attack, stalls), taxiing, take-off, landing (or crashing), afterburners, a nose cannon that can hit the target rafts, flight HUD with flight-path marker and STALL / PULL UP warnings. Wrecked jets are replaced after a while.
- **Crew:** sailors in working uniforms, cranials and dixie cups wander the main deck and stop to look at you when you walk up to them.
- **Health:** fall damage and going overboard hurt; health regenerates; dying respawns you on the flight deck.

Physics runs in the ship's own frame (the ship is static there) and the whole frame is moved on the ocean for rendering, so walking on a rolling deck is solid.

## Running it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static build in dist/
```

Pushing to `main` deploys to GitHub Pages through the included workflow.

## Project layout

```
src/
  main.js      setup, camera, input, main loop
  ocean.js     Gerstner wave shader + CPU wave sampler + wake foam
  ship.js      procedural warship, interior, colliders, helm and ship motion
  guns.js      manning guns, shells/tracers, splashes, explosions, target rafts
  port.js      the naval air station (world frame, own physics world)
  jets.js      fighter jets: model, flight model, cameras, cannon
  items.js     grabbable storage items
  viewmodel.js the robot-arm hand (and what it's holding)
  player.js    first-person character controller
  npcs.js      crew (wander, react, ragdoll)
  figure.js    blocky person model with navy uniforms
  health.js    health, damage, death/respawn
  hud.js       compass, helm readout, health, prompts
  sandbox.js   static colliders and physics props
  effects.js   particles
  audio.js     synthesized sounds (sea, engines, horn, telegraph)
  groups.js    collision groups
```
