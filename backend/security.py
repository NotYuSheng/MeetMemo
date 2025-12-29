"""Security utilities for input validation and sanitization."""
import re
from pathlib import Path
from fastapi import HTTPException


def sanitize_filename(filename: str, max_length: int = 255) -> str:
    """
    Sanitize filename to prevent path traversal and other attacks.

    Args:
        filename: The filename to sanitize
        max_length: Maximum allowed filename length

    Returns:
        Sanitized filename

    Raises:
        HTTPException: If filename is invalid
    """
    if not filename or not filename.strip():
        raise HTTPException(status_code=400, detail="Filename cannot be empty")

    # Get just the filename, removing any path components
    filename = Path(filename).name

    # Check for path traversal attempts
    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(
            status_code=400,
            detail="Invalid filename: path traversal detected"
        )

    # Remove or replace dangerous characters, keep only safe ones
    # Allow: alphanumeric, spaces, hyphens, underscores, periods
    safe_filename = re.sub(r'[^\w\s\-\.]', '', filename)

    if not safe_filename or safe_filename != filename:
        raise HTTPException(
            status_code=400,
            detail="Invalid filename: contains illegal characters"
        )

    # Limit length
    if len(safe_filename) > max_length:
        raise HTTPException(
            status_code=400,
            detail=f"Filename too long: maximum {max_length} characters"
        )

    # Ensure filename has an extension
    if '.' not in safe_filename:
        raise HTTPException(
            status_code=400,
            detail="Filename must have an extension"
        )

    return safe_filename


def validate_uuid_format(uuid: str) -> str:
    """
    Validate UUID format (supports both legacy 4-digit and UUID4 format).

    Args:
        uuid: The UUID string to validate

    Returns:
        Normalized UUID string

    Raises:
        HTTPException: If UUID format is invalid
    """
    import uuid as uuid_lib

    # Handle legacy 4-digit format
    if len(uuid) <= 4 and uuid.isdigit():
        return uuid.zfill(4)

    # Validate UUID4 format
    try:
        uuid_lib.UUID(uuid)
        return uuid
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid UUID format: {uuid}"
        )


def sanitize_log_data(data: str, max_length: int = 100) -> str:
    """
    Sanitize data for logging to prevent exposing sensitive information.

    Args:
        data: The data to sanitize
        max_length: Maximum length to include in logs

    Returns:
        Sanitized string safe for logging
    """
    if not data:
        return "[empty]"

    # Truncate long data
    if len(data) > max_length:
        return f"[{len(data)} chars, truncated: {data[:max_length]}...]"

    return f"[{len(data)} chars]"
