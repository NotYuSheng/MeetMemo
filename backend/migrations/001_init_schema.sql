-- MeetMemo PostgreSQL Schema
-- Schema with independent workflow states for step-by-step processing

-- Drop existing tables if they exist (fresh start)
DROP TABLE IF EXISTS export_jobs CASCADE;
DROP TABLE IF EXISTS jobs CASCADE;
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;

-- Jobs table with workflow state tracking
CREATE TABLE jobs (
    uuid UUID PRIMARY KEY,
    file_name VARCHAR(255) NOT NULL,
    file_hash VARCHAR(64),

    -- Workflow state tracking
    workflow_state VARCHAR(50) NOT NULL DEFAULT 'uploaded'
        CHECK (workflow_state IN ('uploaded', 'transcribing', 'transcribed', 'diarizing', 'diarized', 'aligning', 'completed', 'error')),

    -- Legacy status code (for backwards compatibility during transition)
    status_code INTEGER NOT NULL DEFAULT 202,

    -- Progress tracking
    current_step_progress INTEGER DEFAULT 0
        CHECK (current_step_progress >= 0 AND current_step_progress <= 100),

    -- Processing data storage (JSONB for efficient querying)
    transcription_data JSONB,  -- Raw Whisper output
    diarization_data JSONB,    -- Raw PyAnnote output

    -- Legacy fields (still used)
    processing_stage VARCHAR(50) DEFAULT 'pending',
    error_message TEXT,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Performance indexes for jobs
CREATE INDEX idx_jobs_workflow_state ON jobs(workflow_state);
CREATE INDEX idx_jobs_status ON jobs(status_code);
CREATE INDEX idx_jobs_created_at ON jobs(created_at DESC);
CREATE INDEX idx_jobs_file_hash ON jobs(file_hash) WHERE file_hash IS NOT NULL;

-- Comments for documentation
COMMENT ON TABLE jobs IS 'Main transcription jobs with independent workflow states';
COMMENT ON COLUMN jobs.workflow_state IS 'Current state: uploaded → transcribing → transcribed → diarizing → diarized → aligning → completed | error';
COMMENT ON COLUMN jobs.transcription_data IS 'Raw Whisper transcription output stored as JSONB';
COMMENT ON COLUMN jobs.diarization_data IS 'Raw PyAnnote diarization output stored as JSONB';
COMMENT ON COLUMN jobs.current_step_progress IS 'Progress (0-100) for the current workflow step only';

-- Auto-update trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_jobs_updated_at BEFORE UPDATE ON jobs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Export jobs table (for PDF/Markdown background generation)
CREATE TABLE export_jobs (
    uuid UUID PRIMARY KEY,
    job_uuid UUID NOT NULL REFERENCES jobs(uuid) ON DELETE CASCADE,
    export_type VARCHAR(20) NOT NULL CHECK (export_type IN ('pdf', 'markdown')),
    status_code INTEGER NOT NULL,
    progress_percentage INTEGER DEFAULT 0 CHECK (progress_percentage >= 0 AND progress_percentage <= 100),
    error_message TEXT,
    file_path TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Performance indexes for export_jobs
CREATE INDEX idx_export_jobs_job_uuid ON export_jobs(job_uuid);
CREATE INDEX idx_export_jobs_status ON export_jobs(status_code);
CREATE INDEX idx_export_jobs_created_at ON export_jobs(created_at DESC);

CREATE TRIGGER update_export_jobs_updated_at BEFORE UPDATE ON export_jobs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
