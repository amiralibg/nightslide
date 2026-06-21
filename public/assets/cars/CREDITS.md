# Car sprite credits

The in-game car sprites (`viper.png`, `bolt.png`, `brute.png`, `pip.png`) and their
garage thumbnails (`*_chip.png`) are derived from the **"Free Top Down Car Sprites"**
pack by **Unlucky Studio**.

- Source: https://opengameart.org/content/free-top-down-car-sprites-by-unlucky-studio
- License: **CC0 1.0 (Public Domain)** — no attribution required; credited here as a courtesy.

Processing applied: rotated 90° so the nose points +x (the sim's heading-0
convention), center-cropped and resized to the game's 200×100 sprite layout; upright
160×80 thumbnails generated for the garage chips.

Mapping: Nightviper ← Audi · Voltbolt ← Black_viper · Brute ← Car · Pip ← taxi.

Any car without a `spriteAsset` (see `src/config/cars.ts`) falls back to the
procedural art in `src/game/CarArt.ts`, so dropping in new CC0/AI sprites is
zero-risk: add the PNG here and point the model's `spriteAsset` at it.
