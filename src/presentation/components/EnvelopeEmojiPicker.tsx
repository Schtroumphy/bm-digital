import { useState } from 'react';
import { setEnvelopeEmoji } from '../../application/envelopes';
import { EMOJI_CHOICES } from '../../domain/categories';
import type { Envelope } from '../../domain/types';
import { useStore } from '../state/store';

/**
 * Button showing the emoji of an envelope and the menu to change it (spec 0056). Same look and choices as the categories.
 * The clicks stop here: the card holding the button opens the drawer on click, and the picker must not.
 */
export function EnvelopeEmojiPicker({ envelope }: { envelope: Pick<Envelope, 'id' | 'name' | 'emoji'> }) {
  const { update } = useStore();
  const [open, setOpen] = useState(false);
  const choose = (emoji: string) => {
    update(d => void setEnvelopeEmoji(d, envelope.id, emoji));
    setOpen(false);
  };
  return (
    <span className="acc-picker" onClick={e => e.stopPropagation()}>
      <button type="button" className="btn-outline emoji-btn" aria-label={`Choisir l’emoji de ${envelope.name}`} title="Choisir un emoji" onClick={() => setOpen(o => !o)}>
        {envelope.emoji || '＋'}
      </button>
      {open && (
        <>
          <div className="backdrop" onClick={() => setOpen(false)} />
          <div className="popmenu emoji-menu">
            {EMOJI_CHOICES.map(e => (
              <button key={e} type="button" className={`emoji-choice${envelope.emoji === e ? ' is-on' : ''}`} onClick={() => choose(e)}>
                {e}
              </button>
            ))}
            <button type="button" className="emoji-reset" onClick={() => choose('')}>
              Réinitialiser
            </button>
          </div>
        </>
      )}
    </span>
  );
}
