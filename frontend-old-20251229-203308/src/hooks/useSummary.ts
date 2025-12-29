/**
 * Hook for summary generation and management
 */

import { useCallback } from 'react';
import { useMeetingStore, useUIStore } from '../store';
import { summariesApi } from '../services/api';
import { generateProfessionalFilename } from '../utils/helpers';
import { mainLogger } from '../utils/logger';
import { Summary, SummaryOptions } from '../types';

/**
 * Summary hook return type
 */
interface UseSummaryReturn {
  summary: Summary | null;
  isLoading: boolean;
  customPrompt: string;
  systemPrompt: string;
  setCustomPrompt: (prompt: string) => void;
  setSystemPrompt: (prompt: string) => void;
  generateSummary: (meetingId: string, force?: boolean) => Promise<void>;
  deleteSummary: (meetingId: string) => Promise<void>;
  exportToMarkdown: (meetingId: string, meetingTitle: string) => Promise<void>;
  exportToPDF: (meetingId: string, meetingTitle: string) => Promise<void>;
}

/**
 * Hook for managing summaries
 * @returns Summary state and operations
 */
export function useSummary(): UseSummaryReturn {
  const summary = useMeetingStore((state) => state.summary);
  const isLoading = useMeetingStore((state) => state.isSummaryLoading);

  const setSummary = useMeetingStore((state) => state.setSummary);
  const setSummaryLoading = useMeetingStore((state) => state.setSummaryLoading);

  const customPrompt = useUIStore((state) => state.customPrompt);
  const systemPrompt = useUIStore((state) => state.systemPrompt);
  const setCustomPromptAction = useUIStore((state) => state.setCustomPrompt);
  const setSystemPromptAction = useUIStore((state) => state.setSystemPrompt);

  /**
   * Generates a summary for a meeting
   */
  const generateSummary = useCallback(
    async (meetingId: string, force: boolean = false) => {
      try {
        // If summary exists and not forcing regeneration, don't generate
        if (summary && summary.summary && !force) {
          mainLogger.debug('Summary already exists, skipping generation');
          return;
        }

        setSummaryLoading(true);
        mainLogger.info('Generating summary', { meetingId, force });

        const options: SummaryOptions = {};
        if (customPrompt) {
          options.custom_prompt = customPrompt;
        }
        if (systemPrompt) {
          options.system_prompt = systemPrompt;
        }

        const generatedSummary = await summariesApi.generate(meetingId, options);
        setSummary(generatedSummary);

        mainLogger.info('Summary generated successfully', { meetingId });
      } catch (error) {
        mainLogger.error('Failed to generate summary', error as any, { meetingId });
        throw error;
      } finally {
        setSummaryLoading(false);
      }
    },
    [summary, customPrompt, systemPrompt, setSummary, setSummaryLoading]
  );

  /**
   * Deletes a summary
   */
  const deleteSummary = useCallback(
    async (meetingId: string) => {
      try {
        mainLogger.info('Deleting summary', { meetingId });

        await summariesApi.delete(meetingId);
        setSummary(null);

        mainLogger.info('Summary deleted successfully', { meetingId });
      } catch (error) {
        mainLogger.error('Failed to delete summary', error as any, { meetingId });
        throw error;
      }
    },
    [setSummary]
  );

  /**
   * Exports summary to Markdown file
   */
  const exportToMarkdown = useCallback(
    async (meetingId: string, meetingTitle: string) => {
      try {
        mainLogger.info('Exporting summary to Markdown', { meetingId });

        const timestamp = new Date().toISOString();
        const blob = await summariesApi.exportMarkdown(meetingId, timestamp);
        const filename = generateProfessionalFilename(meetingTitle, 'markdown');

        summariesApi.downloadBlob(blob, filename);

        mainLogger.info('Summary exported to Markdown', { filename });
      } catch (error) {
        mainLogger.error('Failed to export summary to Markdown', error as any, { meetingId });
        throw error;
      }
    },
    []
  );

  /**
   * Exports summary to PDF file
   */
  const exportToPDF = useCallback(
    async (meetingId: string, meetingTitle: string) => {
      try {
        mainLogger.info('Exporting summary to PDF', { meetingId });

        const timestamp = new Date().toISOString();
        const blob = await summariesApi.exportPDF(meetingId, timestamp);
        const filename = generateProfessionalFilename(meetingTitle, 'pdf');

        summariesApi.downloadBlob(blob, filename);

        mainLogger.info('Summary exported to PDF', { filename });
      } catch (error) {
        mainLogger.error('Failed to export summary to PDF', error as any, { meetingId });
        throw error;
      }
    },
    []
  );

  /**
   * Sets custom prompt
   */
  const setCustomPrompt = useCallback(
    (prompt: string) => {
      setCustomPromptAction(prompt);
    },
    [setCustomPromptAction]
  );

  /**
   * Sets system prompt
   */
  const setSystemPrompt = useCallback(
    (prompt: string) => {
      setSystemPromptAction(prompt);
    },
    [setSystemPromptAction]
  );

  return {
    summary,
    isLoading,
    customPrompt,
    systemPrompt,
    setCustomPrompt,
    setSystemPrompt,
    generateSummary,
    deleteSummary,
    exportToMarkdown,
    exportToPDF,
  };
}
