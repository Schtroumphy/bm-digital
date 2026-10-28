import { describe, expect, it } from 'vitest';
import { envelopeAlerts, lineHistory, monthSummary, surplus } from './budget';
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

describe('surplus', () => {
  it('is real income minus real outflows, a line without actual counting at its budget', async () => {
    const { emptyData } = await import('./empty');
    const d = emptyData();
    const line = (key: string, block: 'rev' | 'cre' | 'epa', budget: number, actual: number | null) => ({ key, block, section: '', name: key, budget, actual });
    d.months['2026-11'] = { initialized: true, alloc: { e1: 10 }, transfersDone: {}, lines: [line('s', 'rev', 100, 90), line('c', 'cre', 80, 75.25), line('v', 'epa', 5, null)] };
    expect(surplus(d, '2026-11')).toBe(-0.25);
  });
});
