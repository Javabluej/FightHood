export const FIXED_DELTA_TIME = 1 / 60;
export const GRAVITY = 24.0;
export const STAGE_BOUND_X = 6.45;
export const STAGE_FLOOR_Y = 0.0;
export const PUSHBOX_MIN_DIST = 0.72;
export const CORNER_PUSH_THRESHOLD = 6.45;

export function clampStagePosition(x: number, bound: number = STAGE_BOUND_X): number {
  return Math.max(-bound, Math.min(bound, x));
}

export function resolvePushboxCollision(
  p1: { x: number; y: number; facing: number },
  p2: { x: number; y: number; facing: number }
): void {
  if (p1.y > 1.0 || p2.y > 1.0) return;
  const dx = p2.x - p1.x;
  const dist = Math.abs(dx);
  if (dist >= PUSHBOX_MIN_DIST) return;

  const sign = dist === 0 ? p1.facing : Math.sign(dx);
  const overlap = (PUSHBOX_MIN_DIST - dist) / 2;

  p1.x -= sign * overlap;
  p2.x += sign * overlap;

  // Corner push adjustment if one player hits edge
  const adjustWall = (a: { x: number }, b: { x: number }) => {
    if (a.x < -STAGE_BOUND_X) {
      b.x += -STAGE_BOUND_X - a.x;
      a.x = -STAGE_BOUND_X;
    } else if (a.x > STAGE_BOUND_X) {
      b.x -= a.x - STAGE_BOUND_X;
      a.x = STAGE_BOUND_X;
    }
  };

  adjustWall(p1, p2);
  adjustWall(p2, p1);
}


export const NEUTRAL_INPUT = Object.freeze({ moveX: 0, up: false, down: false, punch: false, kick: false, grab: false, super: false });
