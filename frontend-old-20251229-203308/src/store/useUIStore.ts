/**
 * Store for UI state and theme management
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { WhisperModel } from '../types';
import { STORAGE_KEYS, DEFAULT_PROMPTS } from '../utils/constants';

/**
 * UI store state interface
 */
interface UIState {
  // Theme
  isDarkMode: boolean;

  // View toggles
  showSummary: boolean;
  showPromptInputs: boolean;

  // Whisper model selection
  selectedModel: WhisperModel;

  // Prompt configuration
  customPrompt: string;
  systemPrompt: string;

  // PDF viewer state
  isPdfLoaded: boolean;

  // Actions - Theme
  toggleDarkMode: () => void;
  setDarkMode: (isDark: boolean) => void;

  // Actions - View toggles
  toggleView: () => void;
  setShowSummary: (show: boolean) => void;
  togglePromptInputs: () => void;
  setShowPromptInputs: (show: boolean) => void;

  // Actions - Model
  setSelectedModel: (model: WhisperModel) => void;

  // Actions - Prompts
  setCustomPrompt: (prompt: string) => void;
  setSystemPrompt: (prompt: string) => void;
  resetPrompts: () => void;

  // Actions - PDF
  setPdfLoaded: (loaded: boolean) => void;
}

/**
 * UI store with persistence for theme and prompts
 */
export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      // Initial state - Theme
      isDarkMode: false,

      // Initial state - View toggles
      showSummary: false,
      showPromptInputs: false,

      // Initial state - Model
      selectedModel: 'turbo',

      // Initial state - Prompts
      customPrompt: DEFAULT_PROMPTS.CUSTOM,
      systemPrompt: DEFAULT_PROMPTS.SYSTEM,

      // Initial state - PDF
      isPdfLoaded: false,

      // Actions - Theme
      toggleDarkMode: () =>
        set((state) => {
          const newIsDarkMode = !state.isDarkMode;
          // Apply theme to document
          document.documentElement.setAttribute(
            'data-theme',
            newIsDarkMode ? 'dark' : 'light'
          );
          return { isDarkMode: newIsDarkMode };
        }),

      setDarkMode: (isDark) => {
        document.documentElement.setAttribute(
          'data-theme',
          isDark ? 'dark' : 'light'
        );
        set({ isDarkMode: isDark });
      },

      // Actions - View toggles
      toggleView: () => set((state) => ({ showSummary: !state.showSummary })),

      setShowSummary: (show) => set({ showSummary: show }),

      togglePromptInputs: () =>
        set((state) => ({ showPromptInputs: !state.showPromptInputs })),

      setShowPromptInputs: (show) => set({ showPromptInputs: show }),

      // Actions - Model
      setSelectedModel: (model) => set({ selectedModel: model }),

      // Actions - Prompts
      setCustomPrompt: (prompt) => set({ customPrompt: prompt }),

      setSystemPrompt: (prompt) => set({ systemPrompt: prompt }),

      resetPrompts: () =>
        set({
          customPrompt: DEFAULT_PROMPTS.CUSTOM,
          systemPrompt: DEFAULT_PROMPTS.SYSTEM,
        }),

      // Actions - PDF
      setPdfLoaded: (loaded) => set({ isPdfLoaded: loaded }),
    }),
    {
      name: STORAGE_KEYS.THEME,
      // Only persist theme, prompts, and model selection
      partialize: (state) => ({
        isDarkMode: state.isDarkMode,
        customPrompt: state.customPrompt,
        systemPrompt: state.systemPrompt,
        selectedModel: state.selectedModel,
      }),
    }
  )
);
