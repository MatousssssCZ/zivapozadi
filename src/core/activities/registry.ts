import type { ActivityRunner, ActivityDefinition } from './types';
import { coffeeRunner } from './coffee';
import { shopRunner } from './shop';

const runners = new Map<string, ActivityRunner>();

/** Registrace činnosti. Nové činnosti se přidávají jen zde (viz docs/PRIDANI_CINNOSTI.md). */
export function registerActivity(r: ActivityRunner): void { runners.set(r.definition.type, r); }
export function getActivity(type: string): ActivityRunner | undefined { return runners.get(type); }
export function listActivityDefinitions(): ActivityDefinition[] { return [...runners.values()].map((r) => r.definition); }

registerActivity(coffeeRunner);
registerActivity(shopRunner);
