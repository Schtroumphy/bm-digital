import { CASH_ACCOUNT_ID, defaultBankAccounts, MAIN_ACCOUNT_ID, newEnvelopeAccount } from './bank';
import { addMonths, monthKey, round2 } from './format';
import type { AccountMovement, BlockKey, BudgetData, EnvHistory, Line, LineCheck, MonthKey, Transaction, TxType } from './types';

/*
 * Sample data from the design prototype. December 2026 is the showcase month:
 * its summary reads Reste à placer 2 950 €, Revenus 8 000 €, Dépenses 3 856 €,
 * Épargne brute 2 060 € (réelle 1 615 €), Taux d'épargne 20,2 % (brut 25,8 %).
 * October and November 2026 are complete past months; earlier months exist
 * only as imported history (envelope balances and account statements).
 * Replace all of it with real figures.
 */

const LINES: [BlockKey, string, string, string, number, number | null][] = [
  ['rev', '', 'r-sal', 'Salaire', 6500, 6500], ['rev', '', 'r-pre', 'Prêt Manioune', 800, 800], ['rev', '', 'r-rem', 'Remboursement', 350, 349.93], ['rev', '', 'r-pri', 'Prime', 300, null], ['rev', '', 'r-aut', 'Autres', 50, 50],
  ['cre', '', 'c-108', 'CRN …108', 612, 612], ['cre', '', 'c-109', 'CRN …109', 485, 485], ['cre', '', 'c-110', 'CRN …110', 330, 330], ['cre', '', 'c-ap', 'Assurance de prêt', 58, 58], ['cre', '', 'c-ah', 'Ass. habitation', 24, 24], ['cre', '', 'c-pj', 'Ass. protection juridique', 11, 11],
  ['fix', '', 'f-cj', 'Compte joint', 400, 400], ['fix', '', 'f-nf', 'Netflix', 18, 17.99], ['fix', '', 'f-tan', 'TAN', 38, 38], ['fix', '', 'f-sp', 'Spliit', 60, 60], ['fix', '', 'f-sa', 'Salle de sport', 35, 35], ['fix', '', 'f-fb', 'Frais bancaires', 9, 9],
  ['var', '', 'v-ali', 'Alimentation', 450, 312.4], ['var', '', 'v-loi', 'Loisirs', 150, 164.9], ['var', '', 'v-sn', 'Snacks', 40, 22.5], ['var', '', 'v-de', 'Déjeuners', 120, 78], ['var', '', 'v-ca', 'Carburant', 90, 71.2], ['var', '', 'v-sw', 'Swile', 60, 60],
  ['epa', 'Épargne long terme', 'e-la', 'Livret A', 300, 300], ['epa', 'Épargne long terme', 'e-ld', 'LDDS Travaux', 150, 150], ['epa', 'Épargne moyen terme', 'e-ly', 'Lydia Holidays', 100, 100], ['epa', 'Épargne moyen terme', 'e-vm', 'Vacances Mada', 120, 120], ['epa', 'Épargne moyen terme', 'e-vc', 'Vacances copines', 80, null],
  ['inv', '', 'i-av', 'Assurance Vie', 100, 100], ['inv', '', 'i-pea', 'PEA', 150, 150], ['inv', '', 'i-tr', 'Trade Republic', 100, null], ['inv', '', 'i-pc', 'PERCOL', 64, 64], ['inv', '', 'i-pg', 'PEG', 30, 30],
];

/** Month-end statements, July → November 2026. */
const STATEMENTS: Record<string, number[]> = {
  'e-la': [8700, 8900, 9100, 9200, 9500], 'e-ld': [3800, 3950, 4100, 4250, 4220], 'e-ly': [300, 350, 450, 520, 620], 'e-vm': [400, 520, 640, 760, 1000], 'e-vc': [100, 150, 200, 250, 310],
  'i-av': [4300, 4400, 4550, 4600, 4720], 'i-pea': [4700, 4780, 4900, 5020, 5160], 'i-tr': [1700, 1800, 1900, 2000, 2140], 'i-pc': [1700, 1750, 1800, 1850, 1885], 'i-pg': [900, 920, 940, 950, 970],
};
const DEC_STATEMENTS: Record<string, number> = { 'e-la': 9800, 'e-ld': 4150, 'e-ly': 640, 'e-vm': 1120, 'i-av': 4820, 'i-pea': 5310, 'i-pc': 1949, 'i-pg': 1000 };

const ENVELOPES = [
  { id: 'perso', name: 'Perso', hue: 300, cash: 120, alloc: 120, solde: 342 },
  { id: 'sante', name: 'Santé', hue: 170, cash: 40, alloc: 60, solde: 40 },
  { id: 'love', name: 'Love ones', hue: 350, cash: 85, alloc: 100, solde: 185 },
  { id: 'voiture', name: 'Voiture', hue: 240, cash: 0, alloc: 150, solde: 520 },
  { id: 'impots', name: 'Impôts', hue: 75, cash: 0, alloc: 436, solde: 1240 },
  { id: 'projets', name: 'Projets', hue: 130, cash: 75, alloc: 0, solde: 275 },
];
/** Envelope balances January → October 2026. */
const ENV_BALANCES: Record<string, number[]> = {
  perso: [180, 210, 150, 230, 270, 200, 250, 300, 260, 310], sante: [120, 180, 120, 150, 210, 140, 90, 150, 100, 70], love: [90, 150, 60, 150, 100, 140, 200, 100, 150, 95],
  voiture: [300, 350, 400, 450, 330, 380, 430, 300, 360, 420], impots: [180, 420, 640, 860, 1080, 1300, 1520, 1740, 540, 780], projets: [50, 100, 150, 200, 250, 300, 350, 230, 280, 330],
};
/** Named envelope expenses of October and November; the rest of each month is « Dépenses diverses ». */
const ENV_TX: [MonthKey, number, string, number, string][] = [
  ['2026-10', 15, 'Mutuelle (franchise)', 6, 'sante'], ['2026-10', 10, 'Restaurant', 50, 'love'], ['2026-10', 12, 'Vignette', 90, 'voiture'],
  ['2026-11', 28, 'Cinéma', 14, 'perso'], ['2026-11', 21, 'Vêtements', 48, 'perso'], ['2026-11', 18, 'Pharmacie', 24, 'sante'], ['2026-11', 9, 'Ostéopathe', 70, 'sante'],
  ['2026-11', 24, 'Anniversaire Maman', 45, 'love'], ['2026-11', 29, 'Parking', 50, 'voiture'], ['2026-11', 11, 'Étagère', 55, 'projets'],
];

const DEC_TX: [number, string, number, TxType, string, 'vir' | 'esp'][] = [
  [1, 'Carrefour', 128.4, 'var', 'v-ali', 'vir'], [7, 'Marché', 54, 'var', 'v-ali', 'esp'], [14, 'Biocoop', 130, 'var', 'v-ali', 'vir'], [5, 'Cinéma', 29.9, 'var', 'v-loi', 'vir'],
  [12, 'Bowling', 55, 'var', 'v-loi', 'esp'], [18, 'Concert', 80, 'var', 'v-loi', 'vir'], [4, 'Boulangerie', 12.5, 'var', 'v-sn', 'esp'], [11, 'Distributeur', 10, 'var', 'v-sn', 'esp'],
  [6, 'Déjeuner équipe', 38, 'var', 'v-de', 'vir'], [13, 'Déjeuner équipe', 40, 'var', 'v-de', 'vir'], [8, 'Station Total', 71.2, 'var', 'v-ca', 'vir'], [1, 'Swile', 60, 'var', 'v-sw', 'vir'],
  [4, 'Coiffeur', 28, 'env', 'perso', 'esp'], [2, 'Librairie', 20, 'env', 'perso', 'vir'], [6, 'Fleurs', 35, 'env', 'love', 'vir'], [5, 'Lavage', 12, 'env', 'voiture', 'esp'],
  [9, 'Péage', 50, 'env', 'voiture', 'vir'], [10, 'Matériaux salle de bain', 220, 'epa', 'e-ld', 'vir'], [15, 'Billets avion', 80, 'epa', 'e-ly', 'vir'],
];

const VAR_FACTORS: Record<MonthKey, number[]> = { '2026-10': [0.94, 1.1, 0.8, 0.9, 1.05, 1], '2026-11': [1.02, 0.85, 1.2, 0.75, 0.95, 1] };

const PLANNED: [number, string, number, string][] = [
  [0, 'Cadeaux anniversaire', 80, 'love'], [0, 'Abonnement Prime', 49, 'perso'], [1, 'Saint-Valentin', 90, 'love'], [2, 'Dentiste', 60, 'sante'], [2, 'Optique', 150, 'sante'],
  [3, 'Assurance annuelle auto', 420, 'voiture'], [4, 'Vêtements été', 120, 'perso'], [5, 'Contrôle technique', 90, 'voiture'], [6, 'Cadeau de mariage', 100, 'love'],
  [7, 'Pneus hiver', 240, 'voiture'], [8, 'Solde impôts', 600, 'impots'], [9, 'Entretien voiture', 100, 'voiture'], [9, 'Taxe foncière', 900, 'impots'],
  [10, 'Ostéopathe', 70, 'sante'], [11, 'Dentiste', 60, 'sante'], [11, 'Cadeaux de Noël', 150, 'love'],
];

/** Account of an envelope of the example (spec 0011). */
const envelopeAccountId = (envelopeId: string) => `acc-env-${envelopeId}`;

export function seedData(): BudgetData {
  const template = {
    lines: LINES.map(([block, section, key, name, budget]) => ({ block, section, key, name, budget })),
    envAlloc: Object.fromEntries(ENVELOPES.map(e => [e.id, e.alloc])),
  };
  const transactions: Transaction[] = [];
  let txn = 0;
  const tx = (month: MonthKey, day: number, label: string, amount: number, type: TxType, target: string, source: 'vir' | 'esp' = 'vir') =>
    // An envelope expense is always on the account of its envelope (spec 0011, RG10).
    transactions.push({ id: `t${++txn}`, month, day, label, amount: round2(amount), type, target, ...(type === 'env' ? { accountId: envelopeAccountId(target) } : source === 'esp' ? { accountId: CASH_ACCOUNT_ID } : {}) });

  // Imported history: envelopes Jan → Sep, statements Jul → Sep.
  const envHistory: BudgetData['envHistory'] = {};
  for (let m = 0; m < 9; m++) {
    const rec: Record<string, EnvHistory> = {};
    for (const e of ENVELOPES) {
      const bal = ENV_BALANCES[e.id][m];
      const prev = m ? ENV_BALANCES[e.id][m - 1] : bal;
      let alloc = e.alloc;
      let spent = prev + alloc - bal;
      if (spent < 0) { alloc -= spent; spent = 0; }
      rec[e.id] = { alloc, spent, balance: bal };
    }
    envHistory[monthKey(2026, m)] = rec;
  }
  const statements: BudgetData['statements'] = {};
  ['2026-07', '2026-08', '2026-09', '2026-10', '2026-11'].forEach((m, i) => {
    statements[m] = Object.fromEntries(Object.entries(STATEMENTS).map(([k, v]) => [k, v[i]]));
  });
  statements['2026-12'] = { ...DEC_STATEMENTS };

  // App months.
  const months: BudgetData['months'] = {};
  const decLines: Line[] = LINES.map(([block, section, key, name, budget, actual]) => ({ block, section, key, name, budget, actual }));
  for (const m of ['2026-10', '2026-11']) {
    const prevM = addMonths(m, -1);
    const varIdx = { i: 0 };
    const lines = decLines.map(l => {
      let actual: number | null = l.budget;
      if (l.block === 'var') actual = round2(l.budget * VAR_FACTORS[m][varIdx.i++]);
      if (l.block === 'epa' || l.block === 'inv') {
        // Paid-in = statement change; a drop is recorded as a withdrawal.
        const diff = round2(statements[m][l.key] - statements[prevM][l.key]);
        actual = Math.max(0, diff);
        if (diff < 0) tx(m, 20, 'Retrait', -diff, 'epa', l.key);
      }
      return { ...l, actual };
    });
    months[m] = { initialized: true, lines, alloc: { ...template.envAlloc }, transfersDone: { bou: true, ce: true, lyd: true, ram: true } };
  }
  months['2026-12'] = { initialized: true, lines: decLines, alloc: { ...template.envAlloc }, transfersDone: { bou: true, ce: true, lyd: true } };

  // Pointage examples (spec 0009): planned days and modes on a few lines, in the model and in December (Oct/Nov stay without, they would all read « en retard »); a few lines of December checked.
  const SCHEDULE: Record<string, { dueDay: number; execMode: Line['execMode'] }> = {
    'r-sal': { dueDay: 28, execMode: 'virement_auto' }, 'c-108': { dueDay: 5, execMode: 'prelevement' }, 'f-nf': { dueDay: 8, execMode: 'prelevement' }, 'f-tan': { dueDay: 10, execMode: 'prelevement' },
    'f-cj': { dueDay: 2, execMode: 'virement_auto' }, 'e-la': { dueDay: 3, execMode: 'virement_auto' }, 'i-pea': { dueDay: 15, execMode: 'virement_manuel' },
  };
  for (const l of [...template.lines, ...months['2026-12'].lines]) Object.assign(l, SCHEDULE[l.key]);
  const decChecks: Record<string, LineCheck> = { 'c-108': { doneOn: '2026-12-05' }, 'f-cj': { doneOn: '2026-12-02' }, 'e-la': { doneOn: '2026-12-03' } };
  // December is counted at the checks: the allocations of the envelopes are checked, so they reach their accounts (spec 0011, RG6).
  for (const e of ENVELOPES) decChecks[`env:${e.id}`] = { doneOn: '2026-12-01' };
  months['2026-12'].checks = decChecks;

  // Envelope spending of Oct/Nov, so balances land on the Dec figures.
  for (const e of ENVELOPES) {
    const decSpent = DEC_TX.filter(t => t[3] === 'env' && t[4] === e.id).reduce((s, t) => s + t[2], 0);
    const novEnd = e.solde - e.alloc + decSpent;
    const ends: Record<string, number> = { '2026-10': ENV_BALANCES[e.id][9], '2026-11': novEnd };
    let prev = ENV_BALANCES[e.id][8];
    for (const m of ['2026-10', '2026-11']) {
      let spent = round2(prev + e.alloc - ends[m]);
      if (spent < 0) { months[m].alloc[e.id] = e.alloc - spent; spent = 0; }
      for (const [tm, day, label, amount, id] of ENV_TX) if (tm === m && id === e.id) { tx(m, day, label, amount, 'env', id); spent -= amount; }
      if (spent > 0.005) tx(m, 25, 'Dépenses diverses', spent, 'env', e.id);
      prev = ends[m];
    }
  }
  for (const [day, label, amount, type, target, source] of DEC_TX) tx('2026-12', day, label, amount, type, target, source);

  // Since spec 0019 an allocation only moves money when the funding is recorded: each month's allocation is a real transfer from the main
  // account to the envelope's account, attached to the envelope, on the 1st.
  const accountMovements: AccountMovement[] = [];
  for (const m of ['2026-10', '2026-11', '2026-12']) {
    for (const e of ENVELOPES) {
      const amount = months[m].alloc[e.id] ?? 0;
      if (amount > 0) accountMovements.push({ id: `fund-${m}-${e.id}`, month: m, day: 1, label: `Alimentation ${e.name}`, amount, fromAccountId: MAIN_ACCOUNT_ID, toAccountId: envelopeAccountId(e.id), target: { kind: 'env', id: e.id } });
    }
  }

  return {
    version: 1,
    firstMonth: '2026-10',
    template,
    months,
    envelopes: ENVELOPES.map(({ id, name, hue, cash }) => ({ id, name, hue, openingCash: cash, accountId: envelopeAccountId(id) })),
    // Each envelope opens its account on the first month with its balance at the end of September.
    accounts: [...defaultBankAccounts('2026-10'), ...ENVELOPES.map(e => newEnvelopeAccount(envelopeAccountId(e.id), e.id, e.name, e.hue, ENV_BALANCES[e.id][8], '2026-10'))],
    envHistory,
    statements,
    transactions,
    accountMovements,
    transfers: [
      { id: 'bou', name: 'Boursorama', amount: 360 }, { id: 'ce', name: 'Caisse d’épargne', amount: 400 }, { id: 'lyd', name: 'Lydia', amount: 100 },
      { id: 'ram', name: 'Ramify', amount: 100 }, { id: 'icm', name: 'Interne CM', amount: 0 }, { id: 'bd', name: 'Bourse Direct', amount: 0 },
      { id: 'trr', name: 'Trade Republic', amount: 0 }, { id: 'esp', name: 'Espèces', amount: 0 }, { id: 'cm', name: 'Crédit Mutuel', amount: 0 },
    ].map(t => ({ ...t, fromAccountId: MAIN_ACCOUNT_ID })),
    planned: PLANNED.map(([month, label, amount, envelopeId], i) => ({ id: `p${i}`, year: 2026, month, label, amount, envelopeId })),
    closes: { 2026: { closed: false, overrides: { 'acc:e-vc': 300 } } },
    settings: { emergencyAccounts: ['e-la', 'e-ld'], emergencyTarget: 22950, investTarget: 20000, savingsRateTarget: 60 },
  };
}
