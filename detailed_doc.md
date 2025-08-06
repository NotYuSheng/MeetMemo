# MeetMemo - AI-Powered Meeting Transcription & Analysis

MeetMemo is a comprehensive meeting transcription application that combines cutting-edge AI technologies to provide accurate speech-to-text conversion, speaker identification (diarization), and intelligent summarization. Perfect for meetings, interviews, lectures, and any audio content requiring detailed transcription and analysis.

## 🚀 Key Features

### Core Functionality
- **Audio Upload & Recording**: Upload existing audio files or record new meetings directly in the browser
- **Advanced Speech Recognition**: Powered by OpenAI's Whisper for high-accuracy transcription
- **Speaker Diarization**: Automatically identify and label different speakers using PyAnnote.audio
- **Real-time Processing**: Watch your transcription progress in real-time
- **Multiple Audio Formats**: Support for various audio formats (MP3, WAV, M4A, etc.)

### Transcription Management
- **Job Management**: Track multiple transcription jobs with unique UUIDs
- **Status Monitoring**: Real-time status updates (processing, completed, error)
- **Speaker Customization**: Edit and rename speaker labels for better organization
- **Export Options**: Download transcripts and summaries as PDF or text files
- **Persistent Storage**: All transcriptions are saved and can be accessed later

### AI-Powered Analysis
- **Intelligent Summarization**: Generate concise summaries with key points, action items, and next steps
- **Custom Prompts**: Use custom prompts for tailored summarization
- **Participant Identification**: Automatically extract and list meeting participants
- **Action Item Extraction**: Identify and highlight actionable tasks from discussions

### User Experience
- **Modern Web Interface**: Clean, responsive React-based frontend
- **Dark/Light Mode**: Toggle between themes for comfortable viewing
- **Real-time Updates**: Live progress tracking and status updates
- **Mobile Friendly**: Works seamlessly across desktop and mobile devices

## 🏗️ Architecture

MeetMemo consists of two main components:

### Backend (FastAPI)
- **API Server**: RESTful API built with FastAPI
- **Audio Processing**: Whisper integration for speech-to-text
- **Speaker Diarization**: PyAnnote.audio pipeline for speaker identification
- **LLM Integration**: External LLM connectivity for summarization
- **File Management**: Secure audio file storage and processing
- **Database**: CSV-based job tracking and metadata storage

### Frontend (React)
- **User Interface**: Modern React application with responsive design
- **Audio Recording**: Browser-based audio recording capabilities
- **File Upload**: Drag-and-drop file upload interface
- **Real-time Updates**: Live status monitoring and progress tracking
- **Export Features**: PDF generation and download functionality

## 📋 Prerequisites

Before setting up MeetMemo, ensure you have the following:

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

## 🛠️ Installation & Setup

### Step 1: Clone the Repository
```bash
git clone https://github.com/notyusheng/MeetMemo.git
cd MeetMemo
```

### Step 2: Hugging Face Model Access
Before downloading models, you must accept the licenses for the required PyAnnote models:

1. **Create a Hugging Face account** at [huggingface.co](https://huggingface.co)

2. **Accept model licenses** by visiting these pages and filling out the required forms:
   - [Speaker Diarization Model](https://huggingface.co/pyannote/speaker-diarization)
   - [Segmentation Model](https://huggingface.co/pyannote/segmentation)
   - [Segmentation 3.0 Model](https://huggingface.co/pyannote/segmentation-3.0)

3. **Generate an access token**:
   - Go to [Hugging Face tokens page](https://huggingface.co/settings/tokens)
   - Click "New token"
   - Select `Read` scope
   - Copy the generated token

### Step 3: Environment Configuration
1. **Create environment file**:
   ```bash
   cp example.env .env
   ```

2. **Configure the `.env` file**:
   ```env
   # Hugging Face authentication token
   USE_AUTH_TOKEN=your_huggingface_token_here
   
   # LLM API configuration for summarization
   LLM_API_URL=your_llm_url
   LLM_MODEL_NAME=your_llm_name
   ```

### Step 4: Build and Launch
```bash
docker compose build

docker compose up
```

This command will:
- Build the backend and frontend Docker images
- Download required AI models (first transcription may take 10-15 minutes)
- Start all services
- Set up persistent volumes for data storage

## 🎯 Usage Guide

### Accessing the Application
Once running, access MeetMemo at: **http://localhost:3000/MeetMemo**

### Basic Workflow

#### 1. Upload or Record Audio
- **Upload**: Click the `Upload Audio File` button and select your audio file
- **Record**: Click the `Start Recording` button to start recording directly in the browser
- **Starting the transcription**: Click the `Start Transcription` button to start the transcription process

#### 2. Monitor Processing
- Obtain status updates to view when the transcription process is still ongoing or has been completed

#### 3. Review Transcript
- View the diarized transcript with speaker labels
- Edit speaker names for better identification
- Navigate through the conversation timeline through appended timestamps

#### 4. Generate Summary
- Navigate to the `Summary` tab to generate an AI-powered summary
- Review key points, action items, and next steps
- Use custom user-defined prompts for specific analysis needs

#### 5. Export Results
- Download transcript as .txt file
- Save summaries for future reference

### Advanced Features

#### Speaker Management
- Click on any speaker label to rename them
- Changes apply to the entire transcript
- Speaker names are saved for future reference

#### Custom Summarization
- Use the prompt input to specify custom analysis requirements
- Examples: "Focus on technical decisions" or "Extract only action items"
- System prompts can modify the AI's analysis style

#### Job Management
- View all previous transcription jobs
- Switch between different meetings
- Delete completed jobs to free up space

## 🔧 API Reference

MeetMemo provides a comprehensive REST API for programmatic access:

### Job Management
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/jobs` | List all transcription jobs |
| POST | `/jobs` | Create new transcription job |
| DELETE | `/jobs/{uuid}` | Delete specific job |

### Job Information
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/jobs/{uuid}/filename` | Get job filename |
| GET | `/jobs/{uuid}/status` | Get job processing status |
| GET | `/jobs/{uuid}/transcript` | Get full transcript |

### Analysis & Export
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/jobs/{uuid}/summarise` | Generate AI summary |
| PATCH | `/jobs/{uuid}/speakers` | Update speaker names |
| PATCH | `/jobs/{uuid}/rename` | Rename job |

### System
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/logs` | Application logs |

## 🔧 Configuration Options

### Model Selection
- **Whisper Models**: Choose from tiny, base, small, medium, large, turbo(default)
- **Performance vs Accuracy**: Larger models provide better accuracy but slower processing
- **Language Support**: Automatic language detection or specify target language by using **(.en models)**

### Processing Settings
- **GPU Acceleration**: Automatically uses NVIDIA GPU when available
- **Batch Processing**: Handle multiple files simultaneously

### LLM Integration for summary
- **Custom Endpoints**: Configure your own LLM deployment
- **Prompt Engineering**: Customize system and user prompts

## 🐛 Troubleshooting

### Common Issues

#### GPU Not Detected
```bash
# Check NVIDIA Docker runtime
docker run --rm --gpus all nvidia/cuda:11.0-base nvidia-smi
```
#### Whisper Models Download Fails
- Verify Hugging Face token is correct and authenticated
- Ensure model licenses are accepted
- Check internet connectivity

#### Audio Upload Issues
- Verify file format is supported (Most audio files should be supported but to be safe, use **.wav** files)
- Ensure sufficient disk space

### Performance Optimization

#### For Faster Speed
- Use smaller Whisper models (base, small)
- Ensure GPU is being used and GPU acceleration is working

#### For Higher Accuracy
- Use larger Whisper models (medium, large)
- Provide high-quality audio input
- Specify the correct language **(.en)** if need be

## 🔒 Security Considerations

- **File Storage**: Audio files are stored locally in Docker volumes
- **API Access**: No authentication required for local deployment
- **Data Privacy**: All processing happens locally except LLM summarization
- **Network Security**: Only necessary ports are exposed (3000 & 8000)

## 📚 Development

### Frontend Development
```bash
cd frontend
npm install
npm start  # Development server on port 3000
npm test   # Run test suite
npm run build  # Production build
```

### Backend Development
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### Code Quality
- **Linting**: ESLint for JavaScript, Ruff for Python
- **Testing**: Jest for frontend, pytest for backend
- **CI/CD**: GitHub Actions for automated testing

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request
6. Merge into main branch after code is **peer-reviewed**.

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/notyusheng/MeetMemo/issues)
- **Discussions**: [GitHub Discussions](https://github.com/notyusheng/MeetMemo/discussions)
- **Documentation**: [Wiki](https://github.com/notyusheng/MeetMemo/wiki)

---

**MeetMemo** - Transform your meetings into actionable insights with AI-powered transcription and analysis.