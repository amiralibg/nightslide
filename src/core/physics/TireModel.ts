/**
 * TireModel — the slip→grip curve, isolated so it's easy to reason about and tune.
 *
 * THE IDEA: a tire makes lateral (sideways) force from its SLIP ANGLE — the angle
 * between where it points and where it's actually travelling — rising to a PEAK,
 * then FALLING OFF as it's overwhelmed. That falloff is the whole game: past the
 * peak the rear makes *less* grip the more it slides, so a slide can settle and be
 * held instead of snapping back to grip. We use a simplified Pacejka curve:
 *
 *     latAccel = -peak * sin(shape * atan(stiffness * slipAngle))
 *
 *   • near zero slip it's ~linear with slope `peak * shape * stiffness` (grip),
 *   • |force| peaks at 1·peak where `shape·atan(stiffness·slip) = π/2`,
 *   • beyond that it DECAYS toward `sin(shape·π/2)·peak` (the sliding-grip plateau).
 *
 * `stiffness` (Pacejka B) sets how quickly grip builds; `shape` (Pacejka C, ~1.3–1.6)
 * sets how far force falls past the peak — the larger it is, the more the tire
 * "gives up" in a slide, which is what makes drifts sustainable. `peak` is the
 * available grip, scaled by the caller for load, speed and the handbrake.
 */

export interface TireForce {
  /** Lateral acceleration produced (px/s^2). Opposes the slip direction. */
  latAccel: number;
  /** How hard the tire is sliding, 0 (gripping) .. 1 (fully sideways). Drives FX. */
  saturation: number;
}

/** Slip angle (rad) treated as "fully sliding" for the FX saturation readout. */
const SLIDE_REF = 0.5;

/**
 * @param slipAngle  Tire slip angle (rad).
 * @param peak       Peak lateral acceleration available to this tire (px/s^2).
 * @param stiffness  Pacejka B — initial grip build-up rate.
 * @param shape      Pacejka C — curve shape / how much force falls past the peak.
 */
export function tireLateralForce(slipAngle: number, peak: number, stiffness: number, shape: number): TireForce {
  const force = Math.sin(shape * Math.atan(stiffness * slipAngle)); // rises to ±1, then falls back
  return {
    latAccel: -peak * force,
    saturation: Math.min(1, Math.abs(slipAngle) / SLIDE_REF),
  };
}
