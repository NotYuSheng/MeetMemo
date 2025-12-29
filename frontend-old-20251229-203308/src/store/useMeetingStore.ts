/**
 * Central store for meeting, transcript, and summary state
 */

import { create } from 'zustand';
import { Meeting, TranscriptEntry, Summary, TranscriptSaveStatus } from '../types';

/**
 * Meeting store state interface
 */
interface MeetingState {
  // Meeting list
  meetings: Meeting[];
  selectedMeetingId: string | null;
  isLoadingMeetings: boolean;

  // Transcript state
  transcript: TranscriptEntry[];
  originalTranscript: TranscriptEntry[];
  transcriptSaveStatus: TranscriptSaveStatus;

  // Summary state
  summary: Summary | null;

  // Processing states
  isProcessingAudio: boolean;
  isSummaryLoading: boolean;

  // Actions - Meetings
  setMeetings: (meetings: Meeting[]) => void;
  selectMeeting: (uuid: string | null) => void;
  addMeeting: (meeting: Meeting) => void;
  removeMeeting: (uuid: string) => void;
  updateMeeting: (uuid: string, updates: Partial<Meeting>) => void;
  setLoadingMeetings: (loading: boolean) => void;

  // Actions - Transcript
  setTranscript: (transcript: TranscriptEntry[]) => void;
  setOriginalTranscript: (transcript: TranscriptEntry[]) => void;
  updateTranscriptEntry: (entryId: string, updates: Partial<TranscriptEntry>) => void;
  resetTranscript: () => void;
  setTranscriptSaveStatus: (status: TranscriptSaveStatus) => void;

  // Actions - Summary
  setSummary: (summary: Summary | null) => void;
  setSummaryLoading: (loading: boolean) => void;

  // Actions - Processing
  setProcessingAudio: (processing: boolean) => void;

  // Clear all meeting data
  clearMeetingData: () => void;
}

/**
 * Meeting store
 */
export const useMeetingStore = create<MeetingState>((set) => ({
  // Initial state - Meetings
  meetings: [],
  selectedMeetingId: null,
  isLoadingMeetings: false,

  // Initial state - Transcript
  transcript: [],
  originalTranscript: [],
  transcriptSaveStatus: null,

  // Initial state - Summary
  summary: null,

  // Initial state - Processing
  isProcessingAudio: false,
  isSummaryLoading: false,

  // Actions - Meetings
  setMeetings: (meetings) => set({ meetings }),

  selectMeeting: (uuid) => set({ selectedMeetingId: uuid }),

  addMeeting: (meeting) =>
    set((state) => ({ meetings: [meeting, ...state.meetings] })),

  removeMeeting: (uuid) =>
    set((state) => ({
      meetings: state.meetings.filter((m) => m.uuid !== uuid),
      // Clear selected if deleting current meeting
      selectedMeetingId: state.selectedMeetingId === uuid ? null : state.selectedMeetingId,
    })),

  updateMeeting: (uuid, updates) =>
    set((state) => ({
      meetings: state.meetings.map((m) =>
        m.uuid === uuid ? { ...m, ...updates } : m
      ),
    })),

  setLoadingMeetings: (loading) => set({ isLoadingMeetings: loading }),

  // Actions - Transcript
  setTranscript: (transcript) => set({ transcript }),

  setOriginalTranscript: (transcript) => set({ originalTranscript: transcript }),

  updateTranscriptEntry: (entryId, updates) =>
    set((state) => ({
      transcript: state.transcript.map((entry) =>
        entry.id === entryId ? { ...entry, ...updates } : entry
      ),
    })),

  resetTranscript: () =>
    set((state) => ({ transcript: [...state.originalTranscript] })),

  setTranscriptSaveStatus: (status) => set({ transcriptSaveStatus: status }),

  // Actions - Summary
  setSummary: (summary) => set({ summary }),

  setSummaryLoading: (loading) => set({ isSummaryLoading: loading }),

  // Actions - Processing
  setProcessingAudio: (processing) => set({ isProcessingAudio: processing }),

  // Clear all meeting data
  clearMeetingData: () =>
    set({
      transcript: [],
      originalTranscript: [],
      summary: null,
      transcriptSaveStatus: null,
      selectedMeetingId: null,
    }),
}));
