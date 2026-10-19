<p align="center"><img src="public/assets/physick-logo.svg" alt="Physick" width="520"></p>

**Physick** is a browser physics sandbox built with [three.js](https://threejs.org) and [Rapier](https://rapier.rs). Spawn props, blast them, weld them into contraptions and fling them around with a robotic arm.

## Modes

| Key | Mode | What it does |
| --- | --- | --- |
| `1` | **Gunner** | LMB (hold) fires a hitscan blaster that knocks props around. RMB launches a heavy cannonball. `R` deletes the prop you're aiming at. |
| `2` | **Weld** | Click a prop, then click a second prop to weld them together. Click the ground instead to weld to the world. RMB strips every weld off a prop. `R` cancels the selection. |
| `3` | **Move** | Hold LMB to grab a prop with the beam. Mouse wheel pushes/pulls it, hold `E` and move the mouse to rotate it, RMB freezes it in mid-air (the whole welded group freezes together). `R` unfreezes what you're aiming at. |

You can also switch modes with the mouse wheel (when you're not holding something) or by clicking the mode bar.

## Other controls

- `W A S D` move, `Space` jump, `Shift` sprint
- `Q` spawn menu (Shift+click to spawn several at once, plus *Clear all* and *Reset map*)
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
public/assets/   logo + robotic arm model
```

Adding a prop means adding an entry to `PROPS` in `src/props.js`: a `build()` that returns a mesh plus Rapier collider descriptions. Adding a mode means writing a class in `src/tools/` with `primaryDown`/`secondaryDown`/`update`/`deactivate` and adding it to `this.tools` in `main.js`.
