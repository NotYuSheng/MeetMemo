"""Database module for managing jobs using SQLite."""
import sqlite3
import logging
from contextlib import contextmanager
from pathlib import Path
from typing import Generator, Optional

DATABASE_PATH = "meetmemo.db"

logger = logging.getLogger(__name__)


def init_database():
    """Initialize database and create tables if they don't exist."""
    try:
        with get_db() as db:
            db.execute("""
                CREATE TABLE IF NOT EXISTS jobs (
                    uuid TEXT PRIMARY KEY,
                    file_name TEXT NOT NULL,
                    status_code INTEGER NOT NULL,
                    progress_percentage INTEGER DEFAULT 0,
                    processing_stage TEXT DEFAULT 'pending',
                    error_message TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)

            # Create indexes for common queries
            db.execute("""
                CREATE INDEX IF NOT EXISTS idx_jobs_status
                ON jobs(status_code)
            """)

            db.execute("""
                CREATE INDEX IF NOT EXISTS idx_jobs_created_at
                ON jobs(created_at DESC)
            """)

            logger.info("Database initialized successfully")
    except Exception as e:
        logger.error(f"Failed to initialize database: {e}", exc_info=True)
        raise


@contextmanager
def get_db() -> Generator[sqlite3.Connection, None, None]:
    """Get database connection with automatic commit/rollback."""
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row  # Return dict-like rows
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def add_job(uuid: str, file_name: str, status_code: int) -> None:
    """Add new job to database."""
    with get_db() as db:
        db.execute(
            """INSERT INTO jobs (uuid, file_name, status_code)
               VALUES (?, ?, ?)""",
            (uuid, file_name, status_code)
        )
    logger.info(f"Added job {uuid} with file {file_name}")


def update_status(uuid: str, new_status: int) -> None:
    """Update job status."""
    with get_db() as db:
        db.execute(
            """UPDATE jobs
               SET status_code = ?, updated_at = CURRENT_TIMESTAMP
               WHERE uuid = ?""",
            (new_status, uuid)
        )
    logger.debug(f"Updated status for job {uuid} to {new_status}")


def update_progress(uuid: str, progress: int, stage: str) -> None:
    """Update job progress and processing stage."""
    with get_db() as db:
        db.execute(
            """UPDATE jobs
               SET progress_percentage = ?, processing_stage = ?, updated_at = CURRENT_TIMESTAMP
               WHERE uuid = ?""",
            (progress, stage, uuid)
        )
    logger.debug(f"Updated progress for job {uuid} to {progress}% ({stage})")


def update_error(uuid: str, error_message: str) -> None:
    """Update job with error message and set status to 500."""
    with get_db() as db:
        db.execute(
            """UPDATE jobs
               SET status_code = 500, error_message = ?, updated_at = CURRENT_TIMESTAMP
               WHERE uuid = ?""",
            (error_message, uuid)
        )
    logger.error(f"Job {uuid} failed with error: {error_message}")


def get_job(uuid: str) -> Optional[dict]:
    """Get job by UUID."""
    with get_db() as db:
        cursor = db.execute(
            """SELECT uuid, file_name, status_code, progress_percentage,
                      processing_stage, error_message
               FROM jobs WHERE uuid = ?""",
            (uuid,)
        )
        row = cursor.fetchone()
        return dict(row) if row else None


def get_all_jobs(limit: int = 100, offset: int = 0) -> list[dict]:
    """Get all jobs with pagination."""
    with get_db() as db:
        cursor = db.execute(
            """SELECT uuid, file_name, status_code, progress_percentage,
                      processing_stage, error_message
               FROM jobs
               ORDER BY created_at DESC
               LIMIT ? OFFSET ?""",
            (limit, offset)
        )
        return [dict(row) for row in cursor.fetchall()]


def get_jobs_count() -> int:
    """Get total number of jobs."""
    with get_db() as db:
        cursor = db.execute("SELECT COUNT(*) FROM jobs")
        return cursor.fetchone()[0]


def delete_job(uuid: str) -> Optional[str]:
    """Delete job from database and return file_name if found."""
    with get_db() as db:
        # Get file_name before deleting
        cursor = db.execute(
            "SELECT file_name FROM jobs WHERE uuid = ?",
            (uuid,)
        )
        row = cursor.fetchone()

        if not row:
            return None

        file_name = row[0]

        # Delete the job
        db.execute("DELETE FROM jobs WHERE uuid = ?", (uuid,))

        logger.info(f"Deleted job {uuid} with file {file_name}")
        return file_name


def update_file_name(uuid: str, new_file_name: str) -> bool:
    """Update job file name."""
    with get_db() as db:
        cursor = db.execute(
            """UPDATE jobs
               SET file_name = ?, updated_at = CURRENT_TIMESTAMP
               WHERE uuid = ?""",
            (new_file_name, uuid)
        )
        success = cursor.rowcount > 0

    if success:
        logger.info(f"Updated file name for job {uuid} to {new_file_name}")

    return success


def cleanup_old_jobs(max_age_hours: int = 12) -> list[dict]:
    """
    Find and delete jobs older than max_age_hours.
    Returns list of deleted jobs with their file_names.
    """
    with get_db() as db:
        # Find old jobs
        cursor = db.execute(
            """SELECT uuid, file_name
               FROM jobs
               WHERE datetime(created_at) < datetime('now', '-' || ? || ' hours')""",
            (max_age_hours,)
        )
        old_jobs = [dict(row) for row in cursor.fetchall()]

        if old_jobs:
            # Delete old jobs
            uuids = [job['uuid'] for job in old_jobs]
            placeholders = ','.join('?' * len(uuids))
            db.execute(
                f"DELETE FROM jobs WHERE uuid IN ({placeholders})",
                uuids
            )

            logger.info(f"Cleaned up {len(old_jobs)} jobs older than {max_age_hours} hours")

        return old_jobs
