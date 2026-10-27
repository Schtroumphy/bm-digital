import { describe, expect, it } from 'vitest';
import { completeData } from '../application/budgetRepository.contract';
import { emptyData } from '../domain/empty';
import { createMemoryRemote } from './memoryRemote';
import { createSupabaseRepository } from './supabaseRepository';
import { fromRows, toRows } from './supabaseRows';
import { emptyRows, TABLE_ORDER } from './supabaseSchema';

const writes = (calls: string[]) => calls.filter(c => !c.startsWith('select:'));

describe('conversion domaine ↔ lignes', () => {
  it('redonne le même BudgetData (CA7)', () => {
    const data = completeData();
    expect(fromRows(withUser(toRows(data)))).toEqual(data);
  });

  it('conserve firstMonth: null (CA8)', () => {
    expect(fromRows(withUser(toRows(emptyData())))?.firstMonth).toBeNull();
  });

  it('renvoie null sans ligne settings (CA9)', () => {
    expect(fromRows(withUser(emptyRows()))).toBeNull();
  });

  it('ne produit aucune clé absente du schéma : chaque ligne porte sa clé primaire', () => {
    const rows = toRows(completeData());
    expect(rows.settings).toHaveLength(1);
    expect(rows.budget_lines.every(r => r.month && r.key)).toBe(true);
    expect(rows.line_checks.length).toBeGreaterThan(0);
    expect(rows.adjustments).toHaveLength(2);
  });

  it('notes du mois : une ligne par note avec sa position, restituées dans l’ordre, absentes sans note (spec 0027, CA10)', () => {
    const d = completeData();
    const rows = toRows(d);
    expect(rows.month_notes.map(r => [r.month, r.id, r.position])).toEqual([['2026-12', 'n1', 0], ['2026-12', 'n2', 1], ['2027-03', 'n3', 0]]);
    const back = fromRows(withUser(rows))!;
    expect(back.months['2026-12'].notes).toEqual(d.months['2026-12'].notes);
    expect(back.months['2027-03'].notes).toEqual([{ id: 'n3', text: 'Préparer le mois', done: false }]);
    expect('notes' in back.months['2026-11']).toBe(false);
  });
});

function withUser(rows: ReturnType<typeof toRows>) {
  return Object.fromEntries(TABLE_ORDER.map(t => [t, rows[t].map(r => ({ user_id: 'u1', ...r }))])) as unknown as Parameters<typeof fromRows>[0];
}

describe('SupabaseRepository : écriture par diff', () => {
  async function synced() {
    const remote = createMemoryRemote();
    const repo = createSupabaseRepository(remote);
    const data = completeData();
    await repo.save(data);
    remote.calls.length = 0;
    return { remote, repo, data };
  }

  it('un rang libéré puis repris dans la même sauvegarde passe (suppressions avant upserts)', async () => {
    const { remote, repo, data } = await synced();
    const old = data.transactions.find(t => t.id === 't-imp')!;
    data.transactions = data.transactions.filter(t => t.id !== 't-imp');
    data.transactions.push({ ...old, id: 't-imp2' });
    await repo.save(data);
    const reloaded = await createSupabaseRepository(remote).load();
    expect(reloaded!.transactions.filter(t => t.fingerprint === old.fingerprint).map(t => t.id)).toEqual(['t-imp2']);
  });

  it('un conflit réel sur (compte d’import, empreinte, rang) fait échouer la sauvegarde', async () => {
    const { repo, data } = await synced();
    const old = data.transactions.find(t => t.id === 't-imp')!;
    data.transactions.push({ ...old, id: 't-copy' });
    await expect(repo.save(data)).rejects.toThrow(/unique/);
  });

  it('load renvoie null pour un compte sans donnée (CA9)', async () => {
    expect(await createSupabaseRepository(createMemoryRemote()).load()).toBeNull();
  });

  it('n’envoie rien quand rien n’a changé (CA10)', async () => {
    const { remote, repo, data } = await synced();
    await repo.save(structuredClone(data));
    expect(writes(remote.calls)).toEqual([]);
  });

  it('après un rechargement, n’envoie rien non plus', async () => {
    const { remote, data } = await synced();
    const repo = createSupabaseRepository(remote);
    await repo.load();
    remote.calls.length = 0;
    await repo.save(structuredClone(data));
    expect(writes(remote.calls)).toEqual([]);
  });

  it('n’envoie que la table de la ligne modifiée (CA10)', async () => {
    const { remote, repo, data } = await synced();
    const next = structuredClone(data);
    next.months['2026-12'].lines[0].budget += 1;
    await repo.save(next);
    expect(writes(remote.calls)).toEqual(['upsert:budget_lines']);
  });

  it('supprime en base une ligne, une enveloppe et une transaction supprimées (CA11)', async () => {
    const { remote, repo, data } = await synced();
    const lines = remote.count('budget_lines');
    const txs = remote.count('transactions');
    const envs = remote.count('envelopes');
    const next = structuredClone(data);
    next.months['2026-12'].lines.pop();
    next.transactions.pop();
    delete next.template.envAlloc[next.envelopes.pop()!.id];
    await repo.save(next);
    expect(remote.count('budget_lines')).toBe(lines - 1);
    expect(remote.count('transactions')).toBe(txs - 1);
    expect(remote.count('envelopes')).toBe(envs - 1);
    expect(await repo.load()).toEqual(next);
  });

  it('supprime avant d’écrire, les enfants avant les parents', async () => {
    const { remote, repo, data } = await synced();
    const next = structuredClone(data);
    delete next.months['2026-11'];
    await repo.save(next);
    const removes = writes(remote.calls).filter(c => c.startsWith('remove:'));
    expect(removes.indexOf('remove:budget_lines')).toBeLessThan(removes.indexOf('remove:months'));
    expect(writes(remote.calls).findIndex(c => c.startsWith('upsert:'))).toBe(-1);
  });

  it('un échec rejette, puis une nouvelle sauvegarde envoie tout ce qui manque (CA12)', async () => {
    const { remote, repo, data } = await synced();
    const next = structuredClone(data);
    next.months['2026-12'].lines[0].budget += 1;
    next.transactions.pop();
    remote.failing = true;
    await expect(repo.save(next)).rejects.toThrow();
    remote.failing = false;
    remote.calls.length = 0;
    await repo.save(next);
    expect(writes(remote.calls)).toEqual(['remove:transactions', 'upsert:budget_lines']);
    expect(await createSupabaseRepository(remote).load()).toEqual(next);
  });

  it('un échec de lecture rejette au lieu de renvoyer null (RG7)', async () => {
    const remote = createMemoryRemote();
    remote.failing = true;
    await expect(createSupabaseRepository(remote).load()).rejects.toThrow();
  });

  it('une sauvegarde avant tout chargement part de l’état réel de la base', async () => {
    const { remote, data } = await synced();
    const fresh = createSupabaseRepository(remote);
    await fresh.save(structuredClone(data));
    expect(writes(remote.calls)).toEqual([]);
  });
});
