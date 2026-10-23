import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './presentation/ds/organic.css';
import './presentation/app.css';
import { emptyData } from './domain/empty';
import { createLinxoStatementSource } from './infrastructure/linxoStatement';
import { createSupabaseAuth } from './infrastructure/supabaseAuth';
import { createSupabaseClient } from './infrastructure/supabaseClient';
import { createSupabaseRemote } from './infrastructure/supabaseRemote';
import { createSupabaseRepository } from './infrastructure/supabaseRepository';
import { App } from './presentation/App';
import { AuthGate } from './presentation/state/auth';
import { StoreProvider } from './presentation/state/store';
import { UiProvider } from './presentation/state/ui';

// Composition root: the only place that picks the concrete implementations.
const client = createSupabaseClient();
const auth = createSupabaseAuth(client);
const repository = createSupabaseRepository(createSupabaseRemote(client));
const statementSource = createLinxoStatementSource();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthGate auth={auth}>
      <StoreProvider repository={repository} initialData={emptyData}>
        <UiProvider>
          <App statementSource={statementSource} />
        </UiProvider>
      </StoreProvider>
    </AuthGate>
  </StrictMode>,
);
