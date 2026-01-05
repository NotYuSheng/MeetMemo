"""
FastAPI application entry point for MeetMemo.

Refactored version using modular architecture with:
- Service layer with dependency injection
- Repository pattern for data access
- Organized API routers by domain
- Modern lifespan context manager
"""
import logging
import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import get_settings
from database import init_database, close_database
from dependencies import init_http_client, close_http_client
from services.cleanup_service import CleanupService
from services.transcription_service import TranscriptionService
from services.diarization_service import DiarizationService
from repositories.job_repository import JobRepository
from repositories.export_repository import ExportRepository
from api.v1 import api_router

# Load environment variables
load_dotenv('.env')

# Configure logging
os.makedirs("logs", exist_ok=True)
logging.basicConfig(
    level=logging.INFO,
    filename='logs/app.log',
    filemode='a',
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Validate required environment variables
REQUIRED_ENV_VARS = {
    'HF_TOKEN': 'Hugging Face token for PyAnnote models',
    'LLM_API_URL': 'LLM endpoint for summarization',
    'LLM_MODEL_NAME': 'LLM model identifier'
}

missing_vars = []
for var, description in REQUIRED_ENV_VARS.items():
    if not os.getenv(var):
        missing_vars.append(f"  - {var}: {description}")

if missing_vars:
    error_message = (
        "\n╔════════════════════════════════════════════════════════════════╗\n"
        "║ ERROR: Missing Required Environment Variables                 ║\n"
        "╚════════════════════════════════════════════════════════════════╝\n"
        "\nThe following environment variables are required but not set:\n\n"
        + "\n".join(missing_vars) +
        "\n\nPlease ensure these variables are defined in your .env file.\n"
        "See CLAUDE.md for more information on configuration.\n"
    )
    logger.error(error_message)
    raise EnvironmentError(error_message)

# Log warning for optional env vars
if not os.getenv('LLM_API_KEY'):
    logger.warning("LLM_API_KEY is not set. LLM requests will be made without authentication.")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Lifespan context manager for startup and shutdown events.

    Modern FastAPI pattern replacing @app.on_event decorators.
    """
    settings = get_settings()
    logger.info("Starting MeetMemo API...")

    # Startup
    try:
        # Ensure required directories exist
        os.makedirs(settings.upload_dir, exist_ok=True)
        os.makedirs(settings.transcript_dir, exist_ok=True)
        os.makedirs(settings.transcript_edited_dir, exist_ok=True)
        os.makedirs(settings.summary_dir, exist_ok=True)
        os.makedirs(settings.export_dir, exist_ok=True)

        # Initialize database
        await init_database()
        logger.info("Database initialized")

        # Initialize HTTP client
        await init_http_client()
        logger.info("HTTP client initialized")

        # Preload ML models
        transcription_service = TranscriptionService(
            settings,
            JobRepository()
        )
        diarization_service = DiarizationService(
            settings,
            JobRepository()
        )

        try:
            transcription_service.get_model("turbo")
            logger.info("Whisper model preloaded successfully")
        except Exception as e:
            logger.error("Failed to preload Whisper model: %s", e)

        try:
            diarization_service.get_pipeline()
            logger.info("PyAnnote pipeline preloaded successfully")
        except Exception as e:
            logger.error("Failed to preload PyAnnote pipeline: %s", e)

        # Start cleanup scheduler
        cleanup_service = CleanupService(
            settings,
            JobRepository(),
            ExportRepository()
        )
        cleanup_service.start_scheduler()
        logger.info("Cleanup scheduler started")

        logger.info("MeetMemo API startup complete")

        yield

    finally:
        # Shutdown
        logger.info("Shutting down MeetMemo API...")

        # Stop cleanup scheduler
        if 'cleanup_service' in locals():
            cleanup_service.stop_scheduler()

        # Close HTTP client
        await close_http_client()

        # Close database
        await close_database()

        logger.info("MeetMemo API shutdown complete")


# Initialize FastAPI app
app = FastAPI(
    title="MeetMemo API",
    version="2.0.0",
    description="Audio transcription and speaker diarization API with modular architecture",
    lifespan=lifespan
)

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["*"],
)

# Register v1 API routes
app.include_router(api_router, prefix="/api/v1")

# Health check root
@app.get("/")
async def root():
    """Root endpoint - redirect to health check."""
    return {"message": "MeetMemo API v2.0", "status": "active"}


# Run with uvicorn if executed directly
if __name__ == "__main__":
    import uvicorn

    settings = get_settings()
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=False,
        log_config=None  # Use our logging config
    )
