/**
 * Hook for speaker identification and management
 */

import { useCallback } from 'react';
import { useSpeakerStore } from '../store';
import { speakersApi } from '../services/api';
import { mainLogger } from '../utils/logger';
import { SpeakerSuggestions, SpeakerMapping } from '../types';

/**
 * Speakers hook return type
 */
interface UseSpeakersReturn {
  speakerMappings: SpeakerMapping;
  speakerSuggestions: SpeakerSuggestions | null;
  isIdentifying: boolean;
  getSpeakerColor: (speaker: string) => string;
  identifySpeakers: (meetingId: string, context?: string) => Promise<void>;
  updateSpeakerName: (
    meetingId: string,
    originalSpeaker: string,
    newName: string
  ) => Promise<void>;
  applySuggestion: (
    meetingId: string,
    speaker: string,
    name: string
  ) => Promise<void>;
  dismissSuggestion: (speaker: string) => void;
  clearSuggestions: () => void;
}

/**
 * Hook for managing speakers
 * @param meetingId - Current meeting UUID
 * @returns Speaker state and operations
 */
export function useSpeakers(meetingId: string | null): UseSpeakersReturn {
  const speakerSuggestions = useSpeakerStore((state) => state.speakerSuggestions);
  const isIdentifying = useSpeakerStore((state) => state.isIdentifying);

  const getMeetingSpeakerMappings = useSpeakerStore(
    (state) => state.getMeetingSpeakerMappings
  );
  const setSpeakerMapping = useSpeakerStore((state) => state.setSpeakerMapping);
  const setSuggestions = useSpeakerStore((state) => state.setSuggestions);
  const applySuggestionAction = useSpeakerStore((state) => state.applySuggestion);
  const dismissSuggestionAction = useSpeakerStore((state) => state.dismissSuggestion);
  const clearSuggestionsAction = useSpeakerStore((state) => state.clearSuggestions);
  const getSpeakerColorAction = useSpeakerStore((state) => state.getSpeakerColor);
  const setIdentifying = useSpeakerStore((state) => state.setIdentifying);

  // Get speaker mappings for current meeting
  const speakerMappings = meetingId ? getMeetingSpeakerMappings(meetingId) : {};

  /**
   * Identifies speakers using AI
   */
  const identifySpeakers = useCallback(
    async (meetingId: string, context?: string) => {
      try {
        setIdentifying(true);
        mainLogger.info('Identifying speakers', { meetingId, context });

        const suggestions = await speakersApi.identify(meetingId, context);
        setSuggestions(suggestions);

        mainLogger.info('Speakers identified successfully', {
          meetingId,
          count: Object.keys(suggestions).length,
        });
      } catch (error) {
        mainLogger.error('Failed to identify speakers', error as any, { meetingId });
        throw error;
      } finally {
        setIdentifying(false);
      }
    },
    [setSuggestions, setIdentifying]
  );

  /**
   * Updates a speaker name and saves to backend
   */
  const updateSpeakerName = useCallback(
    async (meetingId: string, originalSpeaker: string, newName: string) => {
      try {
        mainLogger.debug('Updating speaker name', {
          meetingId,
          originalSpeaker,
          newName,
        });

        // Update local state
        setSpeakerMapping(meetingId, originalSpeaker, newName);

        // Get updated mappings for this meeting
        const updatedMappings = {
          ...getMeetingSpeakerMappings(meetingId),
          [originalSpeaker]: newName,
        };

        // Save to backend
        await speakersApi.updateMappings(meetingId, updatedMappings);

        mainLogger.info('Speaker name updated successfully', {
          meetingId,
          originalSpeaker,
          newName,
        });
      } catch (error) {
        mainLogger.error('Failed to update speaker name', error as any, {
          meetingId,
          originalSpeaker,
        });
        throw error;
      }
    },
    [setSpeakerMapping, getMeetingSpeakerMappings]
  );

  /**
   * Applies a speaker suggestion
   */
  const applySuggestion = useCallback(
    async (meetingId: string, speaker: string, name: string) => {
      try {
        mainLogger.debug('Applying speaker suggestion', {
          meetingId,
          speaker,
          name,
        });

        // Apply suggestion in local state
        applySuggestionAction(meetingId, speaker, name);

        // Get updated mappings for this meeting
        const updatedMappings = {
          ...getMeetingSpeakerMappings(meetingId),
          [speaker]: name,
        };

        // Save to backend
        await speakersApi.updateMappings(meetingId, updatedMappings);

        mainLogger.info('Speaker suggestion applied successfully', {
          meetingId,
          speaker,
          name,
        });
      } catch (error) {
        mainLogger.error('Failed to apply speaker suggestion', error as any, {
          meetingId,
          speaker,
        });
        throw error;
      }
    },
    [applySuggestionAction, getMeetingSpeakerMappings]
  );

  /**
   * Dismisses a speaker suggestion
   */
  const dismissSuggestion = useCallback(
    (speaker: string) => {
      dismissSuggestionAction(speaker);
      mainLogger.debug('Speaker suggestion dismissed', { speaker });
    },
    [dismissSuggestionAction]
  );

  /**
   * Clears all suggestions
   */
  const clearSuggestions = useCallback(() => {
    clearSuggestionsAction();
    mainLogger.debug('All speaker suggestions cleared');
  }, [clearSuggestionsAction]);

  /**
   * Gets color for a speaker
   */
  const getSpeakerColor = useCallback(
    (speaker: string) => {
      return getSpeakerColorAction(speaker);
    },
    [getSpeakerColorAction]
  );

  return {
    speakerMappings,
    speakerSuggestions,
    isIdentifying,
    getSpeakerColor,
    identifySpeakers,
    updateSpeakerName,
    applySuggestion,
    dismissSuggestion,
    clearSuggestions,
  };
}
