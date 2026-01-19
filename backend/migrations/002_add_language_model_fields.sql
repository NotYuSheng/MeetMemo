-- Add model_name and language fields to jobs table
-- These fields store user preferences for transcription

ALTER TABLE jobs
ADD COLUMN model_name VARCHAR(50),
ADD COLUMN language VARCHAR(10);

-- Add comments for documentation
COMMENT ON COLUMN jobs.model_name IS 'Whisper model name to use for transcription (e.g., turbo, base, small)';
COMMENT ON COLUMN jobs.language IS 'Language code for transcription (e.g., en, es, fr) or null for auto-detect';
