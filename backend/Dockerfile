## Use PyTorch 2.8.0 + CUDA 12.8 for native RTX 50xx (Blackwell / sm_120) kernel support.
## CUDA 12.x keeps libcublas.so.12 intact for ctranslate2/faster-whisper.
FROM pytorch/pytorch:2.8.0-cuda12.8-cudnn9-runtime

# Prevent Python from writing .pyc files and enable unbuffered logging
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=UTC

# Set working directory
WORKDIR /app

# Install system dependencies BEFORE pip install (required for PyAV)
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        ffmpeg \
        libsndfile1 \
        pkg-config \
        libavformat-dev \
        libavcodec-dev \
        libavutil-dev \
        libavdevice-dev \
        libavfilter-dev \
        libswscale-dev \
        libswresample-dev && \
    rm -rf /var/lib/apt/lists/*

# Copy dependencies list
COPY requirements.txt /app/requirements.txt

# Install Python dependencies
RUN pip install --break-system-packages -r requirements.txt

# Copy application code
COPY . /app

# Expose FastAPI port
EXPOSE 8000

# Launch the FastAPI app with Uvicorn
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
