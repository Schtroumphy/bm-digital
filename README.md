# Budget Perso

Personal budget app, desktop only (1440 px), in French. It replaces the Google Sheet and implements the Claude Design handoff in `design/project/Budget Perso.dc.html`.

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # domain tests (figures of the design, ledger, year close)
npm run build
```

## Screens

| Screen | What it does |
| --- | --- |
| **Budget mensuel** | Summary band, the six budget blocks (click a cell to edit; Entrée validates, Échap cancels), a popover with the year-to-date total and last month's écart, right-click to delete a line, « + Ajouter », annual goals, envelopes with alerts, transfers checklist. An uninitialised month offers « Appliquer le modèle de budget ». « Dupliquer / appliquer le modèle » can apply the model, copy the previous month or save the month as the model. « Exporter CSV » downloads the month (semicolons, decimal commas). |
| **Dépenses** | *Saisie*: record an expense against a variable line, an envelope or a savings account, paid in cash or « virtuel », with a preview of its effect. *Soldes des comptes*: expected balance per account (start + paid in − withdrawals) against the statement you enter. |
| **Enveloppes** | Cumulative balance, allocation (editable), spent, planned, 12-month curve, cash/virtual split. Click a card for the drawer: cash amount, monthly history, linked transactions. Right-click deletes an envelope. |
| **Prévisionnel** | Planned expenses per month, linked to an envelope (click the dot to change it). The badge shows when an envelope can't cover its planned expenses (opening balance + allocation). |
| **Clôture** | Balances at 31 December, adjustable bases for 1 January, close or reopen the year. Closing locks the year's months and the next January starts from those bases. |

## Code

- `src/domain/`: pure logic: types, French formatting, the `Ledger` (envelope and account balances month by month), budget summaries, mutations and the sample data.
- `src/state/`: the store (React context) and the `BudgetRepository` interface. Data is saved to `localStorage` for now.
- `src/screens/`, `src/components/`: UI. Styles live in `src/app.css`, transcribed from the prototype, and sit on the Organic design-system sheet (`src/ds/organic.css`, which brings Figtree).

## Supabase

`supabase/schema.sql` is a draft schema mirroring `src/domain/types.ts`, with row-level security per user. To connect it, implement `BudgetRepository` with `@supabase/supabase-js` and pass it to `<StoreProvider repository={…}>`.

## Sample data

On first launch the app loads the design's sample figures (December 2026: reste à placer 2 950 €, taux d'épargne 51,8 %). Replace them with real figures. To start over, clear the site's storage.
