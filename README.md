<p align="center"><img src="public/assets/physick-logo.svg" alt="Physick" width="520"></p>

**Physick** is a browser physics sandbox built with [three.js](https://threejs.org) and [Rapier](https://rapier.rs). Spawn props, blast them, weld them into contraptions and fling them around with a robotic arm.

## Modes

| Key | Mode | What it does |
| --- | --- | --- |
| `1` | **Gunner** | LMB (hold) fires a hitscan blaster that knocks props around. RMB launches a heavy cannonball. `R` deletes the prop you're aiming at. |
| `2` | **Weld** | Click a prop, then click a second prop to weld them together. Click the ground instead to weld to the world. RMB strips every weld off a prop. `R` cancels the selection. |
| `3` | **Move** | Hold LMB to grab a prop with the beam. Mouse wheel pushes/pulls it. Stand on a prop, look down and grab it to ride it and fly (scroll in to climb, out to sink, tilt your view to steer), hold `E` and move the mouse to rotate it, RMB freezes it in mid-air (the whole welded group freezes together). `R` unfreezes what you're aiming at. |

You can also switch modes with the mouse wheel (when you're not holding something) or by clicking the mode bar.

## Quad bikes

Walk up to a quad (or look at one) and press `E` to ride it. `W`/`S` throttle and brake/reverse, `A`/`D` steer, `Shift` boost, `Space` handbrake, mouse to look around, `H` or left-click to honk, `R` to flip it back upright, `E` to get off. There are quads in the middle of town and at the jump park on the east side. You can also spawn more from the `Q` menu.

## Health and people

You have 100 health. Long falls, props flying into you and crashing the quad all hurt. Health regenerates after a few seconds without damage. If you die you respawn after a moment.

Townspeople wander around the map. They run from danger (gunfire, honking, a quad heading their way). Hit them with anything fast (a quad, a thrown crate, a cannonball) or shoot them enough and they go ragdoll. Ragdolls are ordinary props, so Move, Weld and freeze work on them. Grabbing or welding a person with Move/Weld ragdolls them too.

## Map

The original sandbox pad sits in the middle of a small town: a ring road with houses and trees around it, plus a dirt jump park east of the ring with kickers, a tabletop and a mound.

## Other controls

- `W A S D` move, `Space` jump, `Shift` sprint
- `Q` spawn menu (Shift+click to spawn several at once, plus *Clear all* and *Reset map*)
- `E` ride a quad bike
- `Z` undo last spawn
- `V` noclip (fly with `Space` / `C`)
- `Esc` pause

## Running it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static build in dist/
```

The included GitHub Actions workflow publishes `dist/` to GitHub Pages on every push to `main`. To turn it on, go to **Settings → Pages** and set **Source** to **GitHub Actions**.

## Project layout

```
src/
  main.js        game setup, level, input, main loop
  sandbox.js     props, static world, welds, freezing, raycasts
  props.js       spawnable prop definitions (incl. the robot arm)
  player.js      first-person character controller
  viewmodel.js   the robot arm you hold, rendered as an overlay
  effects.js     sparks, tracers, bullet holes, beams, weld markers
  audio.js       synthesized sound effects
  hud.js         HUD, toasts, spawn menu, title screen
  tools/         gunner.js, weld.js, move.js
  vehicle.js     quad bike prop + driving controls/camera
  npcs.js        wandering townspeople and ragdolls
  figure.js      blocky person model (NPCs, quad rider)
  health.js      player health, damage, death/respawn
  town.js        roads, houses, trees, jump park
  groups.js      collision groups
public/assets/   logo + robotic arm model
```

Adding a prop means adding an entry to `PROPS` in `src/props.js`: a `build()` that returns a mesh plus Rapier collider descriptions. Adding a mode means writing a class in `src/tools/` with `primaryDown`/`secondaryDown`/`update`/`deactivate` and adding it to `this.tools` in `main.js`.
