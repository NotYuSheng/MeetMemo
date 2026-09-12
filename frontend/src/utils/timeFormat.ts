/**
 * Format seconds to MM:SS display format.
 *
 * @param {number} seconds - Time in seconds
 * @returns {string} Formatted time string (e.g., "1:05")
 */
export function formatTime(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || isNaN(seconds) || seconds === Infinity) {
    return '0:00';
  }
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
