# Pyannote-whisper

Run ASR and speaker diarization based on `whisper` and `pyannote.audio`.

## Installation
1. Installing the `requirements.txt` file
```python
pip install -r requirements.txt
```

2. Set up remaining tools via `setup.py`
```py
pip install .
```

## Creating your personal HuggingFace token:
1. Accept the Model License on Hugging Face.
Before you can download the pipeline, you must visit the model pages and click “Accept” on each gated license:

    Speaker Diarization: https://huggingface.co/pyannote/speaker-diarization 

    Segmentation (required by diarization): https://huggingface.co/pyannote/segmentation


2. Create a Hugging Face Access Token

    Go to your tokens page: https://huggingface.co/settings/tokens


    Click “New token”, choose a Read scope, and copy the generated token. Replace the "your-token" with the token you had just copied.

3. Create a `.env` file in the `config` folder. Follow the example given.