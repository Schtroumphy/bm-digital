import { createContext, useContext, useState, type ReactNode } from 'react';

export interface MenuItem {
  label: string;
  danger?: boolean;
  onSelect: () => void;
}

interface MenuState {
  x: number;
  y: number;
  title: string;
  items: MenuItem[];
}

interface Ui {
  /** Id of the one cell being edited, if any. */
  editing: string | null;
  setEditing: (id: string | null) => void;
  menu: MenuState | null;
  openMenu: (e: React.MouseEvent, title: string, items: MenuItem[]) => void;
  closeMenu: () => void;
}

const UiContext = createContext<Ui | null>(null);

export function UiProvider({ children }: { children: ReactNode }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const openMenu: Ui['openMenu'] = (e, title, items) => {
    e.preventDefault();
    setMenu({ x: Math.min(e.clientX, window.innerWidth - 230), y: Math.min(e.clientY, window.innerHeight - 50 - items.length * 36), title, items });
  };
  return <UiContext.Provider value={{ editing, setEditing, menu, openMenu, closeMenu: () => setMenu(null) }}>{children}</UiContext.Provider>;
}

export function useUi(): Ui {
  const u = useContext(UiContext);
  if (!u) throw new Error('useUi outside UiProvider');
  return u;
}
