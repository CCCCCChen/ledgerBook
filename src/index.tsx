import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import { ErrorBoundary } from 'react-error-boundary';
import App from './app';
import './index.css';
import { isElectronRuntime } from '@/lib/electron-api';

const APP_NAME = '个人收支预算管家';
const IN_ELECTRON = isElectronRuntime();
const browserBasename = import.meta.env.BASE_URL === './' ? '/' : import.meta.env.BASE_URL;
const Router = IN_ELECTRON ? HashRouter : BrowserRouter;

document.title = APP_NAME;

function RootErrorFallback({
  error,
  resetErrorBoundary,
}: {
  error: Error;
  resetErrorBoundary: () => void;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto flex max-w-xl flex-col gap-4 px-6 py-16">
        <h1 className="text-2xl font-semibold">{APP_NAME}</h1>
        <p className="text-sm text-muted-foreground">页面初始化失败，请重试。</p>
        <pre className="overflow-auto rounded-md border bg-muted p-4 text-xs text-muted-foreground">
          {error.message}
        </pre>
        <button
          type="button"
          onClick={resetErrorBoundary}
          className="w-fit rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
        >
          重新加载
        </button>
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Router basename={IN_ELECTRON ? undefined : browserBasename}>
      <ErrorBoundary fallbackRender={RootErrorFallback}>
        <App />
      </ErrorBoundary>
    </Router>
  </StrictMode>,
);
