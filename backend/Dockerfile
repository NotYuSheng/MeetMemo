FROM python:3.11-slim

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PATH="/root/.cargo/bin:$PATH"

# Install system packages, Rust + uv, and audio tools
RUN apt-get update && \
    apt-get install -y curl build-essential gcc ffmpeg libsndfile1 bash && \
    curl --proto '=https' --tlsv1.2 -sSf https://astral.sh/uv/install.sh -o install_uv.sh && \
    bash install_uv.sh && \
    rm install_uv.sh && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Verify uv is installed
RUN uv --version

# Set working directory
WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN uv pip install --upgrade pip && uv pip install -r requirements.txt

# Copy application code
COPY . .

# Expose FastAPI port
EXPOSE 8000

# Start FastAPI app
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
