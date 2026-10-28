import { describe, expect, it } from 'vitest';
import { seedData } from '../domain/seed';
import type { SimulationDraft } from '../domain/simulation';
import { deleteSimulation, saveSimulation, simulationSaveError, SIMULATION_NAME_REQUIRED, SIMULATION_NAME_TAKEN } from './simulations';

const draft = (name: string, over: Partial<SimulationDraft> = {}): SimulationDraft => ({
  id: null,
  source: 'vide',
  name,
  notes: '',
  rows: [{ id: 'r1', block: 'rev', name: 'Salaire', amount: '3000' }],
  ...over,
});

describe('simulations : enregistrer', () => {
  it('CA6 : sans nom (ou des espaces), refusé et rien n’est enregistré', () => {
    const d = seedData();
    for (const name of ['', '   ']) {
      expect(saveSimulation(d, draft(name), 'x')).toEqual({ ok: false, error: SIMULATION_NAME_REQUIRED });
    }
    expect(d.simulations).toBeUndefined();
  });

  it('CA7 : une simulation neuve est ajoutée en tête avec un id ; réenregistrée, elle est mise à jour sans doublon', () => {
    const d = seedData();
    expect(saveSimulation(d, draft(' Plan A '), 'sim1')).toEqual({ ok: true, id: 'sim1' });
    expect(saveSimulation(d, draft('Plan B'), 'sim2')).toEqual({ ok: true, id: 'sim2' });
    expect(d.simulations!.map(s => [s.id, s.name])).toEqual([['sim2', 'Plan B'], ['sim1', 'Plan A']]);
    const edited = draft('Plan A bis', { id: 'sim1', notes: 'hypothèses' });
    edited.rows[0].amount = '2500';
    expect(saveSimulation(d, edited, 'inutile')).toEqual({ ok: true, id: 'sim1' });
    expect(d.simulations).toHaveLength(2);
    expect(d.simulations![1]).toMatchObject({ id: 'sim1', name: 'Plan A bis', notes: 'hypothèses' });
    expect(d.simulations![1].rows[0].amount).toBe('2500');
  });

  it('l’enregistrement copie les lignes : modifier le brouillon ensuite ne change pas la simulation enregistrée', () => {
    const d = seedData();
    const dr = draft('A');
    saveSimulation(d, dr, 's');
    dr.rows[0].amount = '1';
    expect(d.simulations![0].rows[0].amount).toBe('3000');
  });

  it('CA7b : un autre nom identique (casse, espaces) est refusé ; la simulation peut garder son propre nom, même en casse différente', () => {
    const d = seedData();
    saveSimulation(d, draft('Plan A'), 'sim1');
    const before = structuredClone(d.simulations);
    for (const name of ['plan a', 'Plan A  ', ' PLAN A']) {
      expect(saveSimulation(d, draft(name), 'sim2')).toEqual({ ok: false, error: SIMULATION_NAME_TAKEN });
    }
    expect(d.simulations).toEqual(before);
    expect(saveSimulation(d, draft('PLAN A', { id: 'sim1' }), 'x')).toEqual({ ok: true, id: 'sim1' });
    expect(d.simulations![0].name).toBe('PLAN A');
  });

  it('les accents comptent : « Éco » et « Eco » sont deux noms', () => {
    const d = seedData();
    saveSimulation(d, draft('Éco'), 's1');
    expect(simulationSaveError(d, draft('Eco'))).toBeNull();
  });

  it('renommer une simulation avec le nom d’une autre est refusé', () => {
    const d = seedData();
    saveSimulation(d, draft('A'), 's1');
    saveSimulation(d, draft('B'), 's2');
    expect(simulationSaveError(d, draft('a', { id: 's2' }))).toBe(SIMULATION_NAME_TAKEN);
  });

  it('une simulation supprimée entre-temps est enregistrée comme une neuve', () => {
    const d = seedData();
    expect(saveSimulation(d, draft('A', { id: 'disparue' }), 'neuve')).toEqual({ ok: true, id: 'neuve' });
    expect(d.simulations!.map(s => s.id)).toEqual(['neuve']);
  });
});

describe('simulations : supprimer', () => {
  it('CA8 : la simulation disparaît et rien d’autre ne change', () => {
    const d = seedData();
    saveSimulation(d, draft('A'), 's1');
    saveSimulation(d, draft('B'), 's2');
    const { simulations, ...others } = structuredClone(d);
    expect(simulations).toHaveLength(2);
    expect(deleteSimulation(d, 's1')).toBe(true);
    expect(d.simulations!.map(s => s.id)).toEqual(['s2']);
    expect(deleteSimulation(d, 's2')).toBe(true);
    expect(d.simulations).toBeUndefined();
    expect(d).toEqual(others);
  });

  it('une simulation inconnue n’est pas supprimée', () => {
    const d = seedData();
    expect(deleteSimulation(d, 'nope')).toBe(false);
    saveSimulation(d, draft('A'), 's1');
    expect(deleteSimulation(d, 'nope')).toBe(false);
    expect(d.simulations).toHaveLength(1);
  });

  it('CA17 : enregistrer et supprimer des simulations ne touche ni le modèle, ni les mois, ni les transactions, ni les objectifs', () => {
    const d = seedData();
    const before = structuredClone(d);
    saveSimulation(d, draft('A'), 's1');
    deleteSimulation(d, 's1');
    expect(d).toEqual(before);
  });
});
