"""
Jobs router for job CRUD and workflow operations.

This router handles job creation, listing, status, deletion, and workflow step
initiation (transcription, diarization, alignment).
"""
import logging
import os
import uuid as uuid_lib

import aiofiles
import aiofiles.os
from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    HTTPException,
    Query,
    UploadFile,
)

from config import Settings, get_settings
from database import update_status
from dependencies import (
    get_alignment_service,
    get_audio_service,
    get_diarization_service,
    get_job_repository,
    get_transcription_service,
)
from models import (
    DeleteResponse,
    DiarizationDataResponse,
    JobListResponse,
    JobResponse,
    JobStatusResponse,
    RenameJobRequest,
    RenameResponse,
    TranscriptionDataResponse,
    WorkflowActionResponse,
)
from repositories.job_repository import JobRepository
from services.alignment_service import AlignmentService
from services.audio_service import AudioService
from services.diarization_service import DiarizationService
from services.transcription_service import TranscriptionService

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/jobs", response_model=JobResponse, status_code=202)
async def create_job(
    file: UploadFile = File(...),
    audio_service: AudioService = Depends(get_audio_service),
    job_repo: JobRepository = Depends(get_job_repository),
    settings: Settings = Depends(get_settings)
) -> JobResponse:
    """
    Create new job by uploading audio file.

    Checks for duplicate files using hash comparison.
    Returns immediately with job UUID.
    """
    job_uuid = str(uuid_lib.uuid4())

    try:
        # Upload and validate file
        file_name, file_hash = await audio_service.upload_audio(job_uuid, file)

        # Check for duplicate
        existing_job = await audio_service.check_duplicate(file_hash)
        if existing_job:
            # Remove duplicate upload
            file_path = os.path.join(settings.upload_dir, file_name)
            if await aiofiles.os.path.exists(file_path):
                await aiofiles.os.remove(file_path)

            logger.info(
                "Duplicate file detected. Returning existing job %s",
                existing_job['uuid']
            )
            return JobResponse(
                uuid=str(existing_job['uuid']),
                file_name=existing_job['file_name'],
                status_code=existing_job['status_code']
            )

        # Convert to WAV if needed
        file_path = os.path.join(settings.upload_dir, file_name)
        if not file_name.lower().endswith(".wav"):
            wav_file_name = f"{os.path.splitext(file_name)[0]}.wav"
            try:
                await audio_service.convert_to_wav_async(file_name, wav_file_name)
                if await aiofiles.os.path.exists(file_path):
                    await aiofiles.os.remove(file_path)
                file_name = wav_file_name
            except Exception as e:
                logger.error("Audio conversion failed: %s", e, exc_info=True)
                raise HTTPException(
                    status_code=500,
                    detail=f"Audio conversion failed: {str(e)}"
                ) from e

        # Create job record
        await job_repo.create(job_uuid, file_name, file_hash, 'uploaded')
        logger.info("Job %s created successfully", job_uuid)

        return JobResponse(
            uuid=job_uuid,
            file_name=file_name,
            status_code=202
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error creating job: %s", e, exc_info=True)
        try:
            await update_status(job_uuid, 500)
        except Exception:
            pass
        raise HTTPException(status_code=500, detail="Failed to create job") from e


@router.get("/jobs", response_model=JobListResponse)
async def list_jobs(
    limit: int = Query(default=100, le=1000),
    offset: int = Query(default=0, ge=0),
    job_repo: JobRepository = Depends(get_job_repository)
) -> JobListResponse:
    """List all jobs with pagination."""
    try:
        jobs, total = await job_repo.get_all(limit, offset)
        jobs_dict = {str(job['uuid']): job for job in jobs}

        return JobListResponse(
            jobs=jobs_dict,
            total=total,
            limit=limit,
            offset=offset
        )
    except Exception as e:
        logger.error("Error retrieving job list: %s", e, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Internal server error while retrieving job list"
        ) from e


@router.get("/jobs/{uuid}", response_model=JobStatusResponse)
async def get_job_status(
    uuid: str,
    job_repo: JobRepository = Depends(get_job_repository)
) -> JobStatusResponse:
    """Get job status and workflow state."""
    job = await job_repo.get(uuid)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {uuid} not found")

    # Determine available actions based on workflow state
    workflow_state = job.get('workflow_state', 'uploaded')
    available_actions = []

    if workflow_state == 'uploaded':
        available_actions = ['transcribe', 'delete']
    elif workflow_state == 'transcribed':
        available_actions = ['diarize', 'delete']
    elif workflow_state == 'diarized':
        available_actions = ['align', 'delete']
    elif workflow_state == 'completed':
        available_actions = ['export', 'delete']

    return JobStatusResponse(
        uuid=str(job['uuid']),
        file_name=job['file_name'],
        status_code=job['status_code'],
        status="completed" if job['status_code'] == 200 else "processing",
        workflow_state=workflow_state,
        current_step_progress=job.get('current_step_progress', 0),
        available_actions=available_actions,
        progress_percentage=job.get('progress_percentage', 0),
        processing_stage=job.get('processing_stage', 'pending'),
        error_message=job.get('error_message')
    )


@router.patch("/jobs/{uuid}", response_model=RenameResponse)
async def rename_job(
    uuid: str,
    request: RenameJobRequest,
    job_repo: JobRepository = Depends(get_job_repository),
    settings: Settings = Depends(get_settings)
) -> RenameResponse:
    """Rename a job's file."""
    job = await job_repo.get(uuid)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {uuid} not found")

    from utils.file_utils import get_unique_filename

    new_name = request.file_name
    unique_new_name = get_unique_filename(settings.upload_dir, new_name)

    await job_repo.update_file_name(uuid, unique_new_name)
    logger.info("Renamed job %s to %s", uuid, unique_new_name)

    return RenameResponse(
        uuid=uuid,
        status="success",
        new_name=unique_new_name
    )


@router.delete("/jobs/{uuid}", response_model=DeleteResponse)
async def delete_job(
    uuid: str,
    job_repo: JobRepository = Depends(get_job_repository),
    settings: Settings = Depends(get_settings)
) -> DeleteResponse:
    """Delete job and all associated files."""
    file_name = await job_repo.delete(uuid)
    if not file_name:
        raise HTTPException(status_code=404, detail=f"Job {uuid} not found")

    # Delete associated files
    import aiofiles.os as aioos

    base_name = os.path.splitext(file_name)[0]

    # Audio file
    audio_path = os.path.join(settings.upload_dir, file_name)
    if await aioos.path.exists(audio_path):
        await aioos.remove(audio_path)

    # Transcript files
    transcript_path = os.path.join(settings.transcript_dir, f"{base_name}.json")
    if await aioos.path.exists(transcript_path):
        await aioos.remove(transcript_path)

    edited_path = os.path.join(settings.transcript_edited_dir, f"{base_name}.json")
    if await aioos.path.exists(edited_path):
        await aioos.remove(edited_path)

    # Summary file
    summary_path = os.path.join(settings.summary_dir, f"{uuid}.txt")
    if await aioos.path.exists(summary_path):
        await aioos.remove(summary_path)

    logger.info("Deleted job %s and associated files", uuid)

    return DeleteResponse(
        uuid=uuid,
        status="success",
        message="Job deleted successfully"
    )


# ============================================================================
# Workflow Step Endpoints
# ============================================================================

@router.post("/jobs/{uuid}/transcriptions", response_model=WorkflowActionResponse, status_code=202)
async def start_transcription(
    uuid: str,
    background_tasks: BackgroundTasks,
    model_name: str = Query(default="turbo"),
    transcription_service: TranscriptionService = Depends(get_transcription_service),
    job_repo: JobRepository = Depends(get_job_repository),
    settings: Settings = Depends(get_settings)
) -> WorkflowActionResponse:
    """Start transcription step for uploaded audio file."""
    job = await job_repo.get(uuid)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {uuid} not found")

    file_path = os.path.join(settings.upload_dir, job['file_name'])

    # Run transcription in background
    background_tasks.add_task(
        transcription_service.transcribe,
        uuid,
        file_path,
        model_name
    )

    return WorkflowActionResponse(
        uuid=uuid,
        workflow_state="transcribing",
        status_code=202,
        message="Transcription started"
    )


@router.get("/jobs/{uuid}/transcriptions", response_model=TranscriptionDataResponse)
async def get_transcription_data(
    uuid: str,
    job_repo: JobRepository = Depends(get_job_repository)
) -> TranscriptionDataResponse:
    """Get raw transcription data."""
    job = await job_repo.get(uuid)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {uuid} not found")

    transcription_data = await job_repo.get_transcription(uuid)
    if not transcription_data:
        raise HTTPException(status_code=404, detail="Transcription data not found")

    return TranscriptionDataResponse(
        uuid=uuid,
        transcription_data=transcription_data,
        workflow_state=job.get('workflow_state', 'unknown')
    )


@router.post("/jobs/{uuid}/diarizations", response_model=WorkflowActionResponse, status_code=202)
async def start_diarization(
    uuid: str,
    background_tasks: BackgroundTasks,
    diarization_service: DiarizationService = Depends(get_diarization_service),
    job_repo: JobRepository = Depends(get_job_repository),
    settings: Settings = Depends(get_settings)
) -> WorkflowActionResponse:
    """Start diarization step for audio file."""
    job = await job_repo.get(uuid)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {uuid} not found")

    file_path = os.path.join(settings.upload_dir, job['file_name'])

    # Run diarization in background
    background_tasks.add_task(
        diarization_service.diarize,
        uuid,
        file_path
    )

    return WorkflowActionResponse(
        uuid=uuid,
        workflow_state="diarizing",
        status_code=202,
        message="Diarization started"
    )


@router.get("/jobs/{uuid}/diarizations", response_model=DiarizationDataResponse)
async def get_diarization_data(
    uuid: str,
    job_repo: JobRepository = Depends(get_job_repository)
) -> DiarizationDataResponse:
    """Get raw diarization data."""
    job = await job_repo.get(uuid)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {uuid} not found")

    diarization_data = await job_repo.get_diarization(uuid)
    if not diarization_data:
        raise HTTPException(status_code=404, detail="Diarization data not found")

    return DiarizationDataResponse(
        uuid=uuid,
        diarization_data=diarization_data,
        workflow_state=job.get('workflow_state', 'unknown')
    )


@router.post("/jobs/{uuid}/alignments", response_model=WorkflowActionResponse, status_code=202)
async def start_alignment(
    uuid: str,
    background_tasks: BackgroundTasks,
    alignment_service: AlignmentService = Depends(get_alignment_service),
    job_repo: JobRepository = Depends(get_job_repository)
) -> WorkflowActionResponse:
    """Start alignment step to combine transcription and diarization."""
    job = await job_repo.get(uuid)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {uuid} not found")

    file_name = os.path.splitext(job['file_name'])[0]

    # Run alignment in background
    background_tasks.add_task(
        alignment_service.align,
        uuid,
        file_name
    )

    return WorkflowActionResponse(
        uuid=uuid,
        workflow_state="aligning",
        status_code=202,
        message="Alignment started"
    )
