import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@govtechsg/sgds/css/sgds.css';
import './themes.css';
import './index.css';
import App from './App.jsx';
import ErrorBoundary from './components/Common/ErrorBoundary';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
