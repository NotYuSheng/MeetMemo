# MeetMemo

MeetMemo is an AI-powered meeting transcription application that combines cutting-edge technologies to provide accurate speech-to-text conversion, speaker identification (diarization), and intelligent summarization. Perfect for meetings, interviews, lectures, and any audio content requiring detailed transcription and analysis.

## Key Features

- **Audio Recording & Upload**: Record meetings directly in the browser or upload existing audio files
- **Advanced Speech Recognition**: Powered by OpenAI's Whisper for high-accuracy transcription  
- **Speaker Diarization**: Automatically identify and label different speakers using PyAnnote.audio
- **AI-Powered Summarization**: Generate concise summaries with key points and action items using LLMs
- **Real-time Processing**: Monitor transcription progress with live status updates
- **Speaker Management**: Edit and customize speaker names for better organization
- **Export Options**: Download transcripts and summaries as PDF or text files
- **HTTPS Support**: Secure SSL setup with auto-generated certificates
- **Dark/Light Mode**: Toggle between themes for comfortable viewing

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
   ```

5. **Build and run:**
   ```bash
   docker compose build
   docker compose up
   ```

6. **Access the application:**
   
   Open your browser and navigate to `https://localhost` or `http://localhost:3000/MeetMemo`

## Usage

### Basic Workflow
1. **Upload/Record**: Upload an audio file or record directly in the browser
2. **Transcribe**: Click "Start Transcription" to begin processing  
3. **Review**: View the diarized transcript with speaker labels
4. **Customize**: Edit speaker names for better identification
5. **Summarize**: Generate AI-powered summaries with key insights
6. **Export**: Download transcripts and summaries for future reference

### Advanced Features
- **Speaker Management**: Click speaker labels to rename them
- **Custom Prompts**: Use custom prompts for tailored summarization
- **Job Management**: Track multiple transcription jobs
- **Export Options**: Multiple format support for transcripts and summaries

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

## Security

- All audio processing happens locally except LLM summarization
- Files stored in secure Docker volumes
- HTTPS support with auto-generated SSL certificates
- No authentication required for local deployment

## License

This project is licensed under the MIT License.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Support

- **Issues**: [GitHub Issues](https://github.com/notyusheng/MeetMemo/issues)
- **Discussions**: [GitHub Discussions](https://github.com/notyusheng/MeetMemo/discussions)
