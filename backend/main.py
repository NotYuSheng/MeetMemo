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
import time
from contextlib import asynccontextmanager
from logging.handlers import RotatingFileHandler

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.v1 import api_router
from api.ws import ws_router
from config import get_settings
from database import close_database, init_database
from dependencies import close_http_client, init_http_client
from repositories.export_repository import ExportRepository
from repositories.job_repository import JobRepository
from services.cleanup_service import CleanupService
from services.diarization_service import DiarizationService
from services.transcription_service import TranscriptionService

# Load environment variables
load_dotenv('.env')

# Configure logging with rotation and console output
# This function will be called properly after Settings initialization
def configure_logging(config_settings=None):
    """Configure logging with rotation and console output."""
    # Use settings if provided, otherwise use defaults
    if config_settings:
        log_level = config_settings.log_level
        log_file = config_settings.log_file
        log_max_bytes = config_settings.log_max_bytes
        log_backup_count = config_settings.log_backup_count
        log_to_console = config_settings.log_to_console
    else:
        log_level = os.getenv('LOG_LEVEL', 'INFO')
        log_file = 'logs/app.log'
        log_max_bytes = 10 * 1024 * 1024
        log_backup_count = 5
        log_to_console = True

    # Create logs directory
    os.makedirs(os.path.dirname(log_file), exist_ok=True)

    # Clear any existing handlers
    root_logger = logging.getLogger()
    root_logger.handlers.clear()

    # Set root logger level
    root_logger.setLevel(getattr(logging, log_level.upper()))

    # Create formatter
    formatter = logging.Formatter(
        '%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )

    # File handler with rotation
    file_handler = RotatingFileHandler(
        log_file,
        maxBytes=log_max_bytes,
        backupCount=log_backup_count,
        encoding='utf-8'
    )
    file_handler.setLevel(getattr(logging, log_level.upper()))
    file_handler.setFormatter(formatter)
    root_logger.addHandler(file_handler)

    # Console handler (for Docker logs visibility)
    if log_to_console:
        console_handler = logging.StreamHandler()
        console_handler.setLevel(getattr(logging, log_level.upper()))
        console_handler.setFormatter(formatter)
        root_logger.addHandler(console_handler)

    return logging.getLogger(__name__)

# Initial logging setup with defaults (will be reconfigured in lifespan)
logger = configure_logging()

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
    ERROR_MESSAGE = (
        "\n╔════════════════════════════════════════════════════════════════╗\n"
        "║ ERROR: Missing Required Environment Variables                 ║\n"
        "╚════════════════════════════════════════════════════════════════╝\n"
        "\nThe following environment variables are required but not set:\n\n"
        + "\n".join(missing_vars) +
        "\n\nPlease ensure these variables are defined in your .env file.\n"
        "See CLAUDE.md for more information on configuration.\n"
    )
    logger.error(ERROR_MESSAGE)
    raise EnvironmentError(ERROR_MESSAGE)

# Log warning for optional env vars
if not os.getenv('LLM_API_KEY'):
    logger.warning("LLM_API_KEY is not set. LLM requests will be made without authentication.")


@asynccontextmanager
async def lifespan(fastapi_app: FastAPI):  # pylint: disable=unused-argument
    """
    Lifespan context manager for startup and shutdown events.

    Modern FastAPI pattern replacing @app.on_event decorators.
    """
    app_settings = get_settings()

    # Reconfigure logging with settings
    global logger  # pylint: disable=global-statement
    logger = configure_logging(app_settings)
    logger.info("Starting MeetMemo API with configured logging...")

    # Startup
    try:
        # Ensure required directories exist
        os.makedirs(app_settings.upload_dir, exist_ok=True)
        os.makedirs(app_settings.transcript_dir, exist_ok=True)
        os.makedirs(app_settings.transcript_edited_dir, exist_ok=True)
        os.makedirs(app_settings.summary_dir, exist_ok=True)
        os.makedirs(app_settings.export_dir, exist_ok=True)

        # Initialize database
        await init_database()
        logger.info("Database initialized")

        # Initialize HTTP client
        await init_http_client()
        logger.info("HTTP client initialized")

        # Preload ML models
        transcription_service = TranscriptionService(
            app_settings,
            JobRepository()
        )
        diarization_service = DiarizationService(
            app_settings,
            JobRepository()
        )

        try:
            transcription_service.get_model("turbo")
            logger.info("Whisper model preloaded successfully")
        except Exception as e:  # pylint: disable=broad-exception-caught
            logger.error("Failed to preload Whisper model: %s", e)

        try:
            diarization_service.get_pipeline()
            logger.info("PyAnnote pipeline preloaded successfully")
        except Exception as e:  # pylint: disable=broad-exception-caught
            logger.error("Failed to preload PyAnnote pipeline: %s", e)

        # Start cleanup scheduler
        cleanup_service = CleanupService(
            app_settings,
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
            await cleanup_service.stop_scheduler()

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


# Request/Response Logging Middleware
@app.middleware("http")
async def log_requests(request, call_next):
    """Log all HTTP requests and responses with timing."""
    request_logger = logging.getLogger("api.requests")
    start_time = time.time()

    # Log request
    request_logger.info(
        "Request: %s %s from %s",
        request.method,
        request.url.path,
        request.client.host if request.client else "unknown"
    )

    try:
        response = await call_next(request)
        process_time = time.time() - start_time

        # Log response
        request_logger.info(
            "Response: %s %s - Status: %d - Duration: %.3fs",
            request.method,
            request.url.path,
            response.status_code,
            process_time
        )

        return response

    except Exception as e:
        process_time = time.time() - start_time
        request_logger.error(
            "Request failed: %s %s - Error: %s - Duration: %.3fs",
            request.method,
            request.url.path,
            str(e),
            process_time,
            exc_info=True
        )
        raise


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

# Register WebSocket routes
app.include_router(ws_router, prefix="/ws")


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
