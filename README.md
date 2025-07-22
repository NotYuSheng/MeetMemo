# MeetMemo

MeetMemo is a powerful application designed to record or upload meeting audio and generate a diarized transcript. This tool is perfect for anyone who needs to keep accurate records of their meetings, interviews, or lectures. By leveraging state-of-the-art technologies like FastAPI, Whisper, and PyAnnote, MeetMemo provides high-quality transcriptions with speaker identification.

## Features

- **Audio Upload & Recording:** Easily upload existing audio files or record new ones directly in the application.
- **Diarization:** Automatically identify and label different speakers in the audio.
- **Transcription:** Generate accurate text transcripts of your meetings.
- **Summarization:** Get a concise summary of the key points, decisions, and action items from your transcript.
- **API Endpoints:** A comprehensive set of API endpoints to manage your transcription jobs.
- **Dockerized:** The entire application is containerized for easy setup and deployment.

## Architecture

MeetMemo consists of two main components:

- **Backend:** A FastAPI application that handles audio processing, transcription, and diarization. It uses Whisper for speech-to-text and PyAnnote for speaker diarization. It also connects to an externally-hosted LLM for summarisation (`llm_calling`).
- **Frontend:** A React application that provides a user-friendly interface for uploading audio files, viewing transcripts, and managing jobs.

The application is designed to be run with Docker Compose, which orchestrates the backend and frontend services.

## Prerequisites

Before you begin, ensure you have the following installed:

- **Docker:** [Get Docker](https://docs.docker.com/get-docker/)
- **Docker Compose:** [Get Docker Compose](https://docs.docker.com/compose/install/)
- **NVIDIA GPU:** The backend service is configured to use a GPU for faster processing.
- **Hugging Face Account:** You'll need a Hugging Face account and an access token to use the PyAnnote models.

## Installation and Setup

1.  **Clone the repository:**

    ```bash
    git clone https://github.com/notyusheng/MeetMemo.git
    cd MeetMemo
    ```

2.  **Accept the Model License on Hugging Face.**

    Before you can download the pipeline, you must visit the model pages and fill in the fields (You can just put anything you want in the fields) on each gated license:

    Speaker Diarization: https://huggingface.co/pyannote/speaker-diarization

    Segmentation (required by diarization): https://huggingface.co/pyannote/segmentation

    Segmentation 3.0 (required by diarization): https://huggingface.co/pyannote/segmentation-3.0

3.  **Create a Hugging Face Access Token:**

    - Go to your Hugging Face [tokens page](https://huggingface.co/settings/tokens).
    - Click "New token", choose the `read` scope, and copy the generated token.

4.  **Set up your environment file:**

    - Create a `.env` file in the root directory by copying the example:

      ```bash
      cp example.env .env
      ```

    - Open the `.env` file and update the `USE_AUTH_TOKEN` variable with your Hugging Face token:

      ```env
      USE_AUTH_TOKEN=your_huggingface_token_here
      ```
    - Update the `LLM_API_URL` and `LLM_MODEL_NAME` variables to allow the backend to communicate with the model you are using for summarisation of the transcripts.

5.  **Build and run the application:**

    ```bash
    docker compose up --build
    ```

    This will build the Docker images for the backend and frontend and start the services.

## Usage

Once the application is running, you can access the frontend at `http://localhost:3000/MeetMemo`. 

From there, you can upload an audio file and see the transcription and diarization in real-time.

## API Endpoints

The backend provides the following API endpoints:

| Method | Endpoint                     | Description                                      |
| ------ | ---------------------------- | ------------------------------------------------ |
| GET    | `/jobs`                      | Get a list of all transcription jobs.            |
| POST   | `/jobs`                      | Create a new transcription job.                  |
| DELETE | `/jobs/{uuid}`               | Delete a job.                                    |
| GET    | `/jobs/{uuid}/filename`      | Get the filename for a job.                      |
| GET    | `/jobs/{uuid}/status`        | Get the status of a job.                         |
| GET    | `/jobs/{uuid}/transcript`    | Get the transcript for a job.                    |
| POST   | `/jobs/{uuid}/summarise`     | Summarize the transcript.                        |
| GET    | `/logs`                      | Get application logs.                            |
| GET    | `/health`                    | Health check endpoint.                           |

## Frontend

The frontend is a React application built with `create-react-app`. It uses `react-router-dom` for routing and `lucide-react` for icons.

### Available Scripts

In the `frontend` directory, you can run the following scripts:

- `npm start`: Runs the app in development mode.
- `npm test`: Launches the test runner in interactive watch mode.
- `npm run build`: Builds the app for production to the `build` folder.
- `npm run eject`: Removes the single dependency and copies all the configuration files and transitive dependencies (webpack, Babel, ESLint, etc.) right into your project.

### Linting

The project uses `stylelint` for CSS linting. You can run the following commands in the `frontend` directory:

- `npm run lint:css`: Lints the CSS files.
- `npm run lint:css:fix`: Fixes the linting errors.

## License

This project is licensed under the MIT License.