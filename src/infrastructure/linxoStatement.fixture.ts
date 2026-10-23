const HEADER = ['Date', 'Libellé', 'Catégorie', 'Montant', 'Notes', 'N° de chèque', 'Labels', 'Nom du compte', 'Nom de la connexion'].join('\t');
const line = (...cells: string[]) => cells.join('\t');

/**
 * Anonymized Linxo export (spec 0013, amendment 1): tab separated, two accounts of one connection and one of another,
 * a card payment, a withdrawal, a transfer, two credits (one for a thousand euros without decimals), a label with
 * doubled quotes and a last record cut in the middle.
 */
export const LINXO_SAMPLE = [
  HEADER,
  line('21/10/2026', 'LA CREPERIE EXEMPLE', 'Restaurants', '-2,95', 'PAIEMENT PAR CARTE X2222 LA CREPERIE EXEMPLE 21/10', '', '', 'Compte Courant (x1111)', 'Banque Test'),
  line('20/10/2026', 'RETRAIT DAB', 'Retrait', '-40', 'RETRAIT AU DISTRIBUTEUR X2222 20/10', '', '', 'Compte Courant (x1111)', 'Banque Test'),
  line('19/10/2026', 'VIREMENT EMIS MR DUPONT', 'Virement', '-188,58', 'VIREMENT EMIS MR DUPONT', '', '', 'Compte Courant (x1111)', 'Banque Test'),
  line('18/10/2026', 'REMBOURSEMENT AMI', 'Virement reçu', '217,8', 'VIREMENT EN VOTRE FAVEUR', '', '', 'Compte Courant (x1111)', 'Banque Test'),
  line('01/10/2026', 'SALAIRE', 'Salaire', '1600', 'VIREMENT SALAIRE', '', '', 'Compte Courant (x1111)', 'Banque Test'),
  line('17/10/2026', '"BOULANGERIE ""CHEZ MAX"""', 'Alimentation', '-3,40', '', '', '', 'Livret A (x1234)', 'Banque Test'),
  line('16/10/2026', 'PAIEMENT CARTE SWILE', 'Restaurants', '-9.5', 'PAIEMENT PAR CARTE X1111 RESTO 16/10', '', '', 'Compte Swile (x9999)', 'Autre Banque'),
  line('15/10/2026', '"PAIEMENT TRONQUE'),
].join('\n');
