/**
 * API module for summary-related endpoints
 */

import { apiClient } from './client';
import { Summary, SummaryOptions } from '../../types/summary.types';

/**
 * Summaries API service
 */
export const summariesApi = {
  /**
   * Generates a summary for a meeting
   */
  async generate(uuid: string, options?: SummaryOptions): Promise<Summary> {
    const response = await apiClient.post<Summary>(
      `/jobs/${uuid}/summarise`,
      options || {}
    );
    return response.data;
  },

  /**
   * Deletes a summary
   */
  async delete(uuid: string): Promise<void> {
    await apiClient.delete<void>(`/jobs/${uuid}/summary`);
  },

  /**
   * Exports summary to Markdown
   */
  async exportMarkdown(uuid: string, timestamp: string): Promise<Blob> {
    const response = await apiClient.post<Blob>(
      `/jobs/${uuid}/markdown`,
      { timestamp }
    );
    return response.data;
  },

  /**
   * Exports summary to PDF
   */
  async exportPDF(uuid: string, timestamp: string): Promise<Blob> {
    const response = await apiClient.post<Blob>(
      `/jobs/${uuid}/pdf`,
      { timestamp }
    );
    return response.data;
  },

  /**
   * Downloads a blob as a file
   * @param blob - Blob data to download
   * @param filename - Target filename
   */
  downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);

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
