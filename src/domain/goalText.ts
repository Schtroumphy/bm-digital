import { money, percent } from './format';
import type { GoalView } from './goals';

/** A value of a goal as text: a percentage for a savings rate, euros otherwise. */
export const formatGoalValue = (v: Pick<GoalView, 'kind'>, n: number): string => (v.kind === 'rate' ? percent(n) : money(n));
