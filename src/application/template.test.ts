import { describe, expect, it } from 'vitest';
import { emptyData } from '../domain/empty';
import { templateSummary } from '../domain/budget';
import { applyTemplate } from './actions';
import { addEnvelope } from './envelopes';
import { addTemplateLine, deleteTemplateLine, setTemplateAllocation, updateTemplateLine } from './template';

const base = () => {
  const d = emptyData();
  addEnvelope(d, 'e1', 'Perso');
  addTemplateLine(d, 'rev', 'a');
  addTemplateLine(d, 'fix', 'b');
  addTemplateLine(d, 'rev', 'c');
  return d;
};

describe('budget model edition', () => {
  it('adds a line after the last line of its block', () => {
    expect(base().template.lines.map(l => l.key)).toEqual(['a', 'c', 'b']);
  });

  it('edits a line and refuses a negative budget', () => {
    const d = base();
    expect(updateTemplateLine(d, 'a', { name: 'Salaire', budget: 1000.456 })).toBe(true);
    expect(d.template.lines[0]).toMatchObject({ name: 'Salaire', budget: 1000.46 });
    expect(updateTemplateLine(d, 'a', { budget: -1 })).toBe(false);
    expect(updateTemplateLine(d, 'zz', { name: 'x' })).toBe(false);
  });

  it('deletes a line', () => {
    const d = base();
    expect(deleteTemplateLine(d, 'b')).toBe(true);
    expect(deleteTemplateLine(d, 'b')).toBe(false);
    expect(d.template.lines).toHaveLength(2);
  });

  it('sets an envelope allocation', () => {
    const d = base();
    expect(setTemplateAllocation(d, 'e1', 120)).toBe(true);
    expect(d.template.envAlloc.e1).toBe(120);
    expect(setTemplateAllocation(d, 'e1', -5)).toBe(false);
    expect(setTemplateAllocation(d, 'nope', 5)).toBe(false);
  });
});

describe('le modèle ne contient aucun réel (spec 0019, RG19)', () => {
  it('une ligne du modèle n’a pas de réel et le mois créé depuis le modèle n’en a pas non plus', () => {
    const d = base();
    expect(d.template.lines.every(l => !('actual' in l))).toBe(true);
    expect(applyTemplate(d, '2026-11')).toBe(true);
    expect(d.months['2026-11'].lines.every(l => l.actual === null)).toBe(true);
  });

  it('les écritures déjà enregistrées sur le mois alimentent le réel de la ligne créée', () => {
    const d = base();
    d.transactions.push({ id: 't', month: '2026-11', day: 3, label: 'x', amount: 40, type: 'var', target: 'b', accountId: 'acc-main' });
    d.template.lines.find(l => l.key === 'b')!.block = 'var';
    applyTemplate(d, '2026-11');
    expect(d.months['2026-11'].lines.find(l => l.key === 'b')?.actual).toBe(40);
  });
});

describe('budget model indications', () => {
  it('computes the reste à placer and the savings rate', () => {
    const d = base();
    const set = (key: string, budget: number) => updateTemplateLine(d, key, { budget });
    set('a', 1000); // revenu
    set('c', 500); // revenu
    set('b', 600); // fixe
    addTemplateLine(d, 'epa', 's');
    set('s', 300);
    setTemplateAllocation(d, 'e1', 100);
    expect(templateSummary(d)).toEqual({ remaining: 500, savingsRate: (400 / 1500) * 100 });
  });
});
