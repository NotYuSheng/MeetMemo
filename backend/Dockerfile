## Use official PyTorch image with CUDA support
FROM pytorch/pytorch:2.1.0-cuda11.8-cudnn8-runtime

# Prevent Python from writing .pyc files and enable unbuffered logging
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Set working directory
WORKDIR /app

# Copy dependencies list
COPY requirements.txt /app/requirements.txt

# Install Python dependencies and ensure CUDA-enabled PyTorch remains
RUN pip install -r requirements.txt \
    && pip uninstall -y torch torchvision torchaudio \
    && pip install --index-url https://download.pytorch.org/whl/cu118 \
         torch torchvision torchaudio

# Install system dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        ffmpeg \
        libsndfile1 && \
    rm -rf /var/lib/apt/lists/*

# Copy application code
COPY . /app

# Expose FastAPI port
EXPOSE 8000

# Launch the FastAPI app with Uvicorn
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
