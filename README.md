# Pyannote-whisper

Run ASR and speaker diarization based on `whisper` and `pyannote.audio`.

We are using Whisper's `large-v3` model for ASR.

## Installation

1. Installing the required tools via `setup.py`

```python
pip install .
```

## Creating your personal HuggingFace token:

1.  Accept the Model License on Hugging Face.
    Before you can download the pipeline, you must visit the model pages and click “Accept” on each gated license:

        Speaker Diarization: https://huggingface.co/pyannote/speaker-diarization

        Segmentation (required by diarization): https://huggingface.co/pyannote/segmentation

2.  Create a Hugging Face Access Token

    Go to your tokens page: https://huggingface.co/settings/tokens

    Click “New token”, choose a Read scope, and copy the generated token. Replace the "your-token" with the token you had just copied.

## Setting up env file and target audio file

1.  Create a `.env` file in the `config` folder. Follow the example given in `.env.example`.

2.  Change `USE_AUTH_TOKEN` and `AUDIO_FILE_NAME` to your HF token key and target audio file respectively.

## Running the script

After all of the above steps are completed, proceed to run the `main.py` in terminal.

```python
python main.py
```
