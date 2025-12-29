/**
 * API module for job status polling
 */

import { apiClient } from './client';
import { JobStatus } from '../../types/api.types';

/**
 * Jobs API service
 */
export const jobsApi = {
  /**
   * Gets the current status of a job
   */
  async getStatus(uuid: string): Promise<JobStatus> {
    const response = await apiClient.get<JobStatus>(`/jobs/${uuid}/status`);
    return response.data;
  },

  /**
   * Polls job status until completion or failure
   * @param uuid - Job UUID
   * @param onProgress - Optional callback for progress updates
   * @param maxAttempts - Maximum number of polling attempts
   * @param interval - Polling interval in milliseconds
   * @returns True if job completed successfully, false if failed
   */
  async pollUntilComplete(
    uuid: string,
    onProgress?: (status: JobStatus) => void,
    maxAttempts: number = 1800,
    interval: number = 2000
  ): Promise<boolean> {
    let attempts = 0;

    while (attempts < maxAttempts) {
      const status = await this.getStatus(uuid);

      if (onProgress) {
        onProgress(status);
      }

      if (status.status === 'completed') {
        return true;
      }

      if (status.status === 'failed' || status.status === 'error') {
        throw new Error(status.error_message || 'Job processing failed');
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, interval));
      attempts++;
    }

    throw new Error('Job polling timeout - maximum attempts reached');
  },
};
