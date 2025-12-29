/**
 * API module for transcript-related endpoints
 */

import { apiClient } from './client';
import { TranscriptEntry } from '../../types/transcript.types';

/**
 * Transcripts API service
 */
export const transcriptsApi = {
  /**
   * Fetches transcript for a meeting
   */
  async get(uuid: string): Promise<TranscriptEntry[]> {
    const response = await apiClient.get<TranscriptEntry[]>(`/jobs/${uuid}/transcript`);
    return response.data;
  },

  /**
   * Updates transcript for a meeting
   */
  async update(uuid: string, transcript: TranscriptEntry[]): Promise<void> {
    await apiClient.patch<void>(`/jobs/${uuid}/transcript`, { transcript });
  },

  /**
   * Exports transcript to JSON
   * @param transcript - Transcript data to export
   * @param filename - Target filename
   */
  exportToJSON(transcript: TranscriptEntry[], filename: string): void {
    const dataStr = JSON.stringify(transcript, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);

    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Clean up the object URL
    URL.revokeObjectURL(url);
  },
};
