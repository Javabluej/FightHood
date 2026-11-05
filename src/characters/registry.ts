import { CharacterId, FighterDefinition } from '../types';
import { PRATHAM_DEFINITION } from './roster/pratham';
import { KENNY_DEFINITION } from './roster/kenny';
import { MODI_DEFINITION } from './roster/modi';
import { RAHUL_DEFINITION } from './roster/rahul';
import { DIDI_DEFINITION } from './roster/didi';
import { TRUMP_DEFINITION } from './roster/trump';
import { YOGI_DEFINITION } from './roster/yogi';
import { NITIN_DEFINITION } from './roster/nitin';
import { MBAPU_DEFINITION } from './roster/mbapu';

export class CharacterRegistry {
  private static characters: Map<CharacterId, FighterDefinition> = new Map();

  public static initialize(): void {
    if (this.characters.size > 0) return;
    this.register(MODI_DEFINITION);
    this.register(RAHUL_DEFINITION);
    this.register(DIDI_DEFINITION);
    this.register(TRUMP_DEFINITION);
    this.register(YOGI_DEFINITION);
    this.register(NITIN_DEFINITION);
    this.register(MBAPU_DEFINITION);
    this.register(KENNY_DEFINITION);
    this.register(PRATHAM_DEFINITION);
  }

  public static register(character: FighterDefinition): void {
    this.characters.set(character.id, character);
  }

  public static get(id: CharacterId): FighterDefinition {
    this.initialize();
    const found = this.characters.get(id);
    if (!found) {
      console.warn(`Character "${id}" not found in registry, falling back to modi`);
      return MODI_DEFINITION;
    }
    return found;
  }

  public static getAll(): FighterDefinition[] {
    this.initialize();
    return Array.from(this.characters.values());
  }

  public static getPlayableRoster(): FighterDefinition[] {
    this.initialize();
    // Exclude mbapu (boss) from ordinary random picks unless unlocked
    return Array.from(this.characters.values()).filter((c) => c.id !== 'mbapu');
  }

  public static getRandom(excludeId?: CharacterId): FighterDefinition {
    const roster = this.getPlayableRoster().filter((c) => c.id !== excludeId);
    const index = Math.floor(Math.random() * roster.length);
    return roster[index] || MODI_DEFINITION;
  }
}

