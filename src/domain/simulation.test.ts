import { describe, expect, it } from 'vitest';
import { templateSummary } from './budget';
import { seedData } from './seed';
import {
  blockShare, simulationSavings, duplicateSimulation, gapWithModel, newSimulation, openSimulation, rowAnnual, revenueSplit, sanitizeSimulationAmount, simulationAmount, simulationTotals,
} from './simulation';
import type { SimBlockKey, SimulationRow } from './types';

const rows = (...r: [SimBlockKey, string][]): SimulationRow[] => r.map(([block, amount], i) => ({ id: `r${i}`, block, name: '', amount }));
const counter = () => {
  let n = 0;
  return () => `id${n++}`;
};

describe('simulation : totaux', () => {
  it('CA1 : sorties, reste et reste annuel', () => {
    const t = simulationTotals(rows(['rev', '3000'], ['fix', '1000'], ['var', '500'], ['epa', '200']));
    expect(t.outgoing).toBe(1700);
    expect(t.remaining).toBe(1300);
    expect(t.remainingYear).toBe(15600);
  });

  it('RG5 : l’épargne, les placements, les crédits et les enveloppes sont des sorties', () => {
    const t = simulationTotals(rows(['rev', '1000'], ['cre', '10'], ['fix', '20'], ['var', '30'], ['epa', '40'], ['inv', '50'], ['env', '60']));
    expect(t.outgoing).toBe(210);
    expect(t.remaining).toBe(790);
  });

  it('CA2 : un montant vide ou illisible compte 0 ; l’annuel est vide si le montant est vide', () => {
    expect(simulationAmount('')).toBe(0);
    expect(simulationAmount('abc')).toBe(0);
    expect(rowAnnual('')).toBeNull();
    expect(rowAnnual('   ')).toBeNull();
    expect(rowAnnual('abc')).toBe(0);
    expect(rowAnnual('100')).toBe(1200);
    expect(simulationTotals(rows(['rev', '100'], ['fix', ''], ['var', 'x'])).remaining).toBe(100);
  });

  it('CA12 / RG3 : « 1 234,5 » est lu ; seuls chiffres, espace, virgule et point sont gardés', () => {
    expect(simulationAmount('1 234,5')).toBe(1234.5);
    expect(simulationAmount('12.5')).toBe(12.5);
    expect(sanitizeSimulationAmount('a1 2-3,4.5€')).toBe('1 23,4.5');
  });

  it('CA3 : revenus à 0, les parts valent 0 et le reste est négatif ou nul, sans erreur', () => {
    const t = simulationTotals(rows(['fix', '500']));
    expect(blockShare(t, 'fix')).toBe(0);
    expect(t.remaining).toBe(-500);
    expect(simulationTotals([]).remaining).toBe(0);
  });

  it('RG7 : la part d’un bloc est plafonnée à 100 %', () => {
    const t = simulationTotals(rows(['rev', '100'], ['fix', '50'], ['var', '300']));
    expect(blockShare(t, 'fix')).toBe(50);
    expect(blockShare(t, 'var')).toBe(100);
  });

  it('les totaux annuels sont ceux du mensuel × 12', () => {
    const t = simulationTotals(rows(['rev', '100,10'], ['fix', '50'], ['env', '10']));
    expect(t.annual).toMatchObject({ revenue: 1201.2, outgoing: 720 });
    expect(t.annual.blocks.fix).toBe(600);
    expect(t.annual.blocks.env).toBe(120);
  });

  it('CA9 : l’écart avec le modèle est signé', () => {
    const d = seedData();
    const model = templateSummary(d).remaining;
    const sim = rows(['rev', String(model - 450)]);
    expect(gapWithModel(d, sim)).toBe(-450);
    expect(gapWithModel(d, rows(['rev', String(model + 10)]))).toBe(10);
  });
});

describe('simulation : création, ouverture, copie', () => {
  it('CA4 : « Partir du modèle » reprend chaque ligne dans son bloc et chaque enveloppe dans « Enveloppes »', () => {
    const d = seedData();
    const sim = newSimulation('model', d, counter());
    expect(sim).toMatchObject({ id: null, source: 'model', name: '', notes: '' });
    for (const l of d.template.lines) {
      expect(sim.rows.some(r => r.block === l.block && r.name === l.name && simulationAmount(r.amount) === l.budget)).toBe(true);
    }
    const env = sim.rows.filter(r => r.block === 'env');
    expect(env.map(r => r.name)).toEqual(d.envelopes.map(e => e.name));
    expect(env.map(r => simulationAmount(r.amount))).toEqual(d.envelopes.map(e => d.template.envAlloc[e.id] ?? 0));
    expect(simulationTotals(sim.rows).remaining).toBe(templateSummary(d).remaining);
    expect(new Set(sim.rows.map(r => r.id)).size).toBe(sim.rows.length);
  });

  it('RG9 : une enveloppe sans allocation dans le modèle vaut 0 ; les lignes d’un compte hors budget sont écartées', () => {
    const d = seedData();
    delete d.template.envAlloc[d.envelopes[0].id];
    const cash = d.accounts.find(a => !a.isDefault)!;
    cash.inBudget = false;
    d.template.lines[0] = { ...d.template.lines[0], accountId: cash.id };
    const sim = newSimulation('model', d, counter());
    expect(sim.rows.find(r => r.block === 'env' && r.name === d.envelopes[0].name)!.amount).toBe('0');
    expect(sim.rows.filter(r => r.block !== 'env')).toHaveLength(d.template.lines.length - 1);
    expect(simulationTotals(sim.rows).remaining).toBe(templateSummary(d).remaining);
  });

  it('CA5 : « Vide » n’a ni ligne, ni nom, ni note', () => {
    expect(newSimulation('vide', seedData(), counter())).toEqual({ id: null, source: 'vide', name: '', notes: '', rows: [] });
  });

  it('modèle vide : « Partir du modèle » donne une simulation vide', () => {
    const d = seedData();
    d.template = { lines: [], envAlloc: {} };
    d.envelopes = [];
    expect(newSimulation('model', d, counter()).rows).toEqual([]);
  });

  it('RG14 / CA14 : la copie s’appelle « <nom> (copie) », n’est pas enregistrée, a de nouveaux ids et laisse l’original intact', () => {
    const original = { id: 's1', source: null, name: ' Plan A ', notes: 'n', rows: rows(['rev', '10']) };
    const before = structuredClone(original);
    const copy = duplicateSimulation(original, counter());
    expect(copy).toMatchObject({ id: null, source: null, name: 'Plan A (copie)', notes: 'n' });
    expect(copy.rows[0]).toMatchObject({ block: 'rev', amount: '10' });
    expect(copy.rows[0].id).not.toBe('r0');
    expect(original).toEqual(before);
    expect(duplicateSimulation({ ...original, name: '  ' }, counter()).name).toBe('');
  });

  it('RG10 : une simulation rouverte n’a aucune source ; la rouvrir ne partage pas ses lignes', () => {
    const saved = { id: 's1', name: 'A', notes: '', rows: rows(['rev', '10']) };
    const draft = openSimulation(saved);
    expect(draft.source).toBeNull();
    expect(draft.id).toBe('s1');
    draft.rows[0].amount = '99';
    expect(saved.rows[0].amount).toBe('10');
  });
});

describe('simulation : indicateur Épargne (spec 0034, amendement)', () => {
  const savings = (...r: [SimBlockKey, string][]) => simulationSavings(simulationTotals(rows(...r)));

  it('CA18 : total, annuel, part des revenus, détail et part des investissements', () => {
    const s = savings(['rev', '3000'], ['env', '300'], ['epa', '200'], ['inv', '500']);
    expect(s.monthly).toBe(1000);
    expect(s.annual).toBe(12000);
    expect(s.shareOfRevenue).toBe(33.33);
    expect(s.details.map(d => [d.block, d.monthly, d.annual])).toEqual([['env', 300, 3600], ['epa', 200, 2400], ['inv', 500, 6000]]);
    expect(s.investShareOfSavings).toBe(50);
  });

  it('CA19 : revenus à 0, la part des revenus vaut 0', () => {
    expect(savings(['epa', '100']).shareOfRevenue).toBe(0);
  });

  it('CA20 : sans ligne, tout vaut 0', () => {
    const s = savings(['rev', '1000'], ['fix', '10']);
    expect(s).toMatchObject({ monthly: 0, annual: 0, shareOfRevenue: 0, investShareOfSavings: 0 });
    expect(s.details.every(d => d.monthly === 0 && d.annual === 0)).toBe(true);
    expect(simulationSavings(simulationTotals([])).monthly).toBe(0);
  });

  it('CA21 : aucun plafond sur la part des revenus', () => {
    expect(savings(['rev', '1000'], ['epa', '1500']).shareOfRevenue).toBe(150);
  });

  it('CA22 : vides et illisibles comptent 0 ; que des investissements = 100 % ; 0,1 + 0,2 = 0,3', () => {
    expect(savings(['env', ''], ['epa', 'abc'], ['inv', '50']).investShareOfSavings).toBe(100);
    expect(savings(['epa', '0,1'], ['epa', '0,2']).monthly).toBe(0.3);
  });

  it('CA23 : sorties et reste inchangés, la somme du détail = le total', () => {
    const r = rows(['rev', '3000'], ['fix', '1000'], ['var', '500'], ['epa', '200'], ['env', '33,33'], ['inv', '10,01']);
    const t = simulationTotals(r);
    const s = simulationSavings(t);
    expect(t.outgoing).toBe(1743.34);
    expect(t.remaining).toBe(1256.66);
    expect(s.details.reduce((a, d) => a + d.monthly, 0)).toBeCloseTo(s.monthly, 10);
  });
});

describe('simulation : répartition des revenus (camembert)', () => {
  it('une part par bloc de sortie non vide, puis le reste, en pourcentage des revenus', () => {
    const s = revenueSplit(simulationTotals(rows(['rev', '2000'], ['fix', '500'], ['var', '300'], ['epa', '200'])));
    expect(s.map(x => [x.id, x.amount, x.pct])).toEqual([['fix', 500, 25], ['var', 300, 15], ['epa', 200, 10], ['remaining', 1000, 50]]);
  });

  it('sans revenus positifs, aucune part', () => {
    expect(revenueSplit(simulationTotals(rows(['fix', '500'])))).toEqual([]);
  });

  it('des sorties au-dessus des revenus : pas de part « reste », les pourcentages dépassent 100 au total', () => {
    const s = revenueSplit(simulationTotals(rows(['rev', '1000'], ['fix', '800'], ['var', '400'])));
    expect(s.map(x => x.id)).toEqual(['fix', 'var']);
    expect(s.reduce((n, x) => n + x.pct, 0)).toBe(120);
  });

  it('les lignes à 0 et les blocs vides ne donnent pas de part', () => {
    expect(revenueSplit(simulationTotals(rows(['rev', '100'], ['fix', '0']))).map(x => x.id)).toEqual(['remaining']);
  });
});
