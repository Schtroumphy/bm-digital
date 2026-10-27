import { useState } from 'react';
import { addLineEntry } from '../../application/quickEntry';
import type { Line, MonthKey } from '../../domain/types';
import { newId, useStore } from '../state/store';
import { Icon } from './Icon';
import { QuickEntryPopup } from './QuickEntryPopup';

/**
 * « + Écriture » on a line of the Budget screen (spec 0019, RG21): a small icon, visible only when the row is hovered or has the keyboard focus,
 * drawn over the end of the name so the row never changes height or alignment. It opens a small form (amount, day, label) that records a real
 * entry on the account imposed by the line. Hidden when the month is locked or when the line cannot take an entry (savings line with no dedicated account).
 */
export function LineQuickEntry({ month, line, locked }: { month: MonthKey; line: Line; locked: boolean }) {
  const { update } = useStore();
  const [open, setOpen] = useState(false);
  const savings = line.block === 'epa' || line.block === 'inv';
  if (locked || (savings && !line.linkedAccountId)) return null;
  return (
    <>
      <button type="button" className="line-add" title="Ajouter une écriture" aria-label={`Ajouter une écriture sur ${line.name}`} onClick={e => { e.stopPropagation(); setOpen(o => !o); }}>
        <Icon name="plus" size={11} stroke={3} />
      </button>
      {open && (
        <QuickEntryPopup
          month={month}
          name={line.name}
          onClose={() => setOpen(false)}
          onSave={input => {
            update(d => void addLineEntry(d, month, line.key, { id: newId('t'), ...input }));
            setOpen(false);
          }}
        />
      )}
    </>
  );
}
