# Use official Python base image
FROM python:3.11-slim

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Set working directory
WORKDIR /app

COPY requirements.txt /app/requirements.txt

# Install dependencies
RUN pip install --index-url https://download.pytorch.org/whl/cu118 torch torchvision torchaudio 

RUN pip install -r requirements.txt

COPY . /app

RUN apt-get update && \
  apt-get install -y --no-install-recommends \
  ffmpeg \
  libsndfile1  \
  && rm -rf /var/lib/apt/lists/*

# Expose the port FastAPI will run on
EXPOSE 8000

# Start FastAPI app using Uvicorn
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
