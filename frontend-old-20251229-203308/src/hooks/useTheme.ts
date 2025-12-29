/**
 * Hook for theme management and initialization
 */

import { useEffect } from 'react';
import { useUIStore } from '../store';
import { initializeParticles } from '../services/particlesConfig';

/**
 * Theme hook return type
 */
interface UseThemeReturn {
  isDarkMode: boolean;
  toggleTheme: () => void;
}

/**
 * Hook for managing app theme
 * @returns Theme state and controls
 */
export function useTheme(): UseThemeReturn {
  const isDarkMode = useUIStore((state) => state.isDarkMode);
  const toggleDarkMode = useUIStore((state) => state.toggleDarkMode);
  const setDarkMode = useUIStore((state) => state.setDarkMode);

  // Initialize theme on mount
  useEffect(() => {
    // Check for system preference if no saved preference exists
    const savedTheme = localStorage.getItem('meetmemo_theme');

    if (!savedTheme) {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      setDarkMode(prefersDark);
    } else {
      // Apply saved theme to DOM
      document.documentElement.setAttribute(
        'data-theme',
        isDarkMode ? 'dark' : 'light'
      );
    }
  }, []);

  // Reinitialize particles.js when theme changes
  useEffect(() => {
    initializeParticles();
  }, [isDarkMode]);

  return {
    isDarkMode,
    toggleTheme: toggleDarkMode,
  };
}
