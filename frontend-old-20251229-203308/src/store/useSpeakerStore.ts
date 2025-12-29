/**
 * Store for speaker mappings and suggestions
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { SpeakerMapping, SpeakerSuggestions } from '../types';
import { SPEAKER_COLORS, STORAGE_KEYS } from '../utils/constants';

/**
 * Speaker store state interface
 */
interface SpeakerState {
  // Speaker mappings per meeting
  // meetingId -> { originalSpeaker -> customName }
  speakerMappings: Record<string, SpeakerMapping>;

  // Current speaker suggestions from AI
  speakerSuggestions: SpeakerSuggestions | null;

  // Speaker color assignments
  speakerColors: Record<string, string>;

  // Loading state
  isIdentifying: boolean;

  // Actions - Mappings
  setSpeakerMapping: (
    meetingId: string,
    originalSpeaker: string,
    newName: string
  ) => void;
  setSpeakerMappings: (meetingId: string, mappings: SpeakerMapping) => void;
  getMeetingSpeakerMappings: (meetingId: string) => SpeakerMapping;
  clearMeetingMappings: (meetingId: string) => void;

  // Actions - Suggestions
  setSuggestions: (suggestions: SpeakerSuggestions | null) => void;
  applySuggestion: (
    meetingId: string,
    speaker: string,
    name: string
  ) => void;
  dismissSuggestion: (speaker: string) => void;
  clearSuggestions: () => void;

  // Actions - Colors
  getSpeakerColor: (speaker: string) => string;
  assignColorToSpeaker: (speaker: string, color: string) => void;

  // Actions - Loading
  setIdentifying: (identifying: boolean) => void;
}

/**
 * Speaker store with persistence for mappings
 */
export const useSpeakerStore = create<SpeakerState>()(
  persist(
    (set, get) => ({
      // Initial state
      speakerMappings: {},
      speakerSuggestions: null,
      speakerColors: {},
      isIdentifying: false,

      // Actions - Mappings
      setSpeakerMapping: (meetingId, originalSpeaker, newName) =>
        set((state) => ({
          speakerMappings: {
            ...state.speakerMappings,
            [meetingId]: {
              ...(state.speakerMappings[meetingId] || {}),
              [originalSpeaker]: newName,
            },
          },
        })),

      setSpeakerMappings: (meetingId, mappings) =>
        set((state) => ({
          speakerMappings: {
            ...state.speakerMappings,
            [meetingId]: mappings,
          },
        })),

      getMeetingSpeakerMappings: (meetingId) => {
        const state = get();
        return state.speakerMappings[meetingId] || {};
      },

      clearMeetingMappings: (meetingId) =>
        set((state) => {
          const newMappings = { ...state.speakerMappings };
          delete newMappings[meetingId];
          return { speakerMappings: newMappings };
        }),

      // Actions - Suggestions
      setSuggestions: (suggestions) =>
        set({ speakerSuggestions: suggestions }),

      applySuggestion: (meetingId, speaker, name) => {
        const { setSpeakerMapping, dismissSuggestion } = get();
        setSpeakerMapping(meetingId, speaker, name);
        dismissSuggestion(speaker);
      },

      dismissSuggestion: (speaker) =>
        set((state) => {
          if (!state.speakerSuggestions) return state;

          const newSuggestions = { ...state.speakerSuggestions };
          delete newSuggestions[speaker];

          return {
            speakerSuggestions:
              Object.keys(newSuggestions).length > 0
                ? newSuggestions
                : null,
          };
        }),

      clearSuggestions: () => set({ speakerSuggestions: null }),

      // Actions - Colors
      getSpeakerColor: (speaker) => {
        const state = get();

        // Return existing color if already assigned
        if (state.speakerColors[speaker]) {
          return state.speakerColors[speaker];
        }

        // Assign a new color from the palette
        const assignedColors = Object.values(state.speakerColors);
        const availableColor = SPEAKER_COLORS.find(
          (color) => !assignedColors.includes(color)
        );

        const color =
          availableColor ||
          SPEAKER_COLORS[
            Object.keys(state.speakerColors).length % SPEAKER_COLORS.length
          ];

        // Store the color assignment
        set((s) => ({
          speakerColors: {
            ...s.speakerColors,
            [speaker]: color,
          },
        }));

        return color;
      },

      assignColorToSpeaker: (speaker, color) =>
        set((state) => ({
          speakerColors: {
            ...state.speakerColors,
            [speaker]: color,
          },
        })),

      // Actions - Loading
      setIdentifying: (identifying) => set({ isIdentifying: identifying }),
    }),
    {
      name: STORAGE_KEYS.SPEAKER_MAPPINGS,
      // Only persist speaker mappings and colors
      partialize: (state) => ({
        speakerMappings: state.speakerMappings,
        speakerColors: state.speakerColors,
      }),
    }
  )
);
