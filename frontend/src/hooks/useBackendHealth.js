import { useState, useEffect } from 'react';
import * as api from '../services/api';

// Demo mode: skip backend health check (for GitHub Pages deployment)
const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true';

/**
 * Custom hook for backend health checking and connection management
 * Retries connection up to 30 times (30 seconds) before showing error
 * In demo mode, immediately returns ready state without checking backend
 */
export default function useBackendHealth() {
  const [backendReady, setBackendReady] = useState(DEMO_MODE);
  const [backendError, setBackendError] = useState(null);

  useEffect(() => {
    // Skip health check in demo mode
    if (DEMO_MODE) {
      return;
    }

    const checkBackendHealth = async () => {
      let retryCount = 0;
      const maxRetries = 30; // 30 retries = 30 seconds

      while (retryCount < maxRetries) {
        try {
          await api.healthCheck();
          setBackendReady(true);
          setBackendError(null);
          return;
        } catch (err) {
          retryCount++;
          if (retryCount >= maxRetries) {
            setBackendError('Backend is not responding. Please check if the service is running.');
            return;
          }
          // Wait 1 second before retrying
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
    };

    checkBackendHealth();
  }, []);

  return {
    backendReady,
    backendError,
  };
}
