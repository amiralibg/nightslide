import type Phaser from 'phaser';
import { ShellApp } from './ShellApp';
import './styles.css';

/**
 * Mounts the premium DOM shell: the intro reveal, landing, mode select, pause +
 * results screens, the in-run HUD + score pops, a custom cursor and UI sound —
 * all driven off the game bus. See {@link ShellApp}.
 */
export function mountShell(shellRoot: HTMLElement, bus: Phaser.Events.EventEmitter): ShellApp {
  return new ShellApp(shellRoot, bus);
}
