import type { AgentState, ActivityRun } from '../sim/types';
import type { SimContext } from '../sim/context';
import type { ActivityZone } from '../model/types';

/**
 * Deklarativní definice činnosti. Popisuje prostorové a provozní požadavky, nejen animaci.
 * Uloženo v kódu (vestavěné činnosti) nebo jako JSON (viz docs/PRIDANI_CINNOSTI.md).
 */
export interface ActivityDefinition {
  type: string;
  version: number;
  label: string;
  description: string;
  /** Stav implementace – nehotové činnosti se v UI nenabízí jako funkční. */
  status: 'implemented' | 'draft';
  participants: { role: string; min: number; max: number; requiredCapabilities: string[] }[];
  /** Objekty, které musí zóna mít přiřazené (role → přípustné druhy interakce objektu). */
  requiredObjects: { role: string; label: string; interactionKinds: string[]; min: number; max?: number }[];
  /** Rekvizity, které činnost vytváří / používá. */
  props: { id: string; kind: string; label: string }[];
  /** Druhy interakčních bodů objektů, které slouží jako pracovní body. */
  workPointKinds: string[];
  /** Druhy bodů, které slouží jako vstup/čekání. */
  entryPointKinds: string[];
  /** Požadovaný povrch v prostoru činnosti (např. `snow`), `null` = libovolný. */
  surface: 'snow' | null;
  /** Kapacita: jak se počítá (dokumentační popis + funkce v běhu). */
  capacity: { description: string };
  preconditions: string[];
  phases: { id: string; label: string; animation?: string; events?: string[] }[];
  outcome: string;
  repeat: { defaultIntervalMin: number; defaultIntervalMax: number; description: string };
  /** Výchozí parametry zóny. */
  defaultParams: Record<string, number | string | boolean>;
}

export type StepResult = 'running' | 'done' | 'failed';

export interface CanStart { ok: boolean; reason?: string; retryAfter?: number }

export interface ActivityRunner {
  definition: ActivityDefinition;
  canStart(ctx: SimContext, agent: AgentState, zone: ActivityZone): CanStart;
  /** Spustí činnost; může vrátit `null` (nelze), pak se nic nerezervuje. */
  start(ctx: SimContext, agent: AgentState, zone: ActivityZone, source: ActivityRun['source'], sourceId: string | null): ActivityRun | null;
  /** Krok činnosti; `events` jsou animační události z tohoto kroku. */
  step(ctx: SimContext, agent: AgentState, run: ActivityRun, events: string[]): StepResult;
  /**
   * Přerušení: musí uvést rekvizity do vysvětlitelného stavu. Rezervace a fronty postavy
   * navíc vždy uvolní simulace (bezpečnostní síť).
   */
  abort(ctx: SimContext, agent: AgentState, run: ActivityRun, reason: string): void;
  /** Objekt byl odebrán za běhu: činnost se má přeplánovat nebo přerušit. */
  usesObject(run: ActivityRun, objectId: string): boolean;
}
