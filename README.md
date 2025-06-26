# MeetMemo

Record or upload meeting audio and generate diarised text. Built using FastAPI, Whisper and PyAnnote.

We are using Whisper's `turbo` model by defualt.

## Creating your personal HuggingFace token:

1.  Accept the Model License on Hugging Face.

    Before you can download the pipeline, you must visit the model pages and fill in the fields **(You can just put anything you want in the fields)** on each gated license:

        Speaker Diarization: https://huggingface.co/pyannote/speaker-diarization

        Segmentation (required by diarization): https://huggingface.co/pyannote/segmentation

        Segmentation 3.0 (required by diarization): https://huggingface.co/pyannote/segmentation-3.0

2.  Create a Hugging Face Access Token

    Go to your tokens page: https://huggingface.co/settings/tokens

    Click “New token”, choose the Read scope, and copy the generated token.

## Setting up env file

1. Create a `.env` file in the root directory by copying the example

2. Open the `.env` file and update the `USE_AUTH_TOKEN` variable with your Hugging Face token:

   ```env
   USE_AUTH_TOKEN=your_huggingface_token_here
   ```

3. Update the `LLM_API_URL` and `LLM_MODEL_NAME` variable to allow the backend to communicate with the model you are using for summarisation of the transcripts.

4. This `.env` file will be automatically loaded by Docker via `docker-compose.yml`, so **no code changes are required**.

## Running the script

After all of the above steps are completed, proceed to run the docker compose file in terminal.

```bash
docker compose up -d
```
