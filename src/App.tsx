import { useState } from 'react';
import { Icon, type IconName } from './components/Icon';
import { currentMonthKey, monthLabel, parseMonth } from './domain/format';
import { useStore } from './state/store';
import { useUi } from './state/ui';
import { BudgetScreen, BudgetActions } from './screens/Budget';
import { ClosingScreen } from './screens/Closing';
import { EnvelopesScreen } from './screens/Envelopes';
import { ExpensesScreen } from './screens/Expenses';
import { PlanningScreen } from './screens/Planning';

export type Screen = 'budget' | 'dep' | 'env' | 'prevAnn' | 'close';

const NAV: { id: Screen | 'goals' | 'invest'; label: string; icon: IconName; soon?: boolean }[] = [
  { id: 'budget', label: 'Budget', icon: 'budget' },
  { id: 'dep', label: 'Dépenses', icon: 'list' },
  { id: 'env', label: 'Enveloppes', icon: 'mail' },
  { id: 'prevAnn', label: 'Prévisionnel', icon: 'calendar' },
  { id: 'close', label: 'Clôture', icon: 'calendarCheck' },
  { id: 'goals', label: 'Objectifs', icon: 'target', soon: true },
  { id: 'invest', label: 'Placements', icon: 'trend', soon: true },
];

const TITLES: Record<Screen, string> = {
  budget: 'Budget mensuel',
  dep: 'Dépenses et soldes',
  env: 'Enveloppes',
  prevAnn: 'Prévisionnel annuel',
  close: 'Clôture de l’année',
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

export function App() {
  const { data, ledger } = useStore();
  const { setEditing, menu, closeMenu } = useUi();
  const [screen, setScreen] = useState<Screen>('budget');
  const [month, setMonthState] = useState(() => {
    const saved = readSavedMonth();
    if (saved && ledger.months.includes(saved)) return saved;
    const ready = ledger.months.filter(m => data.months[m]?.initialized);
    return ready[ready.length - 1] ?? ledger.months[0];
  });
  const setMonth = (m: string) => {
    setMonthState(m);
    saveMonth(m);
  };
  const [year, setYear] = useState(() => parseMonth(currentMonthKey()).year);
  const [monthMenu, setMonthMenu] = useState(false);

  const months = ledger.months;
  const idx = months.indexOf(month);
  const go = (s: Screen) => {
    setScreen(s);
    setEditing(null);
    setMonthMenu(false);
  };
  const firstYear = parseMonth(data.firstMonth).year;
  const lastYear = parseMonth(months[months.length - 1]).year;

  return (
    <div className="app">
      <nav className="sidebar">
        <div className="brand">b</div>
        {NAV.map(n => (
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
      </nav>

      <main className="main">
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
          ) : (
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
          <div style={{ flex: 1 }} />
          {screen === 'budget' && <BudgetActions month={month} />}
        </header>

        {screen === 'budget' && <BudgetScreen month={month} />}
        {screen === 'dep' && <ExpensesScreen month={month} />}
        {screen === 'env' && <EnvelopesScreen month={month} />}
        {screen === 'prevAnn' && <PlanningScreen year={year} />}
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
