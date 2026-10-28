import { formatGoalValue } from '../../domain/goalText';
import type { GoalView } from '../../domain/goals';
import { goalsOfYear } from '../../domain/goals';
import type { BudgetData, Goal } from '../../domain/types';
import type { IconName } from './Icon';
import { HUE } from './tone';

/*
 * Look of a goal card (spec 0032). The hue follows the kind: `amount` alternates « obj » then « rev » in the order of the year, the savings rate
 * is 85, the ceiling is the expense hue and the amount saved is the savings hue. Shared by the Objectifs screen, the Budget and the Accueil.
 */

export function goalHue(d: BudgetData, goal: Goal): number {
  if (goal.kind === 'rate') return HUE.cash;
  if (goal.kind === 'cap') return HUE.dep;
  if (goal.kind === 'saved') return HUE.epa;
  const rank = goalsOfYear(d, goal.year).filter(g => g.kind === 'amount').findIndex(g => g.id === goal.id);
  return rank % 2 === 0 ? HUE.obj : HUE.rev;
}

export function goalIcon(d: BudgetData, goal: Goal): IconName {
  if (goal.kind === 'rate') return 'percent';
  if (goal.kind === 'cap') return 'target';
  if (goal.kind === 'saved') return 'goals';
  const rank = goalsOfYear(d, goal.year).filter(g => g.kind === 'amount').findIndex(g => g.id === goal.id);
  return rank % 2 === 0 ? 'shield' : 'trend';
}

/** Hue of the status label on a card. */
export const STATUS_HUE: Record<string, number> = {
  'À rattraper': 85,
  'En progression': 190,
  'En bonne voie': 150,
  Atteint: 150,
  Dépassé: 25,
  'Sous contrôle': 150,
  'À surveiller': 85,
};

/** « 840 € / 1 200 € » or « 54,2 % / 60 % »: value and target as the small cards of the Budget and the Accueil show them. */
export const goalSummaryText = (v: GoalView): string => formatGoalValue(v, v.current) + ' / ' + formatGoalValue(v, v.target);
