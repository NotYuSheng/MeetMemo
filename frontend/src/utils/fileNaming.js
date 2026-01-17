/**
 * Utility functions for generating clean, descriptive filenames for exports
 */

/**
 * Sanitize filename - remove extension and special characters
 * @param {string} filename - Original filename (e.g., "meeting.mp3", "Recording.wav")
 * @returns {string} - Cleaned filename (e.g., "meeting", "Recording")
 */
export function sanitizeFilename(filename) {
  if (!filename || filename === 'Unknown' || filename === 'Recording') {
    return 'MeetMemo';
  }

  // Remove file extension
  const nameWithoutExt = filename.replace(/\.[^/.]+$/, '');

  // Replace special characters with underscores, keep alphanumeric, spaces, hyphens
  const cleaned = nameWithoutExt.replace(/[^a-zA-Z0-9\s-]/g, '_');

  // Collapse multiple spaces/underscores
  return cleaned.replace(/[\s_]+/g, '_').trim();
}

/**
 * Get current timestamp in readable format
 * @returns {string} - Timestamp like "2024-01-15_14-30"
 */
export function getTimestamp() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');

  return `${year}-${month}-${day}_${hours}-${minutes}`;
}

/**
 * Generate filename for PDF with summary + transcript
 * @param {string} originalFilename - Original audio filename
 * @returns {string} - e.g., "MeetMemo_Team_Meeting_2024-01-15_14-30.pdf"
 */
export function generatePDFFilename(originalFilename) {
  const baseName = sanitizeFilename(originalFilename);
  const timestamp = getTimestamp();
  return `${baseName}_${timestamp}.pdf`;
}

/**
 * Generate filename for Markdown with summary + transcript
 * @param {string} originalFilename - Original audio filename
 * @returns {string} - e.g., "MeetMemo_Team_Meeting_2024-01-15_14-30.md"
 */
export function generateMarkdownFilename(originalFilename) {
  const baseName = sanitizeFilename(originalFilename);
  const timestamp = getTimestamp();
  return `${baseName}_${timestamp}.md`;
}

/**
 * Generate filename for transcript-only PDF
 * @param {string} originalFilename - Original audio filename
 * @returns {string} - e.g., "MeetMemo_Team_Meeting_Transcript_2024-01-15_14-30.pdf"
 */
export function generateTranscriptPDFFilename(originalFilename) {
  const baseName = sanitizeFilename(originalFilename);
  const timestamp = getTimestamp();
  return `${baseName}_Transcript_${timestamp}.pdf`;
}

/**
 * Generate filename for transcript-only Markdown
 * @param {string} originalFilename - Original audio filename
 * @returns {string} - e.g., "MeetMemo_Team_Meeting_Transcript_2024-01-15_14-30.md"
 */
export function generateTranscriptMarkdownFilename(originalFilename) {
  const baseName = sanitizeFilename(originalFilename);
  const timestamp = getTimestamp();
  return `${baseName}_Transcript_${timestamp}.md`;
}
