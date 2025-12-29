/**
 * Main Meeting Transcription Page
 * Orchestrates all hooks and components
 */

import React, { useEffect, useCallback } from 'react';
import { FileText, Hash } from 'lucide-react';
import { useParams } from 'react-router-dom';

// Components
import Header from '../components/Header';
import AudioControls from '../components/AudioControls';
import TranscriptView from '../components/TranscriptView';
import SummaryView from '../components/SummaryView';
import MeetingsList from '../components/MeetingsList';

// Hooks
import {
  useTheme,
  useMeetings,
  useTranscript,
  useSummary,
  useSpeakers,
  useAudioProcessing,
} from '../hooks';

// Store
import { useUIStore } from '../store';

// Utils
import { formatSpeakerName, getDisplaySpeakerName } from '../utils/helpers';
import { mainLogger } from '../utils/logger';

// Styles
import '../MeetingTranscriptionApp.css';

const MeetingTranscriptionPage: React.FC = () => {
  const { meetingId } = useParams<{ meetingId?: string }>();

  // Theme
  const { isDarkMode, toggleTheme } = useTheme();

  // UI State
  const showSummary = useUIStore((state) => state.showSummary);
  const toggleView = useUIStore((state) => state.toggleView);
  const selectedModel = useUIStore((state) => state.selectedModel);
  const setSelectedModel = useUIStore((state) => state.setSelectedModel);
  const showPromptInputs = useUIStore((state) => state.showPromptInputs);
  const togglePromptInputs = useUIStore((state) => state.togglePromptInputs);
  const isPdfLoaded = useUIStore((state) => state.isPdfLoaded);
  const setPdfLoaded = useUIStore((state) => state.setPdfLoaded);

  // Meetings
  const {
    meetings,
    selectedMeetingId,
    fetchMeetings,
    loadMeeting,
    deleteMeeting,
    renameMeeting,
  } = useMeetings();

  // Audio Processing
  const { isProcessing, processAudio } = useAudioProcessing();

  // Transcript
  const {
    transcript,
    originalTranscript,
    saveStatus,
    updateTranscriptText,
    resetTranscript,
    exportToJSON,
  } = useTranscript(selectedMeetingId);

  // Summary
  const {
    summary,
    isLoading: summaryLoading,
    customPrompt,
    systemPrompt,
    setCustomPrompt,
    setSystemPrompt,
    generateSummary,
    exportToMarkdown,
    exportToPDF,
  } = useSummary();

  // Speakers
  const {
    speakerMappings,
    speakerSuggestions,
    isIdentifying: speakerIdentificationLoading,
    identifySpeakers,
    updateSpeakerName,
    applySuggestion,
    dismissSuggestion,
  } = useSpeakers(selectedMeetingId);

  // Get current meeting's speaker mapping
  const currentSpeakerNameMap = selectedMeetingId
    ? speakerMappings
    : {};

  // Fetch meetings on mount
  useEffect(() => {
    fetchMeetings();
  }, [fetchMeetings]);

  // Handle URL parameter for meeting ID
  useEffect(() => {
    if (meetingId && meetingId !== selectedMeetingId) {
      loadMeeting(meetingId);
    }
  }, [meetingId, selectedMeetingId, loadMeeting]);

  // Generate summary when transcript loads
  useEffect(() => {
    if (selectedMeetingId && transcript.length > 0 && !summary) {
      generateSummary(selectedMeetingId);
    }
  }, [selectedMeetingId, transcript.length, summary, generateSummary]);

  // Handlers
  const handleAudioProcessed = useCallback(
    async (file: File) => {
      try {
        mainLogger.info('Processing audio file', { fileName: file.name });
        await processAudio(file);
        // Refresh meeting list after processing
        await fetchMeetings();
      } catch (error) {
        mainLogger.error('Failed to process audio', error as any);
        alert('Failed to process audio. Please try again.');
      }
    },
    [processAudio, fetchMeetings]
  );

  const handleMeetingSelect = useCallback(
    async (uuid: string) => {
      try {
        await loadMeeting(uuid);
      } catch (error) {
        mainLogger.error('Failed to load meeting', error as any);
        alert('Failed to load meeting. Please try again.');
      }
    },
    [loadMeeting]
  );

  const handleMeetingDelete = useCallback(
    async (uuid: string) => {
      if (!window.confirm('Are you sure you want to delete this meeting?')) {
        return;
      }

      try {
        await deleteMeeting(uuid);
      } catch (error) {
        mainLogger.error('Failed to delete meeting', error as any);
        alert('Failed to delete meeting. Please try again.');
      }
    },
    [deleteMeeting]
  );

  const handleSpeakerNameChange = useCallback(
    async (originalSpeaker: string, newName: string) => {
      if (!selectedMeetingId) return;

      try {
        await updateSpeakerName(selectedMeetingId, originalSpeaker, newName);
      } catch (error) {
        mainLogger.error('Failed to update speaker name', error as any);
        alert('Failed to update speaker name. Please try again.');
      }
    },
    [selectedMeetingId, updateSpeakerName]
  );

  const handleApplySpeakerSuggestion = useCallback(
    async (originalSpeaker: string, suggestedName: string) => {
      if (!selectedMeetingId) return;

      try {
        await applySuggestion(selectedMeetingId, originalSpeaker, suggestedName);
      } catch (error) {
        mainLogger.error('Failed to apply speaker suggestion', error as any);
        alert('Failed to apply suggestion. Please try again.');
      }
    },
    [selectedMeetingId, applySuggestion]
  );

  const handleRegenerateSummary = useCallback(
    async (meetingId: string | null) => {
      if (!meetingId) return;

      try {
        await generateSummary(meetingId, true);
      } catch (error) {
        mainLogger.error('Failed to regenerate summary', error as any);
        alert('Failed to regenerate summary. Please try again.');
      }
    },
    [generateSummary]
  );

  const handleExportMarkdown = useCallback(async () => {
    if (!selectedMeetingId || !summary) return;

    try {
      await exportToMarkdown(selectedMeetingId, summary.meetingTitle);
    } catch (error) {
      mainLogger.error('Failed to export markdown', error as any);
      alert('Failed to export markdown. Please try again.');
    }
  }, [selectedMeetingId, summary, exportToMarkdown]);

  const handleExportPDF = useCallback(async () => {
    if (!selectedMeetingId || !summary) return;

    try {
      await exportToPDF(selectedMeetingId, summary.meetingTitle);
    } catch (error) {
      mainLogger.error('Failed to export PDF', error as any);
      alert('Failed to export PDF. Please try again.');
    }
  }, [selectedMeetingId, summary, exportToPDF]);

  const handleExportTranscript = useCallback(() => {
    if (!summary) return;
    exportToJSON(summary.meetingTitle);
  }, [summary, exportToJSON]);

  const handleRename = useCallback(
    async (newName: string) => {
      if (!selectedMeetingId) return;

      try {
        await renameMeeting(selectedMeetingId, newName);
      } catch (error) {
        mainLogger.error('Failed to rename meeting', error as any);
        alert('Failed to rename meeting. Please try again.');
      }
    },
    [selectedMeetingId, renameMeeting]
  );

  const handleIdentifySpeakers = useCallback(
    async (meetingId: string) => {
      try {
        await identifySpeakers(meetingId);
      } catch (error) {
        mainLogger.error('Failed to identify speakers', error as any);
        alert('Failed to identify speakers. Please try again.');
      }
    },
    [identifySpeakers]
  );

  const getSpeakerColorClass = useCallback(
    (speakerId: number): string => {
      const colors = [
        'speaker-afblue',
        'speaker-poisedgold',
        'speaker-navyblue',
        'speaker-armyred',
      ];
      return colors[speakerId % colors.length];
    },
    []
  );

  return (
    <div className="app-container">
      <div id="particles-js" className="particles-background"></div>

      <Header isDarkMode={isDarkMode} onToggleDarkMode={toggleTheme} />

      <div className="main-content">
        {/* Sidebar - Meetings List */}
        <aside className="sidebar">
          <MeetingsList
            meetingList={meetings}
            selectedMeetingId={selectedMeetingId}
            onMeetingSelect={handleMeetingSelect}
            onMeetingDelete={handleMeetingDelete}
          />
        </aside>

        {/* Main Panel */}
        <main className="main-panel">
          <div className="card">
            <AudioControls
              onAudioProcessed={handleAudioProcessed}
              isProcessing={isProcessing}
              selectedModel={selectedModel}
              onModelChange={(model) => setSelectedModel(model as any)}
            />
          </div>

          {/* View Toggle */}
          <div className="view-toggle-container">
            <button
              onClick={toggleView}
              className={`btn ${!showSummary ? 'btn-discrete-prominent' : 'btn-discrete'}`}
            >
              <FileText className="btn-icon" />
              Transcript
            </button>
            <button
              onClick={toggleView}
              className={`btn ${showSummary ? 'btn-discrete-prominent' : 'btn-discrete'}`}
            >
              <Hash className="btn-icon" />
              Summary
            </button>
          </div>

          {/* Content Area */}
          <div className="card content-card">
            {!showSummary ? (
              <TranscriptView
                transcript={transcript}
                originalTranscript={originalTranscript}
                selectedMeetingId={selectedMeetingId}
                speakerNameMaps={{}}
                speakerSuggestions={speakerSuggestions}
                speakerIdentificationLoading={speakerIdentificationLoading}
                transcriptSaveStatus={saveStatus}
                currentSpeakerNameMap={currentSpeakerNameMap}
                onSpeakerNameChange={handleSpeakerNameChange}
                onTranscriptTextChange={updateTranscriptText}
                onIdentifySpeakers={handleIdentifySpeakers}
                onExportTranscript={handleExportTranscript}
                onResetTranscript={resetTranscript}
                onApplySpeakerSuggestion={handleApplySpeakerSuggestion}
                onDismissSpeakerSuggestion={dismissSuggestion}
                getSpeakerColor={getSpeakerColorClass}
                formatSpeakerName={formatSpeakerName}
                getDisplaySpeakerName={getDisplaySpeakerName}
              />
            ) : (
              <SummaryView
                summary={summary}
                summaryLoading={summaryLoading}
                selectedMeetingId={selectedMeetingId}
                customPrompt={customPrompt}
                systemPrompt={systemPrompt}
                showPromptInputs={showPromptInputs}
                onCustomPromptChange={setCustomPrompt}
                onSystemPromptChange={setSystemPrompt}
                onTogglePromptInputs={togglePromptInputs}
                onRegenerateSummary={handleRegenerateSummary}
                onExportMarkdown={handleExportMarkdown}
                onExportPDF={handleExportPDF}
                onRename={handleRename}
                isPdfLoaded={isPdfLoaded}
                onPdfLoaded={setPdfLoaded}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

export default MeetingTranscriptionPage;
