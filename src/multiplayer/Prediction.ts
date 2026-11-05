import { Fighter, FighterSnapshot } from '../combat/Fighter';
import { InputState } from '../types';
import { clampStagePosition, PUSHBOX_MIN_DIST } from '../combat/physics';

/** Predict inputs only; collision damage, energy and results remain authoritative. */
export class GuestPrediction {
  private pending: Array<{ frame: number; input: InputState }> = [];
  private sequence = 0;
  private lastSnapshot = -1;
  public correction = [{ x: 0, y: 0 }, { x: 0, y: 0 }];

  reset(): void { this.pending = []; this.sequence = 0; this.lastSnapshot = -1; this.correction = [{x:0,y:0},{x:0,y:0}]; }
  clearPending(): void { this.pending = []; this.correction = [{x:0,y:0},{x:0,y:0}]; }

  predict(local: Fighter, opponent: Fighter, input: InputState): number {
    const frame = ++this.sequence;
    const command = { ...input, super: false };
    this.pending.push({ frame, input: command });
    // Bound history during a stalled connection (two seconds at 60 Hz).
    if (this.pending.length > 120) this.pending.shift();
    this.step(local, opponent, command);
    return frame;
  }

  reconcile(frame: number, ack: number, remote: Fighter, local: Fighter, f1: FighterSnapshot, f2: FighterSnapshot, predict: boolean): boolean {
    if (frame < this.lastSnapshot) return false;
    this.lastSnapshot = frame;
    const previous = [remote, local].map((fighter, i) => ({ x: fighter.x + this.correction[i].x, y: fighter.y + this.correction[i].y }));
    remote.applySnapshot(f1, false); local.applySnapshot(f2, true);
    this.pending = this.pending.filter(command => command.frame > ack);
    if (predict) for (const command of this.pending) this.step(local, remote, command.input);
    else this.pending = [];
    [remote, local].forEach((fighter, i) => {
      // Smooth small reconciliation errors only. Hits/teleports/cinematics must
      // remain visible at their authoritative position.
      const dx = previous[i].x - fighter.x, dy = previous[i].y - fighter.y;
      this.correction[i] = predict && Math.abs(dx) < 1 && Math.abs(dy) < .6 ? {x:dx,y:dy} : {x:0,y:0};
    });
    return true;
  }

  decay(dt: number): void {
    const factor = Math.exp(-30 * dt);
    this.correction.forEach(offset => { offset.x *= factor; offset.y *= factor; });
  }

  private step(local: Fighter, opponent: Fighter, input: InputState): void {
    const side = Math.sign(local.x - opponent.x) || -local.facing;
    local.update(input, opponent);
    if (local.y <= 1 && opponent.y <= 1 && Math.abs(local.x - opponent.x) < PUSHBOX_MIN_DIST) {
      local.x = clampStagePosition(opponent.x + side * PUSHBOX_MIN_DIST);
    }
  }
}
