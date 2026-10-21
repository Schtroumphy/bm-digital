import { describe, expect, it } from 'vitest';
import { emptyData } from '../domain/empty';
import { templateSummary } from '../domain/budget';
import { applyTemplate } from './actions';
import { addTemplateLine, deleteTemplateLine, setTemplateAllocation, updateTemplateLine } from './template';

const base = () => {
  const d = emptyData();
  d.envelopes = [{ id: 'e1', name: 'Perso', hue: 10, cash: 0 }];
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

describe('actual in the budget model', () => {
  it('stores and clears an actual', () => {
    const d = base();
    expect(updateTemplateLine(d, 'a', { actual: 12.345 })).toBe(true);
    expect(d.template.lines[0].actual).toBe(12.35);
    updateTemplateLine(d, 'a', { actual: null });
    expect(d.template.lines[0].actual).toBeNull();
  });

  it('copies it into a month created from the model, unless expenses are recorded', () => {
    const d = base();
    updateTemplateLine(d, 'a', { actual: 900 });
    expect(applyTemplate(d, '2026-11')).toBe(true);
    expect(d.months['2026-11'].lines.find(l => l.key === 'a')?.actual).toBe(900);
    expect(d.months['2026-11'].lines.find(l => l.key === 'b')?.actual).toBeNull();
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
