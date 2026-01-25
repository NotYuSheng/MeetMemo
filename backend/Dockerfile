## Use official PyTorch image with CUDA 12.1 support
FROM pytorch/pytorch:2.2.0-cuda12.1-cudnn8-runtime

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

# Install Python dependencies and ensure CUDA-enabled PyTorch remains
RUN pip install -r requirements.txt \
    && pip uninstall -y torch torchvision torchaudio \
    && pip install --index-url https://download.pytorch.org/whl/cu121 \
         torch==2.5.1 torchvision torchaudio

# Copy application code
COPY . /app

# Expose FastAPI port
EXPOSE 8000

# Launch the FastAPI app with Uvicorn
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
