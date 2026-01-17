# Troubleshooting Guide

Common issues and solutions for MeetMemo.

## Microphone Recording Issues

### Recording Button Disabled

**Symptom:** Cannot click the record button in the browser.

**Cause:** Browser requires HTTPS for microphone access.

**Solution:**
- ✅ Access via `https://localhost` (self-signed cert is fine)
- ✅ Accept the browser certificate warning
- ❌ Don't use `http://localhost` (recording won't work)

### Microphone Permission Denied

**Symptom:** Browser shows "Permission denied" for microphone.

**Solution:**
1. Check browser permissions for the site
2. In Chrome: Click the lock icon → Site settings → Microphone → Allow
3. In Firefox: Click the lock icon → Permissions → Use the Microphone → Allow
4. Reload the page

## GPU and CUDA Issues

### GPU Not Detected

**Symptom:** Transcription is very slow, logs show CPU usage.

**Check:**
```bash
# On host machine
nvidia-smi

# Inside container
docker exec meetmemo-backend nvidia-smi
```

**Solutions:**

1. **Install NVIDIA Container Toolkit:**
```bash
# Ubuntu/Debian
distribution=$(. /etc/os-release;echo $ID$VERSION_ID)
curl -s -L https://nvidia.github.io/nvidia-docker/gpgkey | sudo apt-key add -
curl -s -L https://nvidia.github.io/nvidia-docker/$distribution/nvidia-docker.list | sudo tee /etc/apt/sources.list.d/nvidia-docker.list
sudo apt-get update && sudo apt-get install -y nvidia-container-toolkit
sudo systemctl restart docker
```

2. **Verify `runtime: nvidia` in docker-compose.yml:**
```yaml
meetmemo-backend:
  runtime: nvidia  # This line must be present
```

3. **Restart containers:**
```bash
docker compose down
docker compose up -d
```

### CUDA Out of Memory

**Symptom:** Error: `CUDA out of memory`

**Solutions:**

1. **Use smaller Whisper model** (edit `backend/config.py`):
```python
whisper_model_name: str = "base"  # Instead of "turbo"
```

2. **Limit GPU memory per container:**
```yaml
meetmemo-backend:
  deploy:
    resources:
      reservations:
        devices:
          - capabilities: [gpu]
            device_ids: ['0']
            options:
              memory: 4GB  # Limit to 4GB
```

3. **Process one file at a time** (close other GPU applications)

## Model Download Issues

### Whisper Model Download Fails

**Symptom:** Error downloading Whisper model.

**Solution:**
```bash
# Pre-download models manually
docker exec meetmemo-backend python -c "import whisper; whisper.load_model('turbo')"
```

### PyAnnote Model Access Denied

**Symptom:** `401 Unauthorized` or `Access denied` for PyAnnote models.

**Causes:**
1. Invalid `HF_TOKEN`
2. Haven't accepted model licenses

**Solutions:**

1. **Verify HF_TOKEN:**
```bash
# Check .env file
cat .env | grep HF_TOKEN
```

2. **Accept model licenses:**
   - Visit https://huggingface.co/pyannote/speaker-diarization-3.1
   - Click "Agree and access repository"
   - Visit https://huggingface.co/pyannote/segmentation-3.0
   - Click "Agree and access repository"

3. **Create new token with correct permissions:**
   - Go to https://huggingface.co/settings/tokens
   - Create token with "Read" access
   - Update `HF_TOKEN` in `.env`
   - Restart: `docker compose restart meetmemo-backend`

## Container Issues

### Container Won't Start

**Check logs:**
```bash
docker compose logs meetmemo-backend
docker compose logs meetmemo-frontend
docker compose logs postgres
```

**Common fixes:**

1. **Rebuild containers:**
```bash
docker compose down
docker compose build --no-cache
docker compose up -d
```

2. **Check environment variables:**
```bash
docker compose config
```

3. **Verify ports not in use:**
```bash
sudo lsof -i :80
sudo lsof -i :443
```

### Database Connection Failed

**Symptom:** `could not connect to server` or `connection refused`

**Check:**
```bash
# Check PostgreSQL health
docker compose ps postgres
docker exec meetmemo-postgres pg_isready -U meetmemo
```

**Solutions:**

1. **Wait for PostgreSQL to start:**
```bash
docker compose logs -f postgres
# Wait for "database system is ready to accept connections"
```

2. **Reset database:**
```bash
docker compose down -v
docker compose up -d
```

## Performance Issues

### Slow Transcription

**Causes:**
- Using CPU instead of GPU
- Large audio file
- Heavy Whisper model

**Solutions:**

1. **Verify GPU usage:**
```bash
watch -n 1 nvidia-smi
# Should show GPU utilization during transcription
```

2. **Use faster model:**
```python
# backend/config.py
whisper_model_name: str = "base"  # Faster but less accurate
```

3. **Process shorter segments:**
   - Split long audio files before uploading

### High Memory Usage

**Check memory:**
```bash
docker stats
```

**Solutions:**

1. **Restart backend periodically:**
```bash
docker compose restart meetmemo-backend
```

2. **Reduce cleanup retention:**
```python
# backend/config.py
job_retention_hours: int = 6   # Default is 12
```

## Browser Issues

### Blank Page or White Screen

**Solutions:**

1. **Clear browser cache:**
   - Chrome: Ctrl+Shift+Delete → Clear cache
   - Firefox: Ctrl+Shift+Delete → Clear cache

2. **Try incognito/private mode**

3. **Check browser console** (F12 → Console tab)

4. **Rebuild frontend:**
```bash
docker compose down
docker compose build meetmemo-frontend --no-cache
docker compose up -d
```

### Upload Fails

**Symptom:** File upload gets stuck or fails.

**Causes:**
- File too large (>100MB default)
- Unsupported format
- Network timeout

**Solutions:**

1. **Check file size:**
```python
# backend/config.py
max_file_size: int = 500 * 1024 * 1024  # Increase to 500MB
```

2. **Check format** (supported: MP3, WAV, M4A, FLAC, WebM, OGG)

3. **Increase nginx timeout:**
```nginx
# nginx/nginx.conf
client_max_body_size 500M;
proxy_read_timeout 600s;
```

## Export Issues

### PDF Generation Fails

**Check logs:**
```bash
docker compose logs -f meetmemo-backend | grep -i pdf
```

**Solutions:**

1. **Check for special characters in text**
2. **Try Markdown export instead**
3. **Check disk space:**
```bash
df -h
docker system df
```

### Download Link Broken

**Symptom:** Export download returns 404.

**Cause:** Export file was cleaned up or failed to generate.

**Solution:**
- Regenerate the export
- Check `export_retention_hours` in config

## LLM Summary Issues

### Summary Generation Fails

**Check:**
```bash
# Verify LLM is accessible
curl $LLM_API_URL/v1/models

# Check backend logs
docker compose logs -f meetmemo-backend | grep -i llm
```

**Solutions:**

1. **Verify LLM_API_URL is correct:**
```bash
# Should NOT include /v1/chat/completions
LLM_API_URL=http://localhost:1234  # Correct
LLM_API_URL=http://localhost:1234/v1/chat/completions  # Wrong
```

2. **Check LLM server is running:**
```bash
# For LM Studio
ps aux | grep lmstudio

# For Ollama
ollama list
```

3. **Test LLM manually:**
```bash
curl -X POST $LLM_API_URL/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"qwen2.5-14b-instruct","messages":[{"role":"user","content":"Hi"}]}'
```

## Disk Space Issues

### Running Out of Space

**Check usage:**
```bash
# Host disk
df -h

# Docker volumes
docker system df -v
```

**Solutions:**

1. **Clean up old data:**
```bash
# Remove stopped containers
docker system prune

# Remove old volumes (WARNING: deletes data)
docker volume prune
```

2. **Reduce retention:**
```python
# backend/config.py
job_retention_hours: int = 6
export_retention_hours: int = 12
```

3. **Manual cleanup:**
```bash
# Clean old jobs via API
curl -X DELETE https://localhost/api/v1/jobs/{uuid}
```

## Logs and Debugging

### Enable Debug Logging

Edit `backend/config.py`:
```python
log_level: str = "DEBUG"  # Instead of "INFO"
```

Restart:
```bash
docker compose restart meetmemo-backend
```

### View All Logs

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f meetmemo-backend

# Last 100 lines
docker compose logs --tail=100 meetmemo-backend

# Since specific time
docker compose logs --since=30m meetmemo-backend
```

### Container Shell Access

```bash
# Backend
docker exec -it meetmemo-backend sh

# PostgreSQL
docker exec -it meetmemo-postgres psql -U meetmemo meetmemo

# Nginx
docker exec -it meetmemo-nginx sh
```

## Getting Help

If you're still stuck:

1. **Check GitHub Issues:** https://github.com/NotYuSheng/MeetMemo/issues
2. **Collect logs:**
   ```bash
   docker compose logs > meetmemo_logs.txt
   ```
3. **Create a new issue** with:
   - MeetMemo version
   - OS and Docker version
   - GPU model (if applicable)
   - Error logs
   - Steps to reproduce
