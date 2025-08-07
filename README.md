# MeetMemo

MeetMemo is designed to record or upload meeting audio, producing diarized transcripts and concise summaries by using LLMs.
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
    - Click "New token", choose the `Read` scope, and copy the generated token.

4.  **Set up your environment file:**

    - Create a `.env` file in the root directory by copying the example:

      ```bash
      cp example.env .env
      ```

    - Open the `.env` file and update the `HF_TOKEN` variable with your newly generated Hugging Face token:

      ```env
      HF_TOKEN=your_huggingface_token_here
      ```
    - Update the `LLM_API_URL` and `LLM_MODEL_NAME` variables to allow the backend to communicate with the LLM model you are using for summarisation of the transcripts.
        ```env
        LLM_API_URL=your_llm_url_here
        LLM_MODEL_NAME=your_llm_model_name_here
        ```

5.  **Build and run the application:**

    ```bash
    docker compose build
    docker compose up
    ```

    This will build the Docker images for the backend and frontend and start the services.

## Usage

Once the application is running, you can access the app at `http://localhost:3000/MeetMemo`. 

## License

This project is licensed under the MIT License.