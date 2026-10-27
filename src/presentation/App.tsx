import { useState } from 'react';
import type { StatementSource } from '../application/ports';
import { Icon, type IconName } from './components/Icon';
import { currentMonthKey, monthLabel, parseMonth } from '../domain/format';
import { isMonthLocked } from '../domain/ledger';
import { useAuth } from './state/auth';
import { useStore } from './state/store';
import { useUi } from './state/ui';
import { AccountsActions, AccountsScreen } from './screens/Accounts';
import { BudgetScreen, BudgetActions, MonthCloseControl } from './screens/Budget';
import { ClosingScreen } from './screens/Closing';
import { DashboardScreen, type DashboardTarget } from './screens/Dashboard';
import { EnvelopesBalanceTotal, EnvelopesScreen } from './screens/Envelopes';
import { ExpensesScreen } from './screens/Expenses';
import { GoalsScreen } from './screens/Goals';
import { PlanningScreen } from './screens/Planning';
import { SetupActions, SetupScreen } from './screens/Setup';
import { TemplateScreen } from './screens/Template';
import { useSetupDraft } from './state/setupDraft';

export type Screen = 'dashboard' | 'budget' | 'dep' | 'env' | 'comptes' | 'prevAnn' | 'template' | 'setup' | 'close' | 'goals';

const NAV: { id: Screen | 'invest'; label: string; icon: IconName; soon?: boolean }[] = [
  { id: 'dashboard', label: 'Accueil', icon: 'house' },
  { id: 'budget', label: 'Budget', icon: 'budget' },
  { id: 'dep', label: 'Opérations', icon: 'list' },
  { id: 'comptes', label: 'Comptes', icon: 'bank' },
  { id: 'env', label: 'Enveloppes', icon: 'mail' },
  { id: 'prevAnn', label: 'Prévisionnel', icon: 'calendar' },
  { id: 'template', label: 'Modèle', icon: 'copy' },
  { id: 'goals', label: 'Objectifs', icon: 'target' },
  { id: 'invest', label: 'Placements', icon: 'trend', soon: true },
  { id: 'setup', label: 'Démarrage', icon: 'flag' },
  { id: 'close', label: 'Clôture', icon: 'calendarCheck' },
];

const TITLES: Record<Screen, string> = {
  dashboard: 'Tableau de bord',
  budget: 'Budget mensuel',
  dep: 'Opérations et soldes',
  env: 'Enveloppes',
  comptes: 'Comptes',
  prevAnn: 'Prévisionnel annuel',
  template: 'Modèle de budget',
  setup: 'Initialisation',
  close: 'Clôture de l’année',
  goals: 'Objectifs',
};

const MONTH_KEY = 'budget-perso:month';
const readSavedMonth = () => {
  try {
    return localStorage.getItem(MONTH_KEY);
  } catch {
    return null;
  }
};
const saveMonth = (m: string) => {
  try {
    localStorage.setItem(MONTH_KEY, m);
  } catch {
    // Remembering the month is a convenience only.
  }
};

export function App({ statementSource }: { statementSource: StatementSource }) {
  const { data, ledger, saveStatus, retrySave, clearedActuals, dismissClearedActuals } = useStore();
  const { user, signOut } = useAuth();
  const { setEditing, menu, closeMenu } = useUi();
  // Until the first month exists, the only usable screen is the assistant.
  const [screenState, setScreen] = useState<Screen>(() => (data.firstMonth === null ? 'setup' : 'dashboard'));
  const screen: Screen = data.firstMonth === null ? 'setup' : screenState;
  const [draft, setDraft] = useSetupDraft();
  const [monthState, setMonthState] = useState(readSavedMonth() ?? '');
  const months = ledger.months;
  const month = (() => {
    if (months.includes(monthState)) return monthState;
    const ready = months.filter(m => data.months[m]?.initialized);
    return ready[ready.length - 1] ?? months[0] ?? currentMonthKey();
  })();
  const setMonth = (m: string) => {
    setCloseAttempt(false);
    setMonthState(m);
    saveMonth(m);
  };
  const [year, setYear] = useState(() => parseMonth(currentMonthKey()).year);
  const [monthMenu, setMonthMenu] = useState(false);
  // « Clôturer le mois » was clicked and refused: the Budget screen explains why until the user dismisses it.
  const [closeAttempt, setCloseAttempt] = useState(false);

  // « Alimenter en espèces » (spec 0026): the envelope whose transfer form the Saisie screen opens prefilled, until it has used it.
  const [fundEnvelope, setFundEnvelope] = useState<string | null>(null);

  const idx = months.indexOf(month);
  // Tab of Opérations opened by the dashboard's « soldes à saisir » (spec 0027, RG10); the sidebar always opens « Saisie ».
  const [expensesTab, setExpensesTab] = useState<'saisie' | 'soldes'>('saisie');
  const go = (s: Screen) => {
    setExpensesTab('saisie');
    setScreen(s);
    setCloseAttempt(false);
    setEditing(null);
    setMonthMenu(false);
  };
  // The « Démarrage » assistant is only for starting out: it goes away once the first month is closed.
  const started = data.firstMonth !== null && isMonthLocked(data, data.firstMonth);
  const firstYear = data.firstMonth === null ? year : parseMonth(data.firstMonth).year;
  const lastYear = months.length ? parseMonth(months[months.length - 1]).year : year;

  return (
    <div className="app">
      <nav className="sidebar">
        <div className="brand">b</div>
        {NAV.filter(n => !(n.id === 'setup' && started)).map(n => (
          <div
            key={n.id}
            className={`nav-item${screen === n.id ? ' is-active' : ''}${n.soon ? ' is-soon' : ''}`}
            title={n.soon ? `${n.label} · bientôt disponible` : n.label}
            onClick={n.soon ? undefined : () => go(n.id as Screen)}
          >
            <Icon name={n.icon} size={20} stroke={2} />
            <span>{n.label}</span>
          </div>
        ))}
        <div className="sidebar-foot">
          <div className={`save-status is-${saveStatus}`} role="status">
            {saveStatus === 'saving' ? 'Enregistrement…' : saveStatus === 'error' ? 'Non enregistré' : 'Enregistré'}
          </div>
          <button type="button" className="nav-item" title={`Se déconnecter (${user.email})`} onClick={() => void signOut()}>
            <Icon name="logout" size={20} stroke={2} />
            <span>Quitter</span>
          </button>
        </div>
      </nav>

      <main className="main">
        {saveStatus === 'error' && (
          <div className="banner is-error" role="alert">
            <div className="banner-title">Les dernières modifications ne sont pas enregistrées</div>
            <div style={{ flex: 1 }} />
            <button type="button" className="btn-dark" onClick={retrySave}>
              Réessayer
            </button>
          </div>
        )}
        {clearedActuals > 0 && (
          <div className="banner" role="status">
            <div style={{ flex: 1 }}>
              <div className="banner-title">
                {clearedActuals} {clearedActuals > 1 ? 'réels saisis à la main ne comptent plus' : 'réel saisi à la main ne compte plus'}
              </div>
              <div className="banner-text">Le réel d’une ligne est maintenant la somme de ses écritures : saisissez les écritures correspondantes.</div>
            </div>
            <button type="button" className="btn-quiet" onClick={dismissClearedActuals}>
              Compris
            </button>
          </div>
        )}
        <header className="header">
          <div className="title">{TITLES[screen]}</div>
          {screen === 'prevAnn' || screen === 'close' ? (
            <div className="picker">
              <button className="picker-arrow" disabled={year <= firstYear} onClick={() => setYear(y => y - 1)} aria-label="Année précédente">
                <Icon name="chevronLeft" />
              </button>
              <div className="picker-label is-year">Année {year}</div>
              <button className="picker-arrow" disabled={year >= lastYear} onClick={() => setYear(y => y + 1)} aria-label="Année suivante">
                <Icon name="chevronRight" />
              </button>
            </div>
          ) : screen === 'setup' || screen === 'template' || screen === 'goals' ? null : (
            <div className="picker">
              <button className="picker-arrow" disabled={idx <= 0} onClick={() => setMonth(months[idx - 1])} aria-label="Mois précédent">
                <Icon name="chevronLeft" />
              </button>
              <div className="picker-label" onClick={() => setMonthMenu(o => !o)}>
                {monthLabel(month)}
                <Icon name="chevronDown" size={14} />
              </div>
              <button className="picker-arrow" disabled={idx >= months.length - 1} onClick={() => setMonth(months[idx + 1])} aria-label="Mois suivant">
                <Icon name="chevronRight" />
              </button>
              {monthMenu && (
                <>
                  <div className="backdrop" onClick={() => setMonthMenu(false)} />
                  <div className="popmenu month-menu">
                    {months.map(m => (
                      <div
                        key={m}
                        className={`popmenu-item${m === month ? ' is-active' : ''}`}
                        onClick={() => {
                          setMonth(m);
                          setMonthMenu(false);
                        }}
                      >
                        <span>{monthLabel(m)}</span>
                        <span className="popmenu-tag">{data.months[m]?.initialized ? '' : 'à créer'}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
          {screen === 'budget' && <MonthCloseControl month={month} onRefused={() => setCloseAttempt(true)} onDone={() => setCloseAttempt(false)} />}
          <div style={{ flex: 1 }} />
          {screen === 'budget' && <BudgetActions month={month} />}
          {screen === 'comptes' && <AccountsActions month={month} />}
          {screen === 'env' && <EnvelopesBalanceTotal month={month} />}
          {screen === 'setup' && <SetupActions setDraft={setDraft} />}
        </header>

        {screen === 'dashboard' && (
          <DashboardScreen
            month={month}
            onOpen={(t: DashboardTarget) => {
              go(t === 'balances' ? 'dep' : t);
              if (t === 'balances') setExpensesTab('soldes');
            }}
          />
        )}
        {screen === 'budget' && <BudgetScreen month={month} closeAttempt={closeAttempt} onDismissClose={() => setCloseAttempt(false)} />}
        {screen === 'dep' && <ExpensesScreen initialTab={expensesTab} month={month} statementSource={statementSource} fundEnvelope={fundEnvelope} onFundUsed={() => setFundEnvelope(null)} />}
        {screen === 'env' && <EnvelopesScreen month={month} onFundCash={id => { setFundEnvelope(id); go('dep'); }} />}
        {screen === 'comptes' && <AccountsScreen month={month} />}
        {screen === 'prevAnn' && <PlanningScreen year={year} />}
        {screen === 'template' && <TemplateScreen month={month} />}
        {screen === 'setup' && (
          <SetupScreen
            draft={draft}
            setDraft={setDraft}
            onOpenBudget={() => {
              setMonth(draft.month);
              go('budget');
            }}
          />
        )}
        {screen === 'goals' && <GoalsScreen />}
        {screen === 'close' && <ClosingScreen year={year} />}
      </main>

      {menu && (
        <>
          <div
            className="backdrop"
            onClick={closeMenu}
            onContextMenu={e => {
              e.preventDefault();
              closeMenu();
            }}
          />
          <div className="ctx-menu" style={{ left: menu.x, top: menu.y }}>
            <div className="ctx-title">{menu.title}</div>
            {menu.items.map(it => (
              <div
                key={it.label}
                className={`ctx-item${it.danger ? ' is-danger' : ''}`}
                onClick={() => {
                  it.onSelect();
                  closeMenu();
                }}
              >
                {it.danger && <Icon name="trash" size={15} />}
                {it.label}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
