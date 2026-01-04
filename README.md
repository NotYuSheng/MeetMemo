# MeetMemo

A meeting transcription app that runs entirely offline. It converts speech to text, separates speakers (diarization), and generates summaries of discussions. You can also configure custom prompts and connect it to your local LLM server. Use it for meetings, interviews, lectures, or any audio where you need a clear transcript and summary.

## Demo

<div align="center">

![MeetMemo Demo](https://github.com/NotYuSheng/MeetMemo/blob/main/sample-files/MeetMemo-DEMO_v2.0.0.gif) <br>

</div>

### Sample Files

The `sample-files/` directory contains example outputs to showcase MeetMemo's capabilities:

- **`GenAI Week - AI x SaaS.wav`** - Sample audio file for testing (37MB, ~1 hour)
- **`genai-week---ai-x-saas_transcript_2025-08-31.json`** - Complete diarized transcript with speaker identification
- **`genai-week---ai-x-saas_summary_2025-08-31.pdf`** - Professional PDF summary with key insights and action items
- **`genai-week---ai-x-saas_summary_2025-08-31.markdown`** - Markdown version of the AI-generated summary
- **`MeetMemo-DEMO_v2.0.0.gif`** - Application demonstration GIF (v2.0.0)
- **`MeetMemo_Demo_v1.0.0.gif`** - Legacy demonstration GIF (v1.0.0)

These files demonstrate the complete workflow from audio upload to final deliverables, showing the quality and format of MeetMemo's output.

## Key Features

- **Audio Recording & Upload**: Record meetings directly in the browser or upload existing audio files (MP3, WAV, M4A, FLAC, etc.)
- **Advanced Speech Recognition**: Powered by OpenAI's Whisper for high-accuracy transcription in 99+ languages
- **Speaker Diarization**: Automatically identify and label different speakers using PyAnnote.audio v3.1
- **AI-Powered Summarization**: Generate concise summaries with key points, action items, and next steps using custom LLMs
- **Real-time Processing**: Monitor transcription progress with live status updates and job management
- **Speaker Management**: Edit and customize speaker names with persistent storage across sessions
- **Export Options**: Download transcripts as TXT/PDF and summaries with professional formatting
- **HTTPS Support**: Secure SSL setup with auto-generated certificates for production deployment
- **Dark/Light Mode**: Toggle between themes for comfortable viewing with responsive design
- **Multi-language Support**: Automatic language detection or specify target language for better accuracy

## Architecture

MeetMemo is a containerized application with three main services:

- **Backend**: FastAPI server with Whisper, PyAnnote, and LLM integration
- **Frontend**: React 19 application with modern UI components
- **Nginx**: Reverse proxy with SSL termination and request routing

## Prerequisites

### Required Software
- **Docker**: [Install Docker](https://docs.docker.com/get-docker/)
- **Docker Compose**: [Install Docker Compose](https://docs.docker.com/compose/install/)

### Hardware Requirements
- **NVIDIA GPU**: Required for optimal performance (CUDA-compatible)
- **RAM**: Minimum 8GB recommended (16GB+ for large files)
- **Storage**: At least 10GB free space for models and audio files

### External Services
- **Hugging Face Account**: Required for PyAnnote model access
- **LLM API**: External LLM service for summarization (OpenAI, Anthropic, etc.)

## Quick Start

1. **Clone the repository:**
   ```bash
   git clone https://github.com/notyusheng/MeetMemo.git
   cd MeetMemo
   ```

2. **Accept Hugging Face model licenses:**
   
   Visit these pages and accept the licenses (fill in any required fields):
   - [Speaker Diarization 3.1](https://huggingface.co/pyannote/speaker-diarization-3.1)
   - [Segmentation 3.0](https://huggingface.co/pyannote/segmentation-3.0)

3. **Create Hugging Face access token:**
   - Go to [Hugging Face tokens page](https://huggingface.co/settings/tokens)
   - Click "New token", choose `Read` scope, and copy the token

4. **Set up environment file:**
   ```bash
   cp example.env .env
   ```
   
   Edit `.env` and update the required variables:
   ```env
   HF_TOKEN=your_huggingface_token_here
   LLM_API_URL=your_llm_url_here
   LLM_MODEL_NAME=your_llm_model_name_here
   LLM_API_KEY=your_llm_api_key_here
   TIMEZONE_OFFSET=+8
   ```

5. **Build and run:**
   ```bash
   docker compose build
   docker compose up
   ```

6. **Access the application:**
   
   Open your browser and navigate to `https://localhost`

## Usage

### Basic Workflow
1. **Upload/Record**: Upload an audio file or record directly in the browser
2. **Transcribe**: Click "Start Transcription" to begin processing  
3. **Review**: View the diarized transcript with speaker labels
4. **Customize**: Edit speaker names for better identification
5. **Summarize**: Generate AI-powered summaries with key insights
6. **Export**: Download transcripts and summaries for future reference

### Advanced Features
- **Speaker Management**: Click speaker labels to rename them with persistent storage
- **Custom Prompts**: Use custom prompts for tailored summarization (technical analysis, action items only, etc.)
- **Job Management**: Track multiple transcription jobs with unique UUIDs and status monitoring
- **Export Options**: Multiple format support (TXT, PDF) for transcripts and summaries
- **Batch Processing**: Handle multiple audio files simultaneously
- **Language Selection**: Choose specific Whisper models for target languages (.en for English-only)
- **Quality Control**: Automatic audio preprocessing (mono conversion, 16kHz resampling)
- **Progress Tracking**: Real-time status updates with detailed processing logs

## Development

### Frontend Development
```bash
cd frontend
npm install
npm start          # Start development server
npm run build      # Build for production
npm test           # Run tests
```

### Backend Development  
```bash
cd backend
pip install -r requirements.txt
python main.py     # Run FastAPI server directly
```

### Docker Development
```bash
docker compose build                    # Build containers
docker compose up -d                   # Run in detached mode
docker compose logs -f meetmemo-backend # View backend logs
docker compose logs -f meetmemo-frontend # View frontend logs
docker compose down                     # Stop all services
docker compose restart meetmemo-backend # Restart specific service
```

### Linting and Testing
```bash
# Frontend
cd frontend
npm run lint:css                        # Lint CSS files  
npm run lint:css:fix                    # Fix CSS linting issues

# Backend  
cd backend
ruff check                              # Check Python code style
ruff format                             # Format Python code
```

## Troubleshooting

### Common Issues
- **GPU not detected**: Verify NVIDIA Docker runtime is installed
- **Model download fails**: Check Hugging Face token and license acceptance
- **Audio upload issues**: Ensure supported file format (WAV recommended)
- **PyTorch Lightning warning**: If you see checkpoint upgrade warnings, run the suggested upgrade command in the container

### Performance Tips
- **Faster processing**: Use smaller Whisper models (base, small)
- **Higher accuracy**: Use larger models (medium, large) with quality audio input
- **GPU optimization**: Ensure NVIDIA drivers and Docker GPU support are properly configured
- **Memory management**: Restart backend service after processing large files to free memory
- **Audio quality**: Use high-quality audio input (16kHz+) for better diarization results

## API Reference

MeetMemo provides a comprehensive REST API for programmatic access:

### Core Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Health check and API status |
| POST | `/upload` | Upload audio file for transcription |
| GET | `/jobs` | List all transcription jobs |
| DELETE | `/jobs/{uuid}` | Delete specific job |
| GET | `/jobs/{uuid}/status` | Get job processing status |
| GET | `/jobs/{uuid}/transcript` | Get diarized transcript |
| POST | `/jobs/{uuid}/summarise` | Generate AI summary |
| PATCH | `/jobs/{uuid}/speakers` | Update speaker names |
| GET | `/logs` | View application logs |

### WebSocket Events
- Real-time job status updates
- Progress notifications for long-running tasks
- Error handling and retry mechanisms

## Configuration

### Environment Variables
| Variable | Description | Default/Example |
|----------|-------------|----------------|
| `HF_TOKEN` | Hugging Face API token for model access | Required |
| `LLM_API_URL` | External LLM service endpoint | `http://localhost:8000/v1/chat/completions` |
| `LLM_MODEL_NAME` | LLM model identifier | `qwen2.5-32b-instruct` |
| `LLM_API_KEY` | Authentication key for LLM service | Optional |
| `TIMEZONE_OFFSET` | Timezone offset in hours for timestamps | `+8` (GMT+8/Singapore) |

### Timezone Configuration
MeetMemo uses a configurable timezone for all timestamps in exported PDFs and Markdown files. The timezone is set via the `TIMEZONE_OFFSET` environment variable in your `.env` file.

**Default**: Singapore Time (GMT+8)

**To change the timezone:**
1. Edit your `.env` file
2. Update the `TIMEZONE_OFFSET` value with your desired offset:
   - UTC: `TIMEZONE_OFFSET=0`
   - EST (GMT-5): `TIMEZONE_OFFSET=-5`
   - JST (GMT+9): `TIMEZONE_OFFSET=+9`
   - GMT+8 (Singapore/Default): `TIMEZONE_OFFSET=+8`
3. Restart the backend service: `docker compose restart meetmemo-backend`

All export functions (PDF and Markdown) will use this configured timezone when generating timestamps.

### Whisper Model Selection
Available models (size/speed trade-off):
- `tiny` - Fastest, least accurate (~1GB VRAM)
- `base` - Good balance (~1GB VRAM) 
- `small` - Better accuracy (~2GB VRAM)
- `medium` - High accuracy (~5GB VRAM)
- `large` - Best accuracy (~10GB VRAM)
- `turbo` - Latest optimized model (default)

### Docker Volumes
| Volume | Purpose | Location |
|--------|---------|----------|
| `audiofiles/` | Uploaded audio files | `/app/audiofiles` |
| `transcripts/` | Generated transcriptions | `/app/transcripts` |
| `summary/` | AI-generated summaries | `/app/summary` |
| `logs/` | Application logs | `/app/logs` |
| `whisper_cache/` | Model cache | `/app/whisper_cache` |

## Security

- **Local Processing**: All audio transcription and diarization happens locally
- **Data Privacy**: Audio files never leave your infrastructure except for LLM summarization
- **Secure Storage**: Files stored in Docker volumes with proper permissions
- **HTTPS Support**: SSL certificates auto-generated for secure connections
- **No Authentication**: Designed for local deployment - add authentication layer for production
- **API Security**: CORS configured for frontend-backend communication
- **File Validation**: Audio file type and size validation on upload

## Deployment

### HTTPS Requirement

**HTTPS is required for the recording feature to work** (browsers require secure context for microphone access). For local development on `localhost`, HTTP works fine. For production deployments, choose one of the options below.

### Deployment Options

#### Option 1: Local Development (HTTP)
For local testing, HTTP works on localhost:
```bash
docker compose up --build
```
Access at `http://localhost` - recording will work because browsers allow microphone access on localhost.

#### Option 2: Cloudflare Tunnel (Easiest for Production)
Free HTTPS with zero certificate management:

```bash
# Install cloudflared
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o cloudflared
chmod +x cloudflared
sudo mv cloudflared /usr/local/bin/

# Authenticate and create tunnel
cloudflared tunnel login
cloudflared tunnel create meetmemo

# Configure tunnel (~/.cloudflared/config.yml)
tunnel: <your-tunnel-id>
credentials-file: /home/user/.cloudflared/<tunnel-id>.json
ingress:
  - hostname: meetmemo.yourdomain.com
    service: http://localhost:80
  - service: http_status:404

# Run tunnel
cloudflared tunnel run meetmemo
```

#### Option 3: Tailscale (Private Network)
Perfect for internal/team use:

```bash
# Install Tailscale
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up

# Enable HTTPS serving
tailscale serve https / proxy http://127.0.0.1:80
```

Access via `https://<machine-name>.tail-scale.ts.net` with automatic HTTPS.

#### Option 4: Caddy (Auto-HTTPS)
Simple production deployment with automatic Let's Encrypt certificates:

```bash
# Install Caddy
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install caddy

# Create Caddyfile
sudo nano /etc/caddy/Caddyfile
```

Add to Caddyfile:
```
meetmemo.yourdomain.com {
    reverse_proxy localhost:80
}
```

```bash
sudo systemctl restart caddy
```

#### Option 5: Nginx + Let's Encrypt
Traditional setup for existing nginx infrastructure:

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx

# Get certificate
sudo certbot --nginx -d meetmemo.yourdomain.com

# Update docker-compose.yml
# Change frontend port to avoid conflict
ports:
  - "8080:80"
```

Certbot automatically configures nginx and handles certificate renewal.

#### Option 6: Self-Signed Certificate (Testing Only)
⚠️ Not recommended for production - browsers will show warnings:

```bash
# Generate certificate
mkdir -p nginx/ssl
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout nginx/ssl/nginx-selfsigned.key \
  -out nginx/ssl/nginx-selfsigned.crt \
  -subj "/C=US/ST=State/L=City/O=MeetMemo/CN=localhost"

# Update nginx config and docker-compose to use HTTPS
```

### Production Considerations
- **SSL Certificates**: Use proper SSL certificates in production (not self-signed)
- **Authentication**: Add authentication layer for multi-user deployments
- **Resource Limits**: Configure appropriate memory and CPU limits for containers
- **Monitoring**: Set up logging and monitoring for production workloads
- **Backup**: Regular backup of transcription data and speaker mappings
- **Firewall**: Configure firewall rules appropriately based on your HTTPS option

### Cloud Deployment
- Ensure cloud instance has GPU support for optimal performance
- Configure persistent volumes for data retention
- Set up load balancing if scaling horizontally

### Deployment Checklist
Before deploying to production:
- [ ] Choose and configure HTTPS option above
- [ ] Set strong `POSTGRES_PASSWORD` in `.env`
- [ ] Configure `HF_TOKEN` for speaker diarization
- [ ] Set up `LLM_API_URL` and `LLM_MODEL_NAME`
- [ ] Test recording feature works with HTTPS
- [ ] Set up backup for PostgreSQL data volume
- [ ] Configure firewall rules as needed
- [ ] Set up log rotation for application logs

## License

This project is licensed under the MIT License.
