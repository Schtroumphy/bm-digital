import { describe, expect, it } from 'vitest';
import { LINXO_SAMPLE } from './linxoStatement.fixture';
import { createLinxoStatementSource, decodeStatement, parseLinxoStatement } from './linxoStatement';

const HEAD = 'Date\tLibellé\tCatégorie\tMontant\tNotes\tN° de chèque\tLabels\tNom du compte\tNom de la connexion\n';
const rec = (date: string, label: string, amount: string, account = 'Compte (x1)', connection = 'Banque') => `${date}\t${label}\tCat\t${amount}\tnotes ${label}\t\t\t${account}\t${connection}`;

describe('lecteur Linxo', () => {
  it('CA25: lit chaque enregistrement (tabulation, plusieurs comptes) avec date, libellé, notes, montant positif, sens, compte et connexion', () => {
    const r = parseLinxoStatement(LINXO_SAMPLE);
    expect(r.fileError).toBeUndefined();
    expect(r.rows).toHaveLength(7);
    expect(r.rows[0]).toEqual({
      date: '2026-10-21', label: 'LA CREPERIE EXEMPLE', notes: 'PAIEMENT PAR CARTE X2222 LA CREPERIE EXEMPLE 21/10', category: 'Restaurants',
      accountName: 'Compte Courant (x1111)', connectionName: 'Banque Test', amount: 2.95, direction: 'debit',
    });
    expect(new Set(r.rows.map(x => `${x.accountName}|${x.connectionName}`)).size).toBe(3);
    expect(r.rows[5]).toMatchObject({ label: 'BOULANGERIE "CHEZ MAX"', notes: '', amount: 3.4 });
  });

  it('CA26: -2,95 est un débit de 2,95 ; 217,8 et 1600 sont des crédits ; la décimale « . » est acceptée', () => {
    const r = parseLinxoStatement(LINXO_SAMPLE);
    expect(r.rows[0]).toMatchObject({ amount: 2.95, direction: 'debit' });
    expect(r.rows[3]).toMatchObject({ amount: 217.8, direction: 'credit' });
    expect(r.rows[4]).toMatchObject({ amount: 1600, direction: 'credit' });
    expect(r.rows[6]).toMatchObject({ amount: 9.5, direction: 'debit' });
  });

  it('CA28: le dernier enregistrement tronqué est signalé avec son numéro, les autres sont lus', () => {
    const r = parseLinxoStatement(LINXO_SAMPLE);
    expect(r.errors).toEqual([{ record: 8, reason: expect.stringContaining('tronqué') }]);
  });

  it('un enregistrement coupé avant la fin des colonnes est signalé, sans guillemet', () => {
    const r = parseLinxoStatement(HEAD + rec('01/10/2026', 'A', '-1,00') + '\n02/10/2026\tB\tCat\t-2,00');
    expect(r.rows).toHaveLength(1);
    expect(r.errors).toEqual([{ record: 2, reason: expect.stringContaining('colonnes manquantes') }]);
  });

  it('CA27: sans les colonnes requises, le fichier est refusé', () => {
    for (const text of ['Libellé\tMontant\tNom du compte\tNom de la connexion\n', 'Date\tLibellé\tNom du compte\tNom de la connexion\n', 'a;b;c\n1;2;3']) {
      const r = parseLinxoStatement(text + 'x');
      expect(r.fileError).toMatch(/en-tête/);
      expect(r.rows).toEqual([]);
    }
    expect(parseLinxoStatement('  \n ').fileError).toMatch(/vide/);
  });

  it('accepte « ; » en repli et ignore les colonnes facultatives absentes', () => {
    const r = parseLinxoStatement('Date;Libellé;Montant;Nom du compte;Nom de la connexion\n01/10/2026;A;-1,5;C;B');
    expect(r.errors).toEqual([]);
    expect(r.rows[0]).toMatchObject({ label: 'A', notes: '', category: '', amount: 1.5, direction: 'debit' });
  });

  it('signale date, montant ou compte invalides sans arrêter la lecture', () => {
    const r = parseLinxoStatement(
      HEAD + [rec('31/02/2026', 'A', '-1'), rec('01/10/2026', 'B', 'abc'), rec('01/10/2026', 'Z', '0'), rec('01/10/2026', 'S', '1 600'), rec('01/10/2026', 'NC', '-1', '', ''), rec('02/10/2026', 'C', '-3')].join('\n'),
    );
    expect(r.rows.map(x => x.label)).toEqual(['C']);
    expect(r.errors.map(e => e.record)).toEqual([1, 2, 3, 4, 5]);
  });

  it('gère les fins de ligne \\r\\n et un champ entre guillemets sur plusieurs lignes', () => {
    const r = parseLinxoStatement(HEAD.replace('\n', '\r\n') + '01/10/2026\t"Achat\r\nPARIS"\tCat\t-5,00\t\t\t\tC\tB\r\n');
    expect(r.errors).toEqual([]);
    expect(r.rows[0].label).toBe('Achat\r\nPARIS');
  });

  it('un guillemet isolé en milieu de fichier avale la suite : l’avertissement le dit', () => {
    const r = parseLinxoStatement(HEAD + [rec('01/10/2026', 'A', '-1'), '02/10/2026\t"B\tCat\t-2\t\t\t\tC\tB', rec('03/10/2026', 'D', '-3'), rec('04/10/2026', 'E', '-4')].join('\n'));
    expect(r.rows.map(x => x.label)).toEqual(['A']);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0].reason).toMatch(/lignes suivantes.*perdues/);
  });

  it('décode l’UTF-8 (BOM toléré), avec repli sur Windows-1252', () => {
    expect(decodeStatement(new TextEncoder().encode('Libellé émis'))).toBe('Libellé émis');
    expect(decodeStatement(Uint8Array.from([0xef, 0xbb, 0xbf, 0x4c, 0x69, 0x62]))).toBe('Lib');
    expect(decodeStatement(Uint8Array.from([0x4c, 0x69, 0x62, 0x65, 0x6c, 0x6c, 0xe9]))).toBe('Libellé');
    expect(parseLinxoStatement('﻿' + HEAD + rec('01/10/2026', 'A', '-1')).rows).toHaveLength(1);
  });

  it('la source lit des octets Windows-1252 de bout en bout', () => {
    const text = HEAD + rec('01/10/2026', 'Virement émis', '-5,00');
    const bytes = Uint8Array.from([...text].map(c => (c === 'é' ? 0xe9 : c === '°' ? 0xb0 : c.charCodeAt(0))));
    const r = createLinxoStatementSource().read(bytes);
    expect(r.fileError).toBeUndefined();
    expect(r.rows[0].label).toBe('Virement émis');
  });

  describe('en-tête du fichier réel (non-régression)', () => {
    const NAMES = ['Date', 'Libellé', 'Catégorie', 'Montant', 'Notes', 'N° de chèque', 'Labels', 'Nom du compte', 'Nom de la connexion'];
    const REAL_HEADER = NAMES.join('\t');
    const body = '\n' + ['21/10/2026', 'LA BOULE', 'Restaurants', '-2,95', 'PAIEMENT X2222', '', '', 'Compte Courant (x1111)', 'Banque Test'].join('\t');
    const utf16le = (t: string, bom: boolean) => Uint8Array.from([...(bom ? [0xff, 0xfe] : []), ...[...t].flatMap(c => [c.charCodeAt(0) & 255, c.charCodeAt(0) >> 8])]);

    it.each([
      ['forme NFC', REAL_HEADER + body],
      ['forme NFD (accents décomposés)', REAL_HEADER.normalize('NFD') + body.normalize('NFD')],
      ['casse et accents différents', REAL_HEADER.toUpperCase().replace('LIBELLÉ', 'LIBELLE') + body],
      ['espaces insécables et espaces autour des noms', REAL_HEADER.replace(/ /g, '\u00a0').replace(/\t/g, ' \t ') + body],
      ['BOM UTF-8', '\uFEFF' + REAL_HEADER + body],
      ['fins de ligne \\r\\n', REAL_HEADER + body.replace('\n', '\r\n') + '\r\n'],
      ['guillemets autour des en-têtes', NAMES.map(n => `"${n}"`).join('\t') + body],
      ['lignes avant l’en-tête', 'Export Linxo\n\n' + REAL_HEADER + body],
      ['colonnes facultatives absentes et ordre différent', ['Nom de la connexion', 'Nom du compte', 'Montant', 'Libellé', 'Date'].join('\t') + '\nBanque\tCompte\t-2,95\tLA BOULE\t21/10/2026'],
    ])('reconnaît l’en-tête : %s', (_, text) => {
      const r = parseLinxoStatement(text);
      expect(r.fileError).toBeUndefined();
      expect(r.rows).toHaveLength(1);
      expect(r.rows[0]).toMatchObject({ label: 'LA BOULE', amount: 2.95, direction: 'debit' });
    });

    it('lit un fichier UTF-16 (Texte Unicode d’Excel), avec ou sans BOM', () => {
      for (const bom of [true, false]) {
        const r = createLinxoStatementSource().read(utf16le(REAL_HEADER + body, bom));
        expect(r.fileError).toBeUndefined();
        expect(r.rows[0]).toMatchObject({ label: 'LA BOULE', accountName: 'Compte Courant (x1111)' });
      }
    });

    it('le message d’erreur liste les colonnes attendues et les colonnes trouvées', () => {
      const r = parseLinxoStatement('Date Libellé Catégorie Montant\nx');
      expect(r.fileError).toMatch(/Date, Libellé, Montant, Nom du compte et Nom de la connexion/);
      expect(r.fileError).toMatch(/une seule colonne trouvée.*Date Libellé Catégorie Montant/);
      const partial = parseLinxoStatement('Date\tLibellé\tMontant\nx');
      expect(partial.fileError).toMatch(/3 colonnes trouvées : Date \| Libellé \| Montant/);
    });
  });
});
