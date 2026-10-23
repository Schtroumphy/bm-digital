import { isLinkableAccount, linkableAccounts, removeImportAccountLink, setImportAccountLink } from '../../application/accountLinks';
import { isEnvelopeAccount } from '../../domain/bank';
import { newId, useStore } from '../state/store';

/**
 * « Correspondances de comptes » (spec 0013, RG32): which account of the app each account of the bank file goes to.
 * A match can be changed, set to « Ne pas importer » or deleted (the pair is then asked again at the next import).
 * Changing a match touches no transaction already imported.
 */
export function AccountLinks({ onBack }: { onBack: () => void }) {
  const { data, update } = useStore();
  const links = data.importAccountLinks ?? [];
  return (
    <div className="import-body">
      <div className="field-label">Correspondances de comptes</div>
      {links.length === 0 && <div className="empty">Aucune correspondance : elles sont demandées à l’import d’un fichier.</div>}
      {links.map(l => {
        const broken = l.accountId !== null && !isLinkableAccount(data, l.accountId);
        return (
          <div key={l.id} className="links-grid import-row">
            <span className="ellipsis" title={l.accountName}>
              {l.accountName}
            </span>
            <span className="muted ellipsis">{l.connectionName}</span>
            <select
              className="su-select"
              value={broken ? '' : l.accountId ?? 'skip'}
              onChange={e => update(d => void setImportAccountLink(d, l.accountName, l.connectionName, e.target.value === 'skip' ? null : e.target.value, newId))}
            >
              {broken && <option value="">À rattacher</option>}
              <option value="skip">Ne pas importer</option>
              {linkableAccounts(data).map(a => (
                <option key={a.id} value={a.id}>
                  {a.name}{isEnvelopeAccount(a) ? ' (enveloppe)' : ''}
                </option>
              ))}
            </select>
            <button type="button" className="btn-quiet" onClick={() => update(d => void removeImportAccountLink(d, l.id))}>
              Supprimer
            </button>
          </div>
        );
      })}
      <div className="import-actions">
        <button type="button" className="btn-outline" onClick={onBack}>
          Retour
        </button>
      </div>
    </div>
  );
}
