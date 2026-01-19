"""Database module for managing jobs using PostgreSQL with async support."""
import json
import logging
import os
from contextlib import asynccontextmanager
from typing import Optional

import asyncpg

logger = logging.getLogger(__name__)

# Global connection pool
_db_pool: Optional[asyncpg.Pool] = None  # pylint: disable=invalid-name


async def init_database():
    """Initialize database connection pool."""
    global _db_pool  # pylint: disable=global-statement

    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise ValueError("DATABASE_URL environment variable not set")

    try:
        _db_pool = await asyncpg.create_pool(
            database_url,
            min_size=5,
            max_size=20,
            command_timeout=60
        )
        logger.info("Database connection pool initialized successfully")
    except Exception as e:
        logger.error("Failed to initialize database pool: %s", e, exc_info=True)
        raise


async def close_database():
    """Close database connection pool."""
    global _db_pool  # pylint: disable=global-statement,global-variable-not-assigned
    if _db_pool:
        await _db_pool.close()
        logger.info("Database connection pool closed")


@asynccontextmanager
async def get_db():
    """Get database connection from pool."""
    if not _db_pool:
        raise RuntimeError("Database pool not initialized. Call init_database() first.")

    async with _db_pool.acquire() as connection:
        yield connection


# ============================================================================
# Jobs table functions
# ============================================================================

async def add_job(
    uuid: str,
    file_name: str,
    status_code: int,
    file_hash: Optional[str] = None,
    workflow_state: str = 'uploaded',
    model_name: Optional[str] = None,
    language: Optional[str] = None
) -> None:
    """Add new job to database with workflow state."""
    async with get_db() as conn:
        await conn.execute(
            """INSERT INTO jobs (uuid, file_name, status_code, file_hash, workflow_state, model_name, language)
               VALUES ($1, $2, $3, $4, $5, $6, $7)""",
            uuid, file_name, status_code, file_hash, workflow_state, model_name, language
        )
    hash_preview = file_hash[:16] if file_hash else 'None'
    logger.info(
        "Added job %s with file %s (hash: %s...) state: %s, model: %s, language: %s",
        uuid, file_name, hash_preview, workflow_state, model_name, language
    )


async def update_status(uuid: str, new_status: int) -> None:
    """Update job status."""
    async with get_db() as conn:
        await conn.execute(
            """UPDATE jobs
               SET status_code = $1
               WHERE uuid = $2""",
            new_status, uuid
        )
    logger.debug("Updated status for job %s to %s", uuid, new_status)


async def update_progress(uuid: str, progress: int, stage: str) -> None:
    """Update job progress and processing stage."""
    async with get_db() as conn:
        await conn.execute(
            """UPDATE jobs
               SET progress_percentage = $1, processing_stage = $2
               WHERE uuid = $3""",
            progress, stage, uuid
        )
    logger.debug("Updated progress for job %s to %s%% (%s)", uuid, progress, stage)


async def update_error(uuid: str, error_message: str) -> None:
    """Update job with error message and set status to 500."""
    async with get_db() as conn:
        await conn.execute(
            """UPDATE jobs
               SET status_code = 500, error_message = $1
               WHERE uuid = $2""",
            error_message, uuid
        )
    logger.error("Job %s failed with error: %s", uuid, error_message)


async def get_job(uuid: str) -> Optional[dict]:
    """Get job by UUID."""
    async with get_db() as conn:
        row = await conn.fetchrow(
            """SELECT uuid, file_name, status_code, processing_stage, error_message,
                      file_hash, workflow_state, current_step_progress,
                      transcription_data, diarization_data, model_name, language, created_at
               FROM jobs WHERE uuid = $1""",
            uuid
        )
        return dict(row) if row else None


async def get_all_jobs(limit: int = 100, offset: int = 0) -> list[dict]:
    """Get all jobs with pagination."""
    async with get_db() as conn:
        rows = await conn.fetch(
            """SELECT uuid, file_name, status_code, workflow_state,
                      current_step_progress, processing_stage, error_message, created_at
               FROM jobs
               ORDER BY created_at DESC
               LIMIT $1 OFFSET $2""",
            limit, offset
        )
        return [dict(row) for row in rows]


async def get_jobs_count() -> int:
    """Get total number of jobs."""
    async with get_db() as conn:
        count = await conn.fetchval("SELECT COUNT(*) FROM jobs")
        return count


async def delete_job(uuid: str) -> Optional[str]:
    """Delete job from database and return file_name if found."""
    async with get_db() as conn:
        # Get file_name before deleting
        row = await conn.fetchrow(
            "SELECT file_name FROM jobs WHERE uuid = $1",
            uuid
        )

        if not row:
            return None

        file_name = row['file_name']

        # Delete the job (CASCADE will delete export_jobs)
        await conn.execute("DELETE FROM jobs WHERE uuid = $1", uuid)

        logger.info("Deleted job %s with file %s", uuid, file_name)
        return file_name


async def update_file_name(uuid: str, new_file_name: str) -> bool:
    """Update job file name."""
    async with get_db() as conn:
        result = await conn.execute(
            """UPDATE jobs
               SET file_name = $1
               WHERE uuid = $2""",
            new_file_name, uuid
        )
        # result is like "UPDATE 1" or "UPDATE 0"
        success = result.split()[-1] != "0"

    if success:
        logger.info("Updated file name for job %s to %s", uuid, new_file_name)

    return success


async def cleanup_old_jobs(max_age_hours: int = 12) -> list[dict]:
    """
    Find and delete jobs older than max_age_hours.
    Returns list of deleted jobs with their file_names.
    """
    async with get_db() as conn:
        # Find old jobs
        rows = await conn.fetch(
            """SELECT uuid, file_name
               FROM jobs
               WHERE created_at < NOW() - INTERVAL '1 hour' * $1""",
            max_age_hours
        )
        old_jobs = [dict(row) for row in rows]

        if old_jobs:
            # Delete old jobs
            uuids = [job['uuid'] for job in old_jobs]
            await conn.execute(
                "DELETE FROM jobs WHERE uuid = ANY($1::uuid[])",
                uuids
            )

            logger.info("Cleaned up %s jobs older than %s hours", len(old_jobs), max_age_hours)

        return old_jobs


# ============================================================================
# Export jobs table functions
# ============================================================================

async def add_export_job(
    export_uuid: str,
    job_uuid: str,
    export_type: str,
    status_code: int
) -> None:
    """Add new export job to database."""
    async with get_db() as conn:
        await conn.execute(
            """INSERT INTO export_jobs (uuid, job_uuid, export_type, status_code)
               VALUES ($1, $2, $3, $4)""",
            export_uuid, job_uuid, export_type, status_code
        )
    logger.info("Added export job %s for job %s (%s)", export_uuid, job_uuid, export_type)


async def get_export_job(uuid: str) -> Optional[dict]:
    """Get export job by UUID."""
    async with get_db() as conn:
        row = await conn.fetchrow(
            """SELECT uuid, job_uuid, export_type, status_code, progress_percentage,
                      error_message, file_path
               FROM export_jobs WHERE uuid = $1""",
            uuid
        )
        return dict(row) if row else None


async def update_export_status(uuid: str, status_code: int) -> None:
    """Update export job status."""
    async with get_db() as conn:
        await conn.execute(
            """UPDATE export_jobs
               SET status_code = $1
               WHERE uuid = $2""",
            status_code, uuid
        )
    logger.debug("Updated export job %s status to %s", uuid, status_code)


async def update_export_progress(uuid: str, progress: int) -> None:
    """Update export job progress."""
    async with get_db() as conn:
        await conn.execute(
            """UPDATE export_jobs
               SET progress_percentage = $1
               WHERE uuid = $2""",
            progress, uuid
        )
    logger.debug("Updated export job %s progress to %s%%", uuid, progress)


async def update_export_error(uuid: str, error_message: str) -> None:
    """Update export job with error message and set status to 500."""
    async with get_db() as conn:
        await conn.execute(
            """UPDATE export_jobs
               SET status_code = 500, error_message = $1
               WHERE uuid = $2""",
            error_message, uuid
        )
    logger.error("Export job %s failed with error: %s", uuid, error_message)


async def update_export_file_path(uuid: str, file_path: str) -> None:
    """Update export job file path."""
    async with get_db() as conn:
        await conn.execute(
            """UPDATE export_jobs
               SET file_path = $1
               WHERE uuid = $2""",
            file_path, uuid
        )
    logger.debug("Updated export job %s file path to %s", uuid, file_path)


async def cleanup_old_export_jobs(max_age_hours: int = 24) -> list[dict]:
    """
    Find and delete export jobs older than max_age_hours.
    Returns list of deleted export jobs.
    """
    async with get_db() as conn:
        # Find old export jobs
        rows = await conn.fetch(
            """SELECT uuid, job_uuid, export_type, file_path
               FROM export_jobs
               WHERE created_at < NOW() - INTERVAL '1 hour' * $1""",
            max_age_hours
        )
        old_exports = [dict(row) for row in rows]

        if old_exports:
            # Delete old export jobs
            uuids = [export['uuid'] for export in old_exports]
            await conn.execute(
                "DELETE FROM export_jobs WHERE uuid = ANY($1::uuid[])",
                uuids
            )

            logger.info(
                "Cleaned up %s export jobs older than %s hours",
                len(old_exports), max_age_hours
            )

        return old_exports


# ============================================================================
# File hash functions for duplicate detection
# ============================================================================

async def get_job_by_hash(file_hash: str) -> Optional[dict]:
    """
    Find existing job by file hash.
    Returns the most recent job with the given hash.
    """
    async with get_db() as conn:
        row = await conn.fetchrow(
            """SELECT uuid, file_name, status_code, processing_stage, error_message,
                      file_hash, created_at, workflow_state, current_step_progress
               FROM jobs
               WHERE file_hash = $1
               ORDER BY created_at DESC
               LIMIT 1""",
            file_hash
        )
        return dict(row) if row else None


# ============================================================================
# Workflow state management functions
# ============================================================================

async def update_workflow_state(uuid: str, new_state: str, progress: int = 0) -> None:
    """Update job workflow state and reset step progress."""
    async with get_db() as conn:
        await conn.execute(
            """UPDATE jobs
               SET workflow_state = $1, current_step_progress = $2
               WHERE uuid = $3""",
            new_state, progress, uuid
        )
    logger.debug("Updated workflow state for job %s to %s (%s%%)", uuid, new_state, progress)


async def update_step_progress(uuid: str, progress: int) -> None:
    """Update progress for current workflow step."""
    async with get_db() as conn:
        await conn.execute(
            """UPDATE jobs
               SET current_step_progress = $1
               WHERE uuid = $2""",
            progress, uuid
        )
    logger.debug("Updated step progress for job %s to %s%%", uuid, progress)


async def save_transcription_data(uuid: str, transcription_data: dict) -> None:
    """Save raw transcription data from Whisper."""
    async with get_db() as conn:
        await conn.execute(
            """UPDATE jobs
               SET transcription_data = $1
               WHERE uuid = $2""",
            json.dumps(transcription_data), uuid
        )
    logger.info("Saved transcription data for job %s", uuid)


async def save_diarization_data(uuid: str, diarization_data: dict) -> None:
    """Save raw diarization data from PyAnnote."""
    async with get_db() as conn:
        await conn.execute(
            """UPDATE jobs
               SET diarization_data = $1
               WHERE uuid = $2""",
            json.dumps(diarization_data), uuid
        )
    logger.info("Saved diarization data for job %s", uuid)


async def get_transcription_data(uuid: str) -> Optional[dict]:
    """Get raw transcription data for a job."""
    async with get_db() as conn:
        row = await conn.fetchrow(
            """SELECT transcription_data FROM jobs WHERE uuid = $1""",
            uuid
        )
        if row and row['transcription_data']:
            return json.loads(row['transcription_data'])
        return None


async def get_diarization_data(uuid: str) -> Optional[dict]:
    """Get raw diarization data for a job."""
    async with get_db() as conn:
        row = await conn.fetchrow(
            """SELECT diarization_data FROM jobs WHERE uuid = $1""",
            uuid
        )
        if row and row['diarization_data']:
            return json.loads(row['diarization_data'])
        return None
