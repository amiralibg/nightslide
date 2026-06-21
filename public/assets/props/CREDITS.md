# Prop / obstacle sprite credits

Top-down obstacle and parked-car sprites in this folder are from the **Racing Pack**
by **Kenney** (kenney.nl).

- Source: https://opengameart.org/content/racing-pack · https://kenney.nl/assets/racing-pack
- License: **CC0 1.0 (Public Domain)** — attribution not required; credited as a courtesy
  ("Credit to Kenney.nl is requested but not mandatory").

Files:
- `tires.png` / `tires-white.png` — tire-stack obstacles (from `Objects/tires_red|white`).
- `barrier.png` — race barrier (`Objects/barrier_red_race`).
- `cone.png`, `barrel.png` — track furniture.
- `parked-1..8.png` — top-down cars (`Cars/car_*`) used as static parked cars in the Parking Lot.

These are loaded in `BootScene.preload()` under `prop-*` texture keys and drawn by
`Arena.drawProp()` when a `SolidRect` carries a `sprite`. Any prop without a `sprite`
falls back to the procedural rendering, so removing/renaming a file never breaks a map.
