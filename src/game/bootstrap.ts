import Phaser from 'phaser';
import { PALETTE, RUNTIME } from '../config';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';

/**
 * Boots the Phaser game into `parentId`. Keyboard and gamepad are handled by our
 * own engine-agnostic InputManager (DOM + Gamepad API), so Phaser's own input is
 * left to pointer/touch only.
 *
 * `pixelArt: true` is the whole reason the sprites stay crisp: it forces
 * nearest-neighbour texture sampling and disables canvas antialiasing.
 *
 * Scale mode is RESIZE so the canvas always fills the whole window (no 16:9
 * letterbox) — the camera zoom keeps the pixels chunky and the visible slice of
 * the arena adapts to the viewport.
 */
export function createGame(parentId: string): Phaser.Game {
  const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    parent: parentId,
    width: RUNTIME.gameWidth,
    height: RUNTIME.gameHeight,
    backgroundColor: PALETTE.void,
    pixelArt: true,
    roundPixels: true,
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    fps: { target: 60 },
    scene: [BootScene, GameScene],
  };

  return new Phaser.Game(config);
}
