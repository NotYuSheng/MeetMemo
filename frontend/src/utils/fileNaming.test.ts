import { describe, it, expect } from 'vitest';
import {
  sanitizeFilename,
  getTimestamp,
  generatePDFFilename,
  generateMarkdownFilename,
  generateTranscriptPDFFilename,
  generateTranscriptMarkdownFilename,
} from './fileNaming';

describe('sanitizeFilename', () => {
  it('falls back to MeetMemo for placeholder or missing names', () => {
    expect(sanitizeFilename('Unknown')).toBe('MeetMemo');
    expect(sanitizeFilename('Recording')).toBe('MeetMemo');
    expect(sanitizeFilename('')).toBe('MeetMemo');
    expect(sanitizeFilename(null)).toBe('MeetMemo');
    expect(sanitizeFilename(undefined)).toBe('MeetMemo');
  });

  it('strips the extension and replaces inner dots with underscores', () => {
    expect(sanitizeFilename('meeting.mp3')).toBe('meeting');
    // Only the final extension is stripped; the remaining dot is a special char.
    expect(sanitizeFilename('notes.final.wav')).toBe('notes_final');
  });

  it('replaces spaces and special characters with underscores', () => {
    expect(sanitizeFilename('my file.mp3')).toBe('my_file');
    expect(sanitizeFilename('Q3 Review (draft).m4a')).toBe('Q3_Review_draft_');
  });
});

describe('getTimestamp', () => {
  it('produces a YYYY-MM-DD_HH-MM timestamp', () => {
    expect(getTimestamp()).toMatch(/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}$/);
  });
});

describe('export filename generators', () => {
  const stamp = '\\d{4}-\\d{2}-\\d{2}_\\d{2}-\\d{2}';

  it('generates summary+transcript filenames', () => {
    expect(generatePDFFilename('meeting.mp3')).toMatch(new RegExp(`^meeting_${stamp}\\.pdf$`));
    expect(generateMarkdownFilename('meeting.mp3')).toMatch(new RegExp(`^meeting_${stamp}\\.md$`));
  });

  it('generates transcript-only filenames with a Transcript marker', () => {
    expect(generateTranscriptPDFFilename('meeting.mp3')).toMatch(
      new RegExp(`^meeting_Transcript_${stamp}\\.pdf$`)
    );
    expect(generateTranscriptMarkdownFilename('meeting.mp3')).toMatch(
      new RegExp(`^meeting_Transcript_${stamp}\\.md$`)
    );
  });

  it('uses the MeetMemo fallback for placeholder names', () => {
    expect(generatePDFFilename('Recording')).toMatch(new RegExp(`^MeetMemo_${stamp}\\.pdf$`));
  });
});
