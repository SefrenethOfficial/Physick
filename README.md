<p align="center"><img src="public/assets/physick-logo.svg" alt="Physick" width="520"></p>

**Physick** is now a naval game built with [three.js](https://threejs.org) and [Rapier](https://rapier.rs). You're aboard a destroyer under way on the open ocean: walk her decks, climb up to the bridge, and take the helm.

## Controls

**On deck**
- `W A S D` walk, `Shift` run, `Space` jump
- `E` take the helm (on the bridge, behind the wheel)
- `V` noclip (fly around the ship), `Esc` pause

**At the helm**
- `W` / `S` move the engine order telegraph up / down (BACK 1/3, STOP, AHEAD 1/3, 2/3, FULL, FLANK)
- `A` / `D` put the rudder over to port / starboard (it eases back amidships when you let go)
- `H` sound the ship's horn
- `E` leave the helm

**Getting to the bridge:** from the flight deck at the stern, walk forward along either side of the hangar, climb the stairs amidships to the 01 level, go forward between the funnels and the boats, and through the door at the back of the bridge.

## What's in it

- **Ocean:** Gerstner waves in a shader, with a matching CPU wave function so the ship heaves, pitches and rolls on the waves you see. Bow wave, Kelvin wake and churned water astern scale with speed.
- **The ship:** a procedural destroyer: lofted hull with hull number, walkable main deck, 5-inch gun, VLS, superstructure with stairs, two funnels, boats, CIWS, hangar and flight deck, a mast with spinning radar, and an enclosed bridge with consoles, wheel and engine telegraph. She heels into turns.
- **Crew:** sailors in working uniforms, cranials and dixie cups wander the main deck and get out of your way when you run at them.
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
  ship.js      procedural warship, colliders, helm and ship motion
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
