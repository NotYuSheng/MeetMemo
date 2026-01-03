// Speaker color mapping utilities

// Define a palette of distinct colors for speakers
const SPEAKER_COLOR_PALETTE = [
  { bg: 'primary', border: '#0d6efd' },    // Blue - SPEAKER_00
  { bg: 'success', border: '#198754' },    // Green - SPEAKER_01
  { bg: 'warning', border: '#ffc107' },    // Yellow - SPEAKER_02
  { bg: 'danger', border: '#dc3545' },     // Red - SPEAKER_03
  { bg: 'info', border: '#0dcaf0' },       // Cyan - SPEAKER_04
  { bg: 'secondary', border: '#6c757d' },  // Gray - SPEAKER_05
  { bg: 'dark', border: '#212529' },       // Dark - SPEAKER_06
];

/**
 * Get color mapping for a speaker based on their speaker ID
 * @param {string} speakerLabel - Speaker label (e.g., "SPEAKER_00", "SPEAKER_01")
 * @returns {{ bg: string, border: string }} - Bootstrap badge variant and border color
 */
export function getSpeakerColor(speakerLabel) {
  // Handle null or undefined speaker labels
  if (!speakerLabel) {
    console.log('getSpeakerColor: null/undefined speaker, using default');
    return SPEAKER_COLOR_PALETTE[0];
  }

  // Extract speaker number from label (e.g., "SPEAKER_00" -> 0)
  const match = speakerLabel.match(/SPEAKER_(\d+)/);
  if (!match) {
    // Default color for unknown format
    console.log(`getSpeakerColor: No match for "${speakerLabel}", using default`);
    return SPEAKER_COLOR_PALETTE[0];
  }

  const speakerIndex = parseInt(match[1], 10);
  const colorIndex = speakerIndex % SPEAKER_COLOR_PALETTE.length;
  const color = SPEAKER_COLOR_PALETTE[colorIndex];

  console.log(`getSpeakerColor: "${speakerLabel}" (index ${speakerIndex}) -> palette[${colorIndex}] = ${color.bg}`);

  // Use modulo to cycle through colors if we have more speakers than colors
  return color;
}

/**
 * Get just the badge variant for a speaker
 * @param {string} speakerLabel - Speaker label
 * @returns {string} - Bootstrap badge variant
 */
export function getSpeakerBadgeVariant(speakerLabel) {
  return getSpeakerColor(speakerLabel).bg;
}

/**
 * Get just the border color for a speaker
 * @param {string} speakerLabel - Speaker label
 * @returns {string} - CSS border color
 */
export function getSpeakerBorderColor(speakerLabel) {
  return getSpeakerColor(speakerLabel).border;
}
