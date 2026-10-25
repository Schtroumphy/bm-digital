import { money } from '../../domain/format';

/** Subtitle of an envelope card of the Enveloppes screen (spec 0026, RG12): the virtual and the cash balances, kept apart. */
export function EnvelopeBalances({ virtual, cash }: { virtual: number; cash: number }) {
  return (
    <div className="env-tile-alloc">
      Virtuel <b>{money(virtual)}</b> · Espèces <b>{money(cash)}</b>
    </div>
  );
}
