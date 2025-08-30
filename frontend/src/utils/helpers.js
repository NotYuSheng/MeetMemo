// Generate a UUID4-like string for client-side use
export const generateUUID = () => {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

export const formatSpeakerName = (speakerName) => {
  if (!speakerName) return "Speaker 1";

  // Convert SPEAKER_XX format to "Speaker X" format
  const match = speakerName.match(/^SPEAKER_(\d+)$/);
  if (match) {
    const speakerNumber = parseInt(match[1], 10) + 1; // Convert 0-based to 1-based
    return `Speaker ${speakerNumber}`;
  }

  // Return the original name if it doesn't match the SPEAKER_XX pattern
  return speakerName;
};

export const getDisplaySpeakerName = (
  currentSpeaker,
  originalSpeaker,
  speakerNameMap,
) => {
  // Manual renames take priority over automatic formatting
  // Use originalSpeaker as the key for lookups, but fall back to currentSpeaker for display
  return speakerNameMap[originalSpeaker] ?? formatSpeakerName(currentSpeaker);
};

export const processTranscriptWithSpeakerIds = (transcriptData) => {
  const speakerMap = {};
  let speakerCounter = 1;
  return transcriptData.map((entry) => {
    const speaker = entry.speaker ?? "SPEAKER_00";
    if (!speakerMap[speaker]) {
      speakerMap[speaker] = speakerCounter++;
    }
    return {
      id: generateUUID(),
      speaker: speaker,
      originalSpeaker: speaker, // Track original speaker ID for mapping
      speakerId: speakerMap[speaker],
      text: entry.text,
      start: entry.start,
      end: entry.end,
    };
  });
};

export const generateProfessionalFilename = (
  meetingTitle,
  type,
  includeDate = true,
) => {
  // Clean the meeting title for filename use
  const cleanTitle = (meetingTitle || "Meeting")
    .replace(/\.(wav|mp3|mp4|m4a|flac|webm)$/i, "") // Remove audio extensions
    .replace(/[<>:"/\\|?*]/g, "") // Remove invalid filename characters
    .replace(/\s+/g, "-") // Replace spaces with hyphens
    .substring(0, 50) // Limit length
    .toLowerCase();

  const dateStr = includeDate ? new Date().toISOString().split("T")[0] : "";

  switch (type) {
    case "json":
      return `${cleanTitle}_transcript${dateStr ? `_${dateStr}` : ""}.json`;
    case "markdown":
      return `${cleanTitle}_summary${dateStr ? `_${dateStr}` : ""}.md`;
    case "md": // Also support 'md' for markdown
      return `${cleanTitle}_summary${dateStr ? `_${dateStr}` : ""}.md`;
    case "pdf":
      return `${cleanTitle}_summary${dateStr ? `_${dateStr}` : ""}.pdf`;
    default:
      return `${cleanTitle}_export${dateStr ? `_${dateStr}` : ""}.${type}`;
  }
};
