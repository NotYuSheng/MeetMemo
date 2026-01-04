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

// Keep track of speaker name -> color mapping
// This ensures colors are consistent even when speaker names change
const speakerColorMap = new Map();

/**
 * Get color mapping for a speaker based on their speaker ID or name
 * @param {string} speakerLabel - Speaker label (e.g., "SPEAKER_00", "John", "Project Manager")
 * @returns {{ bg: string, border: string }} - Bootstrap badge variant and border color
 */
export function getSpeakerColor(speakerLabel) {
  // Handle null or undefined speaker labels
  if (!speakerLabel) {
    console.log('getSpeakerColor: null/undefined speaker, using default');
    return SPEAKER_COLOR_PALETTE[0];
  }

  // Check if we already have a color assigned to this speaker
  if (speakerColorMap.has(speakerLabel)) {
    return speakerColorMap.get(speakerLabel);
  }

  // Extract speaker number from label if it follows SPEAKER_XX pattern
  const match = speakerLabel.match(/SPEAKER_(\d+)/);
  let colorIndex;

  if (match) {
    // Use the speaker number to determine color
    const speakerIndex = parseInt(match[1], 10);
    colorIndex = speakerIndex % SPEAKER_COLOR_PALETTE.length;
  } else {
    // For custom names, assign next available color based on map size
    colorIndex = speakerColorMap.size % SPEAKER_COLOR_PALETTE.length;
  }

  const color = SPEAKER_COLOR_PALETTE[colorIndex];

  // Store this mapping for future lookups
  speakerColorMap.set(speakerLabel, color);

  console.log(`getSpeakerColor: "${speakerLabel}" -> palette[${colorIndex}] = ${color.bg}`);

  return color;
}

/**
 * Reset and initialize speaker color mapping based on transcript segments
 * This should be called when the transcript loads or speaker names change
 * to ensure consistent color assignment
 *
 * @param {Array} segments - Transcript segments with speaker labels
 */
export function initializeSpeakerColors(segments) {
  if (!segments || !Array.isArray(segments)) {
    return;
  }

  // Clear existing mappings
  speakerColorMap.clear();

  // Get unique speakers in order of appearance
  const uniqueSpeakers = [];
  const seenSpeakers = new Set();

  for (const segment of segments) {
    const speaker = segment.speaker;
    if (speaker && !seenSpeakers.has(speaker)) {
      uniqueSpeakers.push(speaker);
      seenSpeakers.add(speaker);
    }
  }

  // Assign colors to speakers based on their original speaker number if available
  uniqueSpeakers.forEach((speaker, index) => {
    // Try to extract speaker number from SPEAKER_XX format
    const match = speaker.match(/SPEAKER_(\d+)/);
    let colorIndex;

    if (match) {
      // Use the speaker number to maintain consistent color
      const speakerIndex = parseInt(match[1], 10);
      colorIndex = speakerIndex % SPEAKER_COLOR_PALETTE.length;
    } else {
      // For custom names without SPEAKER_XX format, use order of appearance
      colorIndex = index % SPEAKER_COLOR_PALETTE.length;
    }

    const color = SPEAKER_COLOR_PALETTE[colorIndex];
    speakerColorMap.set(speaker, color);

    console.log(`initializeSpeakerColors: "${speaker}" -> palette[${colorIndex}] = ${color.bg}`);
  });
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
