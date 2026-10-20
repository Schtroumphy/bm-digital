import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './presentation/ds/organic.css';
import './presentation/app.css';
import { seedData } from './domain/seed';
import { localRepository } from './infrastructure/localRepository';
import { App } from './presentation/App';
import { StoreProvider } from './presentation/state/store';
import { UiProvider } from './presentation/state/ui';

// Composition root: the only place that picks the concrete repository.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider repository={localRepository} initialData={seedData}>
      <UiProvider>
        <App />
      </UiProvider>
    </StoreProvider>
  </StrictMode>,
);
