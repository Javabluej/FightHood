import type { InputState } from '../types';
import type { Fighter } from './Fighter';

/** Defensive alternative to defeating a configured peace boss with damage. */
export function updatePeaceCharge(fighter: Fighter, opponent: Fighter, input: InputState, dt: number): boolean {
  const goal = opponent.definition.peaceGoalSeconds;
  if (!goal || input.punch || input.kick || input.grab || input.super) {
    fighter.peaceCharge = 0;
    return false;
  }
  if (fighter.health > 0 && fighter.grounded && fighter.canBlock && fighter.holdingBack && Math.abs(opponent.x - fighter.x) <= 2.5) {
    fighter.peaceCharge = Math.min(goal, fighter.peaceCharge + dt);
  }
  return fighter.peaceCharge >= goal;
}
