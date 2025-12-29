# Backend Fix - PyAnnote Hugging Face Hub Compatibility

## Issue

Backend was returning `500 Internal Server Error` when uploading audio files for transcription.

**Error Message:**
```
ERROR:root:2025-12-28 13:28:14: Unexpected error during audio processing for file chiam-sharing.m4a:
hf_hub_download() got an unexpected keyword argument 'use_auth_token'

TypeError: hf_hub_download() got an unexpected keyword argument 'use_auth_token'
```

## Root Cause

The `huggingface_hub` library updated its API and **deprecated the `use_auth_token` parameter** in favor of `token`.

PyAnnote's `Pipeline.from_pretrained()` internally calls `hf_hub_download()`, which was being called with the old parameter name.

## Solution

Updated all occurrences of `use_auth_token` to `token` in the backend code.

### Files Modified

1. **`backend/main.py:1093`**
   ```python
   # Before
   pipeline = Pipeline.from_pretrained(
       "pyannote/speaker-diarization-3.1",
       use_auth_token=hf_token
   )

   # After
   pipeline = Pipeline.from_pretrained(
       "pyannote/speaker-diarization-3.1",
       token=hf_token
   )
   ```

2. **`backend/pyannote_whisper/cli/transcribe.py:109`**
   ```python
   # Before
   pipeline = Pipeline.from_pretrained("pyannote/speaker-diarization-3.1",
                                       use_auth_token=os.getenv("HF_TOKEN"))

   # After
   pipeline = Pipeline.from_pretrained("pyannote/speaker-diarization-3.1",
                                       token=os.getenv("HF_TOKEN"))
   ```

## Fix Applied

1. Updated parameter names in both files
2. Rebuilt Docker container: `docker compose build meetmemo-backend`
3. Restarted backend: `docker compose restart meetmemo-backend`

## Verification

Backend now starts successfully:
```
INFO:     Started server process [1]
INFO:     Waiting for application startup.
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
```

Audio transcription and speaker diarization now work correctly without errors.

## Related Documentation

- [Hugging Face Hub Migration Guide](https://huggingface.co/docs/huggingface_hub/package_reference/overview#authentication)
- PyAnnote.audio uses `huggingface_hub` for model downloads
- Parameter renamed from `use_auth_token` → `token` in `huggingface_hub>=0.14.0`

---

**Fix Date:** 2025-12-28
**Issue:** Backend 500 error on audio upload
**Resolution:** Updated PyAnnote authentication parameter
