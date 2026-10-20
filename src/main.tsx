import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './ds/organic.css';
import './app.css';
import { App } from './App';
import { StoreProvider } from './state/store';
import { UiProvider } from './state/ui';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider>
      <UiProvider>
        <App />
      </UiProvider>
    </StoreProvider>
  </StrictMode>,
);
