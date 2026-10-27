import { describe, expect, it } from 'vitest';
import { seedData } from '../domain/seed';
import { Ledger } from '../domain/ledger';
import { addEnvelopeEntry } from './quickEntry';

const M = '2026-12';
const entry = { id: 'q1', amount: 12.5, day: 10, label: '' };
const balance = (d: ReturnType<typeof seedData>, id: string) => new Ledger(d, '2026-12').envMonth(id, M)!.balance;

describe('« + » d’une enveloppe (spec 0027, CA16)', () => {
  it('crée une dépense env sur le compte de l’enveloppe, son solde baisse du montant', () => {
    const d = seedData();
    const e = d.envelopes[0];
    const before = balance(d, e.id);
    expect(addEnvelopeEntry(d, M, e.id, entry)).toBe(true);
    const t = d.transactions.find(x => x.id === 'q1')!;
    expect(t).toMatchObject({ type: 'env', target: e.id, accountId: e.accountId, month: M, day: 10, amount: 12.5, label: e.name });
    expect(balance(d, e.id)).toBe(Math.round((before - 12.5) * 100) / 100);
  });

  it('garde le libellé saisi', () => {
    const d = seedData();
    addEnvelopeEntry(d, M, d.envelopes[0].id, { ...entry, label: ' Café ' });
    expect(d.transactions.find(x => x.id === 'q1')!.label).toBe('Café');
  });

  it('refuse un montant nul ou négatif, un jour hors du mois, une enveloppe inconnue', () => {
    const d = seedData();
    const n = d.transactions.length;
    const id = d.envelopes[0].id;
    expect(addEnvelopeEntry(d, M, id, { ...entry, amount: 0 })).toBe(false);
    expect(addEnvelopeEntry(d, M, id, { ...entry, amount: -3 })).toBe(false);
    expect(addEnvelopeEntry(d, M, id, { ...entry, day: 0 })).toBe(false);
    expect(addEnvelopeEntry(d, M, id, { ...entry, day: 32 })).toBe(false);
    expect(addEnvelopeEntry(d, M, 'inconnue', entry)).toBe(false);
    expect(d.transactions).toHaveLength(n);
  });

  it('refuse un mois verrouillé ou non initialisé', () => {
    const d = seedData();
    const id = d.envelopes[0].id;
    d.months[M].closed = true;
    expect(addEnvelopeEntry(d, M, id, entry)).toBe(false);
    expect(addEnvelopeEntry(d, '2027-06', id, entry)).toBe(false);
  });
});
