# Deployment Guide

This guide covers deploying MeetMemo with HTTPS support.

## Quick Start

MeetMemo includes **HTTPS out of the box** with self-signed certificates:

```bash
docker compose up -d
```

Access at: **https://localhost** (or `https://your-server-ip`)

> **Note**: Your browser will show a security warning for the self-signed certificate. Click "Advanced" → "Proceed to localhost" - this is expected and safe for local/internal use.

## HTTPS Requirement

**HTTPS is required for browser recording** due to browser security policies:

- **Microphone Access**: Web browsers require a secure context (HTTPS) to access the microphone API
- **Already Enabled**: MeetMemo includes self-signed SSL certificates that work immediately
- **Development**: Self-signed certificates work perfectly for local development and internal networks

## Production Deployment

### Option 1: Use Self-Signed Certificates (Simplest)

**Best for**: Internal networks, private deployments, teams that can accept certificate warnings

✅ **Already configured** - no additional setup needed!

Just access via `https://your-server-ip` and accept the browser warning.

### Option 2: Replace with Real Certificates

**Best for**: Public deployments, avoiding browser warnings

You can replace the self-signed certificates with real CA-signed certificates (Let's Encrypt, etc.).

#### Using Let's Encrypt with Certbot

1. **Obtain certificates** on your host machine:

```bash
sudo certbot certonly --standalone -d meetmemo.yourdomain.com
```

2. **Mount certificates into nginx container**

Edit `docker-compose.yml`:

```yaml
nginx:
  volumes:
    - /etc/letsencrypt/live/meetmemo.yourdomain.com/fullchain.pem:/etc/ssl/certs/cert.pem:ro
    - /etc/letsencrypt/live/meetmemo.yourdomain.com/privkey.pem:/etc/ssl/private/key.pem:ro
```

3. **Restart**:

```bash
docker compose down
docker compose up -d
```

4. **Set up auto-renewal**:

```bash
# Add to crontab
0 0 * * * certbot renew --quiet && docker compose restart nginx
```

### Option 3: Cloudflare Tunnel (Advanced)

**Best for**: Zero-config public access, DDoS protection, working behind NAT

See [Cloudflare Tunnel Setup](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) for detailed instructions.

Quick setup:
```bash
# Install
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o cloudflared
chmod +x cloudflared && sudo mv cloudflared /usr/local/bin/

# Setup
cloudflared tunnel login
cloudflared tunnel create meetmemo
cloudflared tunnel route dns meetmemo meetmemo.yourdomain.com

# Configure (~/.cloudflared/config.yml)
tunnel: <tunnel-id>
credentials-file: ~/.cloudflared/<tunnel-id>.json
ingress:
  - hostname: meetmemo.yourdomain.com
    service: http://localhost:80
  - service: http_status:404

# Run
cloudflared tunnel run meetmemo
```

## Production Checklist

Before deploying to production:

### Security
- [ ] **Change default passwords**
  - Set strong `POSTGRES_PASSWORD` in `.env` (20+ random characters)

- [ ] **Configure credentials**
  - [ ] `HF_TOKEN` with access to PyAnnote models
  - [ ] `LLM_API_URL` pointing to your LLM server
  - [ ] `LLM_MODEL_NAME` configured
  - [ ] `LLM_API_KEY` (if required)

- [ ] **HTTPS Setup**
  - [ ] Using self-signed certs (no action needed), OR
  - [ ] Replaced with real certificates (see Option 2 above)

- [ ] **Firewall configuration**
  - Open ports 80, 443 for web access
  - Restrict PostgreSQL port (5432) to localhost
  - Restrict backend port (8000) to localhost

### Data Management
- [ ] **Set up backups**
  ```bash
  # PostgreSQL backup
  docker exec meetmemo-postgres pg_dump -U meetmemo meetmemo > backup.sql

  # Volume backup
  sudo tar -czf meetmemo_backup.tar.gz /var/lib/docker/volumes/meetmemo_*
  ```

- [ ] **Configure cleanup retention**
  - Adjust `job_retention_hours` (default: 12h)
  - Adjust `export_retention_hours` (default: 24h)

### Testing
- [ ] **Test core functionality**
  - [ ] Audio upload works
  - [ ] Microphone recording works (requires HTTPS ✓)
  - [ ] Transcription completes
  - [ ] Summary generation works
  - [ ] PDF/Markdown export works

## Backup and Recovery

### Quick Backup Script

```bash
#!/bin/bash
BACKUP_DIR="/backups/meetmemo"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p "$BACKUP_DIR"

# Backup database
docker exec meetmemo-postgres pg_dump -U meetmemo meetmemo > "$BACKUP_DIR/db_$DATE.sql"

# Backup volumes
sudo tar -czf "$BACKUP_DIR/volumes_$DATE.tar.gz" \
  /var/lib/docker/volumes/meetmemo_audiofiles \
  /var/lib/docker/volumes/meetmemo_transcripts \
  /var/lib/docker/volumes/meetmemo_summary \
  /var/lib/docker/volumes/meetmemo_exports \
  /var/lib/docker/volumes/meetmemo_postgres_data

# Keep only last 7 days
find "$BACKUP_DIR" -type f -mtime +7 -delete

echo "Backup completed: $BACKUP_DIR"
```

### Restore from Backup

```bash
# Restore database
docker exec -i meetmemo-postgres psql -U meetmemo meetmemo < backup.sql

# Restore volumes (stop containers first)
docker compose down
sudo tar -xzf volumes_backup.tar.gz -C /
docker compose up -d
```

## Monitoring

### Check Container Health

```bash
# View all services
docker compose ps

# View logs
docker compose logs -f meetmemo-backend

# Monitor resources
docker stats
```

### GPU Monitoring (if using NVIDIA GPU)

```bash
# Check GPU usage
nvidia-smi

# Watch in real-time
watch -n 1 nvidia-smi
```

### Disk Space

```bash
# Check Docker volume sizes
docker system df -v

# Clean up unused data
docker system prune -a --volumes
```

## Troubleshooting

### Microphone Recording Not Working

**Symptom**: Recording button disabled or microphone access denied

**Solution**: Ensure you're accessing via HTTPS (self-signed cert is fine)
- ✅ `https://localhost` - Works
- ✅ `https://192.168.1.100` - Works
- ❌ `http://localhost` - Won't work (except on localhost in some browsers)

### Browser Certificate Warning

**Symptom**: "Your connection is not private" warning

**Solution**: This is normal with self-signed certificates
1. Click "Advanced"
2. Click "Proceed to localhost (unsafe)" or "Accept the Risk and Continue"
3. Recording will work after accepting

**For production**: Replace with real certificates (see Option 2 above)

### Container Not Starting

```bash
# Check logs for errors
docker compose logs

# Rebuild from scratch
docker compose down
docker compose build --no-cache
docker compose up -d
```

### GPU Not Detected

```bash
# Check NVIDIA runtime
nvidia-smi

# Verify Docker has GPU access
docker run --rm --gpus all nvidia/cuda:11.8.0-base-ubuntu22.04 nvidia-smi

# Restart Docker service
sudo systemctl restart docker
docker compose restart meetmemo-backend
```

### Database Connection Issues

```bash
# Check PostgreSQL is running
docker exec meetmemo-postgres pg_isready -U meetmemo

# Check connection from backend
docker exec meetmemo-backend env | grep DATABASE_URL
```

## Advanced Configuration

### Custom Domain

If you have a domain pointing to your server, you can use it with the existing self-signed certificates. Just access via `https://yourdomain.com` and accept the certificate warning.

For no certificate warnings, replace certificates as described in Option 2.

### Firewall Rules (UFW)

```bash
# Allow HTTP/HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Enable firewall
sudo ufw enable
```

### Reverse Proxy (Optional)

If you need to run MeetMemo alongside other services, you can put another reverse proxy in front:

1. Change the external ports using environment variables in `.env`:
```bash
HTTP_PORT=8080
HTTPS_PORT=8443
```

Alternatively, edit `docker-compose.yml` ports:
```yaml
nginx:
  ports:
    - "8080:80"
    - "8443:443"
```

2. Configure your main reverse proxy to forward to `http://localhost:8080`

## Security Considerations

- **Local Processing**: Audio transcription happens on your server (data never leaves except for LLM summarization)
- **Self-Signed Certificates**: Secure for internal use; replace with CA-signed certs for public deployments
- **Database**: PostgreSQL is not exposed outside Docker network
- **Firewall**: Only expose ports 80 and 443 to the internet
- **Backups**: Keep regular backups of PostgreSQL database and audio files
