import { useState } from 'react';
import { addNote, deleteNote, toggleNote } from '../../application/monthNotes';
import { DETAIL_MAX } from '../../domain/detail';
import type { DashboardNotes } from '../../domain/dashboard';
import type { MonthKey } from '../../domain/types';
import { newId, useStore } from '../state/store';
import { Icon } from './Icon';

/** « Notes du mois » (spec 0027, RG12): tick, delete, and add with Entrée. An empty text is refused without a message. Writes at once, even on a locked month. */
export function MonthNotes({ month, notes }: { month: MonthKey; notes: DashboardNotes }) {
  const { update } = useStore();
  const [text, setText] = useState('');
  const submit = () => {
    if (text.trim() === '') return;
    update(d => void addNote(d, month, newId('n'), text));
    setText('');
  };
  return (
    <div className="panel dash-card">
      <div className="dash-card-head">
        <div className="dash-card-title">Notes du mois</div>
        <span className="dash-count">{notes.done} / {notes.items.length}</span>
      </div>
      <div className="dash-notes">
        {notes.items.map(n => (
          <div key={n.id} className={`dash-note${n.done ? ' is-done' : ''}`}>
            <button type="button" className={`dash-check${n.done ? ' is-on' : ''}`} role="checkbox" aria-checked={n.done} aria-label={n.text} onClick={() => update(d => void toggleNote(d, month, n.id))}>
              {n.done && <Icon name="check" size={12} stroke={3.4} />}
            </button>
            <span className="dash-note-text">{n.text}</span>
            <button type="button" className="dash-note-x" title="Supprimer la note" aria-label="Supprimer la note" onClick={() => update(d => void deleteNote(d, month, n.id))}>
              <Icon name="close" size={12} stroke={2.4} />
            </button>
          </div>
        ))}
        <label className="dash-note-add">
          <Icon name="plus" size={13} stroke={2.4} />
          <input value={text} maxLength={DETAIL_MAX} placeholder="Ajouter une note, puis Entrée" onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} />
        </label>
      </div>
    </div>
  );
}
