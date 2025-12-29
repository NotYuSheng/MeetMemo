/**
 * Hook for meeting management (CRUD operations)
 */

import { useCallback } from 'react';
import { useMeetingStore } from '../store';
import { meetingsApi, transcriptsApi } from '../services/api';
import { processTranscriptWithSpeakerIds } from '../utils/helpers';
import { mainLogger } from '../utils/logger';
import { Meeting } from '../types';

/**
 * Meetings hook return type
 */
interface UseMeetingsReturn {
  meetings: Meeting[];
  selectedMeetingId: string | null;
  isLoading: boolean;
  fetchMeetings: () => Promise<void>;
  loadMeeting: (uuid: string) => Promise<void>;
  deleteMeeting: (uuid: string) => Promise<void>;
  renameMeeting: (uuid: string, newName: string) => Promise<void>;
  selectMeeting: (uuid: string | null) => void;
}

/**
 * Hook for managing meetings
 * @returns Meeting state and operations
 */
export function useMeetings(): UseMeetingsReturn {
  const meetings = useMeetingStore((state) => state.meetings);
  const selectedMeetingId = useMeetingStore((state) => state.selectedMeetingId);
  const isLoading = useMeetingStore((state) => state.isLoadingMeetings);

  const setMeetings = useMeetingStore((state) => state.setMeetings);
  const selectMeetingAction = useMeetingStore((state) => state.selectMeeting);
  const removeMeetingAction = useMeetingStore((state) => state.removeMeeting);
  const updateMeetingAction = useMeetingStore((state) => state.updateMeeting);
  const setLoadingMeetings = useMeetingStore((state) => state.setLoadingMeetings);

  const setTranscript = useMeetingStore((state) => state.setTranscript);
  const setOriginalTranscript = useMeetingStore((state) => state.setOriginalTranscript);
  const clearMeetingData = useMeetingStore((state) => state.clearMeetingData);

  /**
   * Fetches list of all meetings
   */
  const fetchMeetings = useCallback(async () => {
    try {
      setLoadingMeetings(true);
      const meetingList = await meetingsApi.list();
      setMeetings(meetingList);
      mainLogger.info('Meetings fetched successfully', { count: meetingList.length });
    } catch (error) {
      mainLogger.error('Failed to fetch meetings', error as any);
      throw error;
    } finally {
      setLoadingMeetings(false);
    }
  }, [setMeetings, setLoadingMeetings]);

  /**
   * Loads a specific meeting's data (transcript and summary)
   */
  const loadMeeting = useCallback(
    async (uuid: string) => {
      try {
        mainLogger.info('Loading meeting', { uuid });

        // Select the meeting
        selectMeetingAction(uuid);

        // Fetch transcript
        const transcriptData = await transcriptsApi.get(uuid);
        const processedTranscript = processTranscriptWithSpeakerIds(transcriptData);

        setTranscript(processedTranscript);
        setOriginalTranscript(processedTranscript);

        // Note: Summary is loaded separately by useSummary hook

        mainLogger.info('Meeting loaded successfully', { uuid });
      } catch (error) {
        mainLogger.error('Failed to load meeting', error as any, { uuid });
        throw error;
      }
    },
    [
      selectMeetingAction,
      setTranscript,
      setOriginalTranscript,
    ]
  );

  /**
   * Deletes a meeting
   */
  const deleteMeeting = useCallback(
    async (uuid: string) => {
      try {
        mainLogger.info('Deleting meeting', { uuid });

        await meetingsApi.delete(uuid);
        removeMeetingAction(uuid);

        // Clear data if deleting current meeting
        if (selectedMeetingId === uuid) {
          clearMeetingData();
        }

        mainLogger.info('Meeting deleted successfully', { uuid });
      } catch (error) {
        mainLogger.error('Failed to delete meeting', error as any, { uuid });
        throw error;
      }
    },
    [removeMeetingAction, selectedMeetingId, clearMeetingData]
  );

  /**
   * Renames a meeting
   */
  const renameMeeting = useCallback(
    async (uuid: string, newName: string) => {
      try {
        mainLogger.info('Renaming meeting', { uuid, newName });

        await meetingsApi.rename(uuid, newName);
        updateMeetingAction(uuid, { name: newName });

        mainLogger.info('Meeting renamed successfully', { uuid, newName });
      } catch (error) {
        mainLogger.error('Failed to rename meeting', error as any, { uuid });
        throw error;
      }
    },
    [updateMeetingAction]
  );

  /**
   * Selects a meeting (without loading data)
   */
  const selectMeeting = useCallback(
    (uuid: string | null) => {
      selectMeetingAction(uuid);
    },
    [selectMeetingAction]
  );

  return {
    meetings,
    selectedMeetingId,
    isLoading,
    fetchMeetings,
    loadMeeting,
    deleteMeeting,
    renameMeeting,
    selectMeeting,
  };
}
