import { Pane } from 'tweakpane';
import { DEFAULT_PRESET, PHYSICS_PRESETS, type PhysicsConfig, type PhysicsPresetName } from '../config';
import type { GameReadyPayload } from '../game';

/**
 * Dev-only physics tuning panel (Tweakpane). Binds directly to the live, mutable
 * PhysicsConfig so edits take effect on the very next frame, exposes every
 * constant the brief calls for, plus live readouts (speed, slip angle, drift
 * state, axle loads, tire saturation) and named presets.
 *
 * This whole module is imported behind `import.meta.env.DEV` so Tweakpane and the
 * panel are stripped from production bundles entirely.
 */
export interface TuningPanelHandle {
  toggle(): void;
  destroy(): void;
}

export function createTuningPanel(payload: GameReadyPayload): TuningPanelHandle {
  const { config, car, applyPreset } = payload;

  const container = document.createElement('div');
  Object.assign(container.style, {
    position: 'fixed',
    top: '12px',
    right: '12px',
    width: '290px',
    maxHeight: 'calc(100vh - 24px)',
    overflowY: 'auto',
    zIndex: '9999',
    display: 'none', // hidden until the dev presses ` (backtick)
  } satisfies Partial<CSSStyleDeclaration>);
  document.body.appendChild(container);

  const pane = new Pane({ title: 'NIGHTSLIDE · TUNE', container });

  // ── presets ──────────────────────────────────────────────────────────────
  const presetState = { preset: DEFAULT_PRESET as PhysicsPresetName };
  const fPreset = pane.addFolder({ title: 'Preset' });
  fPreset
    .addBinding(presetState, 'preset', {
      options: Object.fromEntries(Object.keys(PHYSICS_PRESETS).map((k) => [k, k])),
    })
    .on('change', (ev) => {
      applyPreset(ev.value);
      pane.refresh();
    });

  // ── live readouts ──────────────────────────────────────────────────────────
  const readout = {
    speed: 0,
    slipDeg: 0,
    drift: 'NO',
    loadFront: 0.5,
    loadRear: 0.5,
    satFront: 0,
    satRear: 0,
    yaw: 0,
  };
  const fRead = pane.addFolder({ title: 'Live Telemetry' });
  fRead.addBinding(readout, 'speed', { readonly: true, view: 'graph', min: 0, max: 700 });
  fRead.addBinding(readout, 'slipDeg', { readonly: true, view: 'graph', min: -90, max: 90 });
  fRead.addBinding(readout, 'drift', { readonly: true });
  fRead.addBinding(readout, 'satRear', { readonly: true, min: 0, max: 1 });
  fRead.addBinding(readout, 'satFront', { readonly: true, min: 0, max: 1 });
  fRead.addBinding(readout, 'loadFront', { readonly: true, min: 0, max: 1 });
  fRead.addBinding(readout, 'loadRear', { readonly: true, min: 0, max: 1 });
  fRead.addBinding(readout, 'yaw', { readonly: true });

  // ── editable params, grouped ────────────────────────────────────────────────
  const bind = (
    folder: ReturnType<Pane['addFolder']>,
    key: keyof PhysicsConfig,
    min: number,
    max: number,
    step: number,
  ) => folder.addBinding(config, key, { min, max, step });

  const fGeo = pane.addFolder({ title: 'Mass & Geometry', expanded: false });
  bind(fGeo, 'mass', 0.4, 3, 0.05);
  bind(fGeo, 'yawInertia', 0.2, 3, 0.05);
  bind(fGeo, 'wheelBase', 20, 90, 1);
  bind(fGeo, 'cgToFront', 8, 60, 1);
  bind(fGeo, 'cgToRear', 8, 60, 1);
  bind(fGeo, 'weightBalance', 0.3, 0.7, 0.01);
  bind(fGeo, 'cgHeight', 4, 40, 1);

  const fEng = pane.addFolder({ title: 'Engine & Longitudinal', expanded: false });
  bind(fEng, 'enginePower', 0, 2000, 10);
  bind(fEng, 'reversePower', 0, 1000, 10);
  bind(fEng, 'brakeStrength', 0, 3000, 10);
  bind(fEng, 'topSpeed', 100, 1000, 10);
  bind(fEng, 'dragCoef', 0, 0.01, 0.0001);
  bind(fEng, 'rollResist', 0, 5, 0.05);
  bind(fEng, 'idleDecel', 0, 800, 10);

  const fSteer = pane.addFolder({ title: 'Steering', expanded: false });
  bind(fSteer, 'maxSteer', 0.1, 1.2, 0.01);
  bind(fSteer, 'steerRate', 1, 20, 0.5);
  bind(fSteer, 'steerReturnRate', 1, 20, 0.5);
  bind(fSteer, 'steerSpeedReduction', 0, 1, 0.01);

  const fTire = pane.addFolder({ title: 'Tires / Grip', expanded: true });
  bind(fTire, 'baseGrip', 0.3, 2, 0.01);
  bind(fTire, 'frontGripMax', 200, 2500, 10);
  bind(fTire, 'rearGripMax', 200, 2500, 10);
  bind(fTire, 'tireStiffnessFront', 1, 14, 0.1);
  bind(fTire, 'tireStiffnessRear', 1, 14, 0.1);
  bind(fTire, 'tireShape', 1, 1.9, 0.01);
  bind(fTire, 'gripSpeedFalloff', 0, 0.6, 0.01);
  bind(fTire, 'loadSensitivity', 0, 1.5, 0.01);

  const fWT = pane.addFolder({ title: 'Weight Transfer', expanded: false });
  bind(fWT, 'weightTransferGain', 0, 1, 0.01);
  bind(fWT, 'weightTransferRate', 1, 20, 0.5);
  bind(fWT, 'maxWeightTransfer', 0, 0.45, 0.01);

  const fHB = pane.addFolder({ title: 'Handbrake & Aids', expanded: true });
  bind(fHB, 'handbrakeGripMult', 0, 1, 0.01);
  bind(fHB, 'handbrakeForce', 0, 1500, 10);
  bind(fHB, 'throttleSteerHold', 0, 1, 0.01);
  bind(fHB, 'minRearGrip', 0.05, 1, 0.01);
  bind(fHB, 'straightenGripBoost', 0, 1, 0.01);
  bind(fHB, 'driftAssist', 0, 1, 0.01);

  const fStab = pane.addFolder({ title: 'Stability', expanded: false });
  bind(fStab, 'yawDamp', 0, 8, 0.1);
  bind(fStab, 'lowSpeedThreshold', 2, 60, 1);
  bind(fStab, 'velocityClamp', 200, 1200, 10);
  bind(fStab, 'maxAngularVelocity', 2, 14, 0.1);

  const fDrift = pane.addFolder({ title: 'Drift Detection', expanded: false });
  bind(fDrift, 'driftSlipThreshold', 0.05, 0.6, 0.01);
  bind(fDrift, 'driftSpeedThreshold', 20, 300, 5);

  // ── per-frame refresh of readouts ───────────────────────────────────────────
  let raf = 0;
  const tick = () => {
    const s = car.getState();
    readout.speed = Math.round(s.speed);
    readout.slipDeg = Math.round(s.slipAngleDeg);
    readout.drift = s.isDrifting ? `YES (${s.driftDirection > 0 ? 'R' : 'L'})` : 'no';
    readout.loadFront = +s.loadFront.toFixed(2);
    readout.loadRear = +s.loadRear.toFixed(2);
    readout.satFront = +s.frontSlipSaturation.toFixed(2);
    readout.satRear = +s.rearSlipSaturation.toFixed(2);
    readout.yaw = +s.angularVelocity.toFixed(2);
    pane.refresh();
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  let visible = false;
  return {
    toggle() {
      visible = !visible;
      container.style.display = visible ? 'block' : 'none';
    },
    destroy() {
      cancelAnimationFrame(raf);
      pane.dispose();
      container.remove();
    },
  };
}
