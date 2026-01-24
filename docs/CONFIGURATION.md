# Configuration Guide

Complete reference for configuring MeetMemo.

## Environment Variables

Create a `.env` file in the project root:

```bash
cp example.env .env
```

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `HF_TOKEN` | Hugging Face API token for PyAnnote models | `hf_abc...` |
| `LLM_API_URL` | LLM endpoint base URL (no `/v1/chat/completions` suffix) | `http://localhost:1234` |
| `LLM_MODEL_NAME` | Model identifier | `qwen2.5-14b-instruct` |
| `DATABASE_URL` | PostgreSQL connection string (auto-set in Docker) | `postgresql://...` |

### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `LLM_API_KEY` | API key for LLM service | Empty (none) |
| `POSTGRES_PASSWORD` | PostgreSQL password | `changeme` |
| `TIMEZONE_OFFSET` | Timezone offset from UTC (hours) | `+8` |
| `NVIDIA_VISIBLE_DEVICES` | GPU selection (`all`, `0`, `0,1`) | `all` |
| `HTTP_PORT` | External HTTP port for nginx | `80` |
| `HTTPS_PORT` | External HTTPS port for nginx | `443` |

## Whisper Model Selection

Edit `backend/config.py` or set `WHISPER_MODEL_NAME` environment variable:

| Model | VRAM | Speed | Accuracy | Use Case |
|-------|------|-------|----------|----------|
| `tiny` | ~1GB | Fastest | Basic | Quick drafts, testing |
| `base` | ~1GB | Fast | Good | General use |
| `small` | ~2GB | Moderate | Better | Most meetings |
| `medium` | ~5GB | Slow | High | Important recordings |
| `large` | ~10GB | Slowest | Highest | Critical accuracy needs |
| **`turbo`** | **~6GB** | **Fast** | **High** | **Default - Best balance** |

## File Storage Limits

Configure in `backend/config.py`:

```python
max_file_size: int = 100 * 1024 * 1024  # 100MB
allowed_audio_types: list[str] = [
    'audio/wav', 'audio/mpeg', 'audio/mp4',
    'audio/x-m4a', 'audio/webm', 'audio/flac', 'audio/ogg'
]
```

## Cleanup Configuration

Auto-cleanup of old jobs and exports:

```python
cleanup_interval_hours: int = 1      # Check every hour
job_retention_hours: int = 12        # Keep jobs for 12 hours
export_retention_hours: int = 24     # Keep exports for 24 hours
```

## Docker Volumes

All runtime data is stored in named Docker volumes:

| Volume | Purpose | Path in Container |
|--------|---------|-------------------|
| `meetmemo_audiofiles` | Uploaded audio files | `/app/audiofiles` |
| `meetmemo_transcripts` | Transcription JSONs | `/app/transcripts` |
| `meetmemo_summary` | Summary files | `/app/summary` |
| `meetmemo_exports` | PDF/Markdown exports | `/app/exports` |
| `meetmemo_logs` | Application logs | `/app/logs` |
| `meetmemo_whisper_cache` | Whisper models | `/root/.cache/whisper` |
| `meetmemo_huggingface_cache` | PyAnnote models | `/root/.cache/huggingface` |
| `meetmemo_torch_cache` | PyTorch cache | `/root/.cache/torch` |
| `meetmemo_postgres_data` | Database | `/var/lib/postgresql/data` |

## Database Configuration

PostgreSQL connection pool settings in `backend/config.py`:

```python
db_pool_min_size: int = 5    # Minimum connections
db_pool_max_size: int = 20   # Maximum connections
```

## Logging Configuration

Configure in `backend/config.py`:

```python
log_level: str = "INFO"              # DEBUG, INFO, WARNING, ERROR, CRITICAL
log_file: str = "logs/app.log"
log_max_bytes: int = 10 * 1024 * 1024   # 10MB per file
log_backup_count: int = 5                # Keep 5 rotated files
log_to_console: bool = True              # Also output to stdout
```

## GPU Configuration

### Select Specific GPUs

In `.env`:
```bash
NVIDIA_VISIBLE_DEVICES=0        # Use only GPU 0
NVIDIA_VISIBLE_DEVICES=0,1      # Use GPUs 0 and 1
NVIDIA_VISIBLE_DEVICES=all      # Use all GPUs (default)
```

### Disable GPU (CPU-only mode)

Remove the `runtime: nvidia` line from `docker-compose.yml`:

```yaml
meetmemo-backend:
  # runtime: nvidia   # Comment out this line
```

**Note**: CPU-only mode is significantly slower for transcription and diarization.

## Timezone Configuration

Set your local timezone offset:

```bash
TIMEZONE_OFFSET=+8     # GMT+8 (Asia/Singapore, Beijing)
TIMEZONE_OFFSET=-5     # GMT-5 (US Eastern)
TIMEZONE_OFFSET=0      # GMT (UTC)
```

This affects timestamps in generated files and logs.

## LLM Configuration

### OpenAI-Compatible APIs

MeetMemo works with any OpenAI-compatible API:

```bash
# Local LM Studio
LLM_API_URL=http://localhost:1234
LLM_MODEL_NAME=qwen2.5-14b-instruct
LLM_API_KEY=

# Ollama with OpenAI compatibility
LLM_API_URL=http://localhost:11434/v1
LLM_MODEL_NAME=llama3
LLM_API_KEY=

# OpenAI
LLM_API_URL=https://api.openai.com/v1
LLM_MODEL_NAME=gpt-4
LLM_API_KEY=sk-...
```

### Timeout Settings

Adjust LLM timeout in `backend/config.py`:

```python
llm_timeout: float = 60.0  # 60 seconds
```

## Port Configuration

### Using Environment Variables (Recommended)

Configure external ports via `.env` file:

```bash
HTTP_PORT=8080
HTTPS_PORT=8443
```

Then access via `https://localhost:8443`

This is the recommended approach as it keeps your configuration in one place and doesn't require editing `docker-compose.yml`.

### Manual Configuration

Alternatively, you can edit `docker-compose.yml` directly:

```yaml
nginx:
  ports:
    - "8080:80"      # HTTP (redirects to HTTPS)
    - "8443:443"     # HTTPS
```

**Note**: If both environment variables and manual configuration are present, environment variables take precedence.

## Nginx Configuration

SSL/TLS settings in `nginx/nginx.conf`:

```nginx
ssl_protocols TLSv1.2 TLSv1.3;
ssl_ciphers HIGH:!aNULL:!MD5;
client_max_body_size 500M;  # Max upload size
```

Proxy timeouts for long-running transcriptions:

```nginx
proxy_connect_timeout 600s;
proxy_send_timeout 600s;
proxy_read_timeout 600s;
```
