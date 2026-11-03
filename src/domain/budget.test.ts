import { describe, expect, it } from 'vitest';
import { envelopeAlerts, lineHistory, monthSummary } from './budget';
import { money, parseAmount } from './format';
import { Ledger, monthRange } from './ledger';
import { seedData } from './seed';

const TODAY = '2026-10';

describe('format', () => {
  it('formats French amounts', () => {
    expect(money(1665)).toBe('1 665 €');
    expect(money(2914.93)).toBe('2 914,93 €');
    expect(money(-20)).toBe('−20 €');
    expect(money(20, true)).toBe('+20 €');
  });
  it('parses French amounts', () => {
    expect(parseAmount('1 234,5')).toBe(1234.5);
    expect(parseAmount('25.50')).toBe(25.5);
    expect(parseAmount('')).toBeNull();
  });
});

describe('seed data matches the design', () => {
  const d = seedData();
  const ledger = new Ledger(d, TODAY);

  it('lists October 2026 → February 2027', () => {
    expect(monthRange(d, TODAY)).toEqual(['2026-10', '2026-11', '2026-12', '2027-01', '2027-02']);
  });

  it('December summary', () => {
    const s = monthSummary(d, ledger, '2026-12');
    expect(s.remaining).toBe(2950);
    expect(s.income).toBe(8000);
    expect(s.expenses).toBe(2990);
    expect(s.savings).toBe(1194);
    expect(s.grossSavings).toBe(2060);
    expect(s.grossSavingsRate.toFixed(1)).toBe('25.8');
    expect(s.savingsRate.toFixed(1)).toBe('20.2');
    expect(s.paidIn).toBe(1014);
    expect(s.envelopeSpent).toBe(145);
    expect(s.savingsOut).toBe(300);
    expect(s.realSavings).toBe(1615);
    expect(s.investTotal).toBe(15219);
  });

  it('December envelope balances', () => {
    const bal = Object.fromEntries(d.envelopes.map(e => [e.id, ledger.envMonth(e.id, '2026-12')!.balance]));
    expect(bal).toEqual({ perso: 342, sante: 60, love: 185, voiture: 520, impots: 1240, projets: 275 });
  });

  it('December account expected balances', () => {
    expect(ledger.accMonth('e-la', '2026-12')!.expected).toBe(9800);
    expect(ledger.accMonth('e-ld', '2026-12')!.expected).toBe(4150);
    expect(ledger.accMonth('e-ly', '2026-12')!.expected).toBe(640);
    expect(ledger.accMonth('i-pea', '2026-12')!.expected).toBe(5310);
  });

  it('does not flag the dentist in December: an overspent envelope carries no debt', () => {
    expect(envelopeAlerts(d, ledger, 2026, 11)).toEqual([]);
  });

  it('computes line history', () => {
    const h = lineHistory(d, '2026-12', 'r-sal');
    expect(h.cumul).toBe(19500);
    expect(h.prevGap).toBe(0);
  });

  it('carries a closed year into January', () => {
    const closed = { ...d, closes: { 2026: { closed: true, overrides: { 'acc:e-vc': 300, 'bank:acc-env-perso': 400 } } } };
    const l = new Ledger(closed, TODAY);
    expect(l.accMonth('e-vc', '2027-01')!.start).toBe(300);
    expect(l.envMonth('perso', '2027-01')!.start).toBe(400);
    expect(l.envMonth('sante', '2027-01')!.start).toBe(60);
  });
});

describe('écarts dépenses et épargne', () => {
  type L = { key: string; block: 'rev' | 'cre' | 'var' | 'epa'; section: string; name: string; budget: number; actual: number | null; accountId?: string };
  const line = (key: string, block: L['block'], budget: number, actual: number | null, accountId?: string): L => ({ key, block, section: '', name: key, budget, actual, ...(accountId ? { accountId } : {}) });
  async function summary(lines: L[], alloc: Record<string, number> = {}, tweak?: (d: import('./types').BudgetData) => void) {
    const { emptyData } = await import('./empty');
    const d = emptyData();
    d.months['2026-11'] = { initialized: true, alloc, transfersDone: {}, lines };
    tweak?.(d);
    return monthSummary(d, new Ledger(d, TODAY), '2026-11');
  }

  it('AC1: are 0 without any actual', async () => {
    const s = await summary([line('v', 'var', 100, null), line('e', 'epa', 200, null), line('c', 'cre', 80, null)]);
    expect(s.expenseGap).toBe(0);
    expect(s.savingsGap).toBe(0);
  });
  it('AC2: spent less than planned is positive', async () => {
    expect((await summary([line('v', 'var', 100, 80)])).expenseGap).toBe(20);
  });
  it('AC3: spent more than planned is negative', async () => {
    expect((await summary([line('c', 'cre', 80, 90)])).expenseGap).toBe(-10);
  });
  it('AC4: saved more than planned is positive', async () => {
    expect((await summary([line('e', 'epa', 200, 250)])).savingsGap).toBe(50);
  });
  it('AC5: an envelope allocation does not change the savings gap', async () => {
    const lines = [line('e', 'epa', 200, 250)];
    expect((await summary(lines, { e1: 10 })).savingsGap).toBe((await summary(lines)).savingsGap);
  });
  it('AC6: income does not influence the gaps', async () => {
    const s = await summary([line('r', 'rev', 100, 150), line('v', 'var', 100, 80), line('e', 'epa', 200, 250)]);
    expect(s.expenseGap).toBe(20);
    expect(s.savingsGap).toBe(50);
  });
  it('AC7: a line of an out-of-budget account is ignored', async () => {
    const s = await summary([line('c', 'cre', 100, 50, 'hb'), line('c2', 'cre', 10, 10)], {}, d => {
      d.accounts.push({ id: 'hb', name: 'Hors budget', hue: 0, isDefault: false, openingBalance: 0, openingMonth: '2026-01', inBudget: false, archived: false });
    });
    expect(s.expenseGap).toBe(0);
  });
  it('saved less than planned is negative', async () => {
    expect((await summary([line('e', 'epa', 200, 150)])).savingsGap).toBe(-50);
  });
  it('savings gap is unchanged by lines of an out-of-budget account (savings lines are never filtered by account)', async () => {
    const s = await summary([line('e', 'epa', 200, 250), line('c', 'cre', 100, 10, 'hb'), line('r', 'rev', 100, 10, 'hb')], {}, d => {
      d.accounts.push({ id: 'hb', name: 'Hors budget', hue: 0, isDefault: false, openingBalance: 0, openingMonth: '2026-01', inBudget: false, archived: false });
    });
    expect(s.savingsGap).toBe(50);
  });
  it('RG6: rounds to 2 decimals', async () => {
    expect((await summary([line('v', 'var', 0.3, 0.1), line('w', 'var', 0.3, 0.1)])).expenseGap).toBe(0.4);
  });
});
