/**
 * Hook for polling with configurable interval and max attempts
 */

import { useCallback, useRef } from 'react';

/**
 * Polling configuration
 */
interface PollingConfig {
  interval: number;
  maxAttempts: number;
}

/**
 * Polling hook return type
 */
interface UsePollingReturn {
  startPolling: (
    fn: () => Promise<boolean>,
    config?: Partial<PollingConfig>
  ) => Promise<void>;
  stopPolling: () => void;
  isPolling: () => boolean;
}

/**
 * Hook for polling a function until it returns true or max attempts reached
 * @returns Polling controls
 */
export function usePolling(): UsePollingReturn {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const shouldStopRef = useRef(false);

  const stopPolling = useCallback(() => {
    shouldStopRef.current = true;
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const isPolling = useCallback(() => {
    return timeoutRef.current !== null;
  }, []);

  const startPolling = useCallback(
    async (
      fn: () => Promise<boolean>,
      config?: Partial<PollingConfig>
    ): Promise<void> => {
      const { interval = 2000, maxAttempts = 1800 } = config || {};

      shouldStopRef.current = false;
      let attempts = 0;

      const poll = async (): Promise<void> => {
        if (shouldStopRef.current) {
          return;
        }

        if (attempts >= maxAttempts) {
          stopPolling();
          throw new Error('Polling timeout - maximum attempts reached');
        }

        try {
          const shouldContinue = await fn();

          if (!shouldContinue || shouldStopRef.current) {
            stopPolling();
            return;
          }

          // Schedule next poll
          attempts++;
          timeoutRef.current = setTimeout(poll, interval);
        } catch (error) {
          stopPolling();
          throw error;
        }
      };

      await poll();
    },
    [stopPolling]
  );

  return {
    startPolling,
    stopPolling,
    isPolling,
  };
}
