<h1 align="center">MeetMemo</h1>

<p align="center">
  <strong>AI-powered meeting transcription with speaker diarization and intelligent summarization</strong>
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#usage">Usage</a> •
  <a href="#documentation">Documentation</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/FastAPI-009688?style=flat&logo=fastapi&logoColor=white" alt="FastAPI"/>
  <img src="https://img.shields.io/badge/React-61DAFB?style=flat&logo=react&logoColor=black" alt="React"/>
  <img src="https://img.shields.io/badge/PyTorch-EE4C2C?style=flat&logo=pytorch&logoColor=white" alt="PyTorch"/>
  <img src="https://img.shields.io/badge/Docker-2496ED?style=flat&logo=docker&logoColor=white" alt="Docker"/>
  <img src="https://img.shields.io/badge/PostgreSQL-4169E1?style=flat&logo=postgresql&logoColor=white" alt="PostgreSQL"/>
  <img src="https://img.shields.io/badge/NVIDIA-CUDA-76B900?style=flat&logo=nvidia&logoColor=white" alt="CUDA"/>
  <img src="https://img.shields.io/github/license/NotYuSheng/MeetMemo" alt="License"/>
</p>

---

A meeting transcription application that runs entirely offline. It converts speech to text, identifies different speakers (diarization), and generates intelligent summaries of discussions. Connect it to your local LLM server for customized summarization. Perfect for meetings, interviews, lectures, or any audio where you need a clear transcript and actionable insights.

<div align="center">

![MeetMemo Demo](https://raw.githubusercontent.com/NotYuSheng/MeetMemo/main/sample-files/MeetMemo-Demo.gif)

</div>

## Features

| Feature | Description |
|---------|-------------|
| **Audio Recording & Upload** | Record meetings directly in browser or upload files (MP3, WAV, M4A, FLAC, WebM, OGG) |
| **Speech Recognition** | OpenAI Whisper (turbo model) for high-accuracy transcription in 99+ languages |
| **Speaker Diarization** | PyAnnote.audio 3.1 for automatic speaker identification and labeling |
| **AI Summarization** | LLM-powered summaries with key points, action items, and insights |
| **Real-time Progress** | Live status updates and job management for long-running tasks |
| **Speaker Management** | Edit speaker names with persistent storage across sessions |
| **Export Options** | Professional PDF and Markdown exports for transcripts and summaries |
| **Multi-language** | Automatic language detection or specify target language |

## Quick Start

### Prerequisites

| Software | Version | Purpose |
|----------|---------|---------|
| Docker | Latest | Container runtime |
| Docker Compose | Latest | Multi-container orchestration |
| NVIDIA GPU | CUDA 11.8+ | ML model inference (optional, CPU fallback available) |
| LLM Server | Any OpenAI-compatible API | Summarization (e.g., LM Studio, Ollama, OpenAI) |

**Minimum Hardware:**
- GPU: 4GB VRAM (8GB+ recommended)
- RAM: 8GB (16GB+ recommended)
- Storage: 10GB (for models and data)

### Installation

**1. Clone and setup:**
```bash
git clone https://github.com/NotYuSheng/MeetMemo.git
cd MeetMemo
cp example.env .env
```

**2. Accept Hugging Face model licenses:**
- Visit [speaker-diarization-3.1](https://huggingface.co/pyannote/speaker-diarization-3.1) → Accept
- Visit [segmentation-3.0](https://huggingface.co/pyannote/segmentation-3.0) → Accept
- Create token at [HF Tokens](https://huggingface.co/settings/tokens) with **Read** access

**3. Configure `.env`:**
```env
# Required
HF_TOKEN=hf_your_token_here
LLM_API_URL=http://localhost:1234
LLM_MODEL_NAME=qwen2.5-14b-instruct

# Optional
LLM_API_KEY=                    # Leave empty for local LLMs
POSTGRES_PASSWORD=changeme      # Change in production!
TIMEZONE_OFFSET=+8              # Your timezone
```

**4. Start the application:**
```bash
docker compose up -d
```

**5. Access MeetMemo:**

Open **https://localhost** in your browser.

> **Note**: You'll see a certificate warning (self-signed SSL). Click "Advanced" → "Proceed" - this is expected and required for microphone access.

## Usage

### Basic Workflow

```mermaid
graph LR
    A[Upload/Record Audio] --> B[Transcribe]
    B --> C[Review Transcript]
    C --> D[Edit Speaker Names]
    D --> E[Generate Summary]
    E --> F[Export PDF/Markdown]
```

1. **Upload or Record** - Upload an audio file or record directly in browser (HTTPS required)
2. **Transcribe** - Click "Start Transcription" to process with Whisper + PyAnnote
3. **Review** - View diarized transcript with speaker labels and timestamps
4. **Customize** - Click speaker names to rename them (persists across sessions)
5. **Summarize** - Generate AI summary with key insights and action items
6. **Export** - Download professional PDF or Markdown files

### Supported Audio Formats

MP3, WAV, M4A, FLAC, WebM, OGG (max 100MB default)

## Tech Stack

| Component | Technology |
|-----------|------------|
| **Backend** | FastAPI, Python 3.10+, Uvicorn, Pydantic Settings |
| **Architecture** | Layered architecture (API → Service → Repository → Database) |
| **Frontend** | React 19, Vite, Lucide Icons |
| **Reverse Proxy** | Nginx with SSL/TLS (self-signed certs included) |
| **ML Models** | OpenAI Whisper (turbo), PyAnnote.audio 3.1 |
| **Database** | PostgreSQL 16 with asyncpg |
| **Containerization** | Docker, Docker Compose, NVIDIA Container Toolkit |
| **PDF Generation** | ReportLab, svglib |

## Documentation

Comprehensive documentation is available in the [`docs/`](docs/) directory:

| Document | Description |
|----------|-------------|
| **[Architecture](docs/ARCHITECTURE.md)** | System architecture, design patterns, data flow |
| **[API Reference](docs/API.md)** | Complete REST API documentation with examples |
| **[Configuration](docs/CONFIGURATION.md)** | Environment variables, model selection, settings |
| **[Database](docs/DATABASE.md)** | Schema, queries, backup/restore, maintenance |
| **[Deployment](docs/DEPLOYMENT.md)** | Production deployment with HTTPS options |
| **[Development](docs/DEVELOPMENT.md)** | Developer guide for contributing |
| **[Troubleshooting](docs/TROUBLESHOOTING.md)** | Common issues and solutions |

## Common Tasks

### View Logs

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f meetmemo-backend
```

### Restart Services

```bash
# Restart all
docker compose restart

# Restart backend only
docker compose restart meetmemo-backend
```

### Backup Data

```bash
# Backup database
docker exec meetmemo-postgres pg_dump -U meetmemo meetmemo > backup.sql

# Backup all volumes
sudo tar -czf meetmemo_backup.tar.gz /var/lib/docker/volumes/meetmemo_*
```

### Access Database

```bash
docker exec -it meetmemo-postgres psql -U meetmemo meetmemo
```

## Deployment

MeetMemo includes **HTTPS with self-signed certificates out of the box**. For production:

- **Internal/Development**: Use built-in self-signed certs (works immediately)
- **Production**: Replace with real certificates or use Cloudflare Tunnel

See [Deployment Guide](docs/DEPLOYMENT.md) for detailed instructions.

## Security

- **Local Processing**: Transcription runs entirely on your server
- **Data Privacy**: Audio never leaves your infrastructure (except LLM summarization)
- **HTTPS**: SSL/TLS enabled by default
- **Database**: PostgreSQL not exposed outside Docker network
- **No Authentication**: Add auth layer for multi-user deployments

## Performance

- **GPU Acceleration**: Automatic CUDA support for faster processing
- **Model Caching**: ML models loaded once at startup
- **Async I/O**: All operations use async/await for concurrency
- **Background Cleanup**: Automatic cleanup of old jobs and exports

## Troubleshooting

Having issues? Check the [Troubleshooting Guide](docs/TROUBLESHOOTING.md) for solutions to:

- Microphone/recording not working
- GPU not detected
- Model download failures
- Container startup issues
- Performance problems

## Contributing

Contributions are welcome! Please see [Development Guide](docs/DEVELOPMENT.md) for:

- Development setup
- Code structure
- Testing guidelines
- Commit conventions

## Sample Outputs

The [`sample-files/`](sample-files/) directory contains example outputs:

- Sample audio files (MP3, WAV)
- Generated transcripts (PDF, Markdown)
- AI summaries with action items
- Application demo GIFs

## Star History

If you find MeetMemo useful, consider giving it a star! ⭐

<a href="https://star-history.com/#NotYuSheng/MeetMemo&Date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=NotYuSheng/MeetMemo&type=Date&theme=dark" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=NotYuSheng/MeetMemo&type=Date" />
    <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=NotYuSheng/MeetMemo&type=Date" />
  </picture>
</a>

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.

---

<p align="center">
  <sub>Built with AI assistance from Claude</sub>
</p>
