# Database Documentation

MeetMemo uses PostgreSQL 16 for data persistence.

## Overview

- **Database**: PostgreSQL 16
- **Driver**: asyncpg (async PostgreSQL driver for Python)
- **Connection Pool**: 5-20 connections
- **Schema Management**: SQL migration files in `backend/migrations/`

## Schema

### Tables

#### `jobs` Table

Stores metadata for transcription jobs.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY | Unique job identifier |
| `file_name` | VARCHAR(255) | NOT NULL | Original filename |
| `file_path` | TEXT | NOT NULL | Path to audio file in Docker volume |
| `file_hash` | VARCHAR(64) | UNIQUE | SHA256 hash for deduplication |
| `status` | VARCHAR(50) | NOT NULL, DEFAULT 'pending' | Job status (pending, processing, completed, failed) |
| `error_message` | TEXT | NULL | Error details if job failed |
| `workflow_state` | VARCHAR(50) | NULL | Current workflow step |
| `created_at` | TIMESTAMP | NOT NULL, DEFAULT NOW() | Creation timestamp |
| `updated_at` | TIMESTAMP | NOT NULL, DEFAULT NOW() | Last update timestamp |

**Indexes:**
- Primary key on `id`
- Unique index on `file_hash`
- Index on `created_at` for cleanup queries
- Index on `status` for filtering

**Example:**
```sql
SELECT id, file_name, status, workflow_state 
FROM jobs 
WHERE status = 'completed' 
ORDER BY created_at DESC 
LIMIT 10;
```

#### `export_jobs` Table

Tracks asynchronous export generation jobs.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY | Unique export job identifier |
| `job_id` | UUID | NOT NULL, FOREIGN KEY → jobs(id) | Reference to parent job |
| `export_type` | VARCHAR(50) | NOT NULL | Type of export (pdf_summary, markdown_transcript, etc.) |
| `status` | VARCHAR(50) | NOT NULL, DEFAULT 'pending' | Export status (pending, processing, completed, failed) |
| `progress` | INTEGER | DEFAULT 0 | Progress percentage (0-100) |
| `error_message` | TEXT | NULL | Error details if export failed |
| `file_path` | TEXT | NULL | Path to generated export file |
| `created_at` | TIMESTAMP | NOT NULL, DEFAULT NOW() | Creation timestamp |
| `updated_at` | TIMESTAMP | NOT NULL, DEFAULT NOW() | Last update timestamp |

**Foreign Key:**
- `job_id` references `jobs(id)` ON DELETE CASCADE

**Indexes:**
- Primary key on `id`
- Index on `job_id` for lookups
- Index on `created_at` for cleanup queries

**Export Types:**
- `pdf_summary` - PDF version of summary
- `markdown_summary` - Markdown version of summary
- `pdf_transcript` - PDF version of transcript
- `markdown_transcript` - Markdown version of transcript

**Example:**
```sql
SELECT e.id, e.export_type, e.status, e.progress, j.file_name
FROM export_jobs e
JOIN jobs j ON e.job_id = j.id
WHERE e.status = 'completed'
ORDER BY e.created_at DESC;
```

## Connection Configuration

Configured in `backend/config.py`:

```python
class Settings(BaseSettings):
    database_url: str  # postgresql://user:pass@host:port/dbname
    db_pool_min_size: int = 5
    db_pool_max_size: int = 20
```

Default connection string (Docker):
```
postgresql://meetmemo:changeme@postgres:5432/meetmemo
```

## Migrations

### Migration Files

Located in `backend/migrations/`:

- `001_init_schema.sql` - Initial schema creation

### Running Migrations

Migrations run automatically on container startup via PostgreSQL's `docker-entrypoint-initdb.d/`:

```yaml
# docker-compose.yml
postgres:
  volumes:
    - ./backend/migrations:/docker-entrypoint-initdb.d
```

### Creating New Migrations

1. Create new SQL file: `backend/migrations/002_description.sql`
2. Write migration SQL
3. Restart PostgreSQL container

**Example migration:**
```sql
-- 002_add_metadata_column.sql
ALTER TABLE jobs ADD COLUMN metadata JSONB DEFAULT '{}'::jsonb;
CREATE INDEX idx_jobs_metadata ON jobs USING GIN (metadata);
```

## Common Queries

### Get All Jobs

```sql
SELECT 
    id,
    file_name,
    status,
    workflow_state,
    created_at,
    updated_at
FROM jobs
ORDER BY created_at DESC
LIMIT 50 OFFSET 0;
```

### Get Job with Export Status

```sql
SELECT 
    j.id,
    j.file_name,
    j.status as job_status,
    j.workflow_state,
    e.id as export_id,
    e.export_type,
    e.status as export_status,
    e.progress
FROM jobs j
LEFT JOIN export_jobs e ON j.id = e.job_id
WHERE j.id = 'your-uuid-here';
```

### Clean Up Old Jobs

```sql
DELETE FROM jobs
WHERE created_at < NOW() - INTERVAL '12 hours'
AND status IN ('completed', 'failed');
```

### Find Duplicate Files

```sql
SELECT file_hash, COUNT(*) as count
FROM jobs
WHERE file_hash IS NOT NULL
GROUP BY file_hash
HAVING COUNT(*) > 1;
```

## Backup and Restore

### Backup Database

```bash
# Backup to SQL file
docker exec meetmemo-postgres pg_dump -U meetmemo meetmemo > backup.sql

# Backup with compression
docker exec meetmemo-postgres pg_dump -U meetmemo meetmemo | gzip > backup.sql.gz

# Backup specific table
docker exec meetmemo-postgres pg_dump -U meetmemo meetmemo -t jobs > jobs_backup.sql
```

### Restore Database

```bash
# Restore from SQL file
docker exec -i meetmemo-postgres psql -U meetmemo meetmemo < backup.sql

# Restore from compressed file
gunzip < backup.sql.gz | docker exec -i meetmemo-postgres psql -U meetmemo meetmemo

# Restore specific table
docker exec -i meetmemo-postgres psql -U meetmemo meetmemo < jobs_backup.sql
```

## Maintenance

### Vacuum Database

```sql
-- Analyze tables for query optimization
ANALYZE jobs;
ANALYZE export_jobs;

-- Full vacuum (reclaim storage)
VACUUM FULL jobs;
VACUUM FULL export_jobs;
```

### Check Table Sizes

```sql
SELECT 
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

### Check Index Usage

```sql
SELECT 
    schemaname,
    tablename,
    indexname,
    idx_scan as index_scans,
    idx_tup_read as tuples_read,
    idx_tup_fetch as tuples_fetched
FROM pg_stat_user_indexes
ORDER BY idx_scan DESC;
```

## Troubleshooting

### Connection Issues

**Check if PostgreSQL is running:**
```bash
docker compose ps postgres
docker exec meetmemo-postgres pg_isready -U meetmemo
```

**Test connection from backend:**
```bash
docker exec meetmemo-backend python -c "
import asyncio
from database import get_pool
async def test():
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.fetchval('SELECT 1')
        print(f'Connection successful: {result}')
asyncio.run(test())
"
```

### Query Performance

**Enable query logging** in PostgreSQL:
```bash
# Inside postgres container
echo "log_statement = 'all'" >> /var/lib/postgresql/data/postgresql.conf
echo "log_duration = on" >> /var/lib/postgresql/data/postgresql.conf

# Restart PostgreSQL
docker compose restart postgres
```

**View slow queries:**
```bash
docker exec meetmemo-postgres tail -f /var/lib/postgresql/data/log/postgresql-*.log
```

### Database Locks

**Check for blocking queries:**
```sql
SELECT 
    blocked_locks.pid AS blocked_pid,
    blocked_activity.usename AS blocked_user,
    blocking_locks.pid AS blocking_pid,
    blocking_activity.usename AS blocking_user,
    blocked_activity.query AS blocked_statement,
    blocking_activity.query AS blocking_statement
FROM pg_catalog.pg_locks blocked_locks
JOIN pg_catalog.pg_stat_activity blocked_activity ON blocked_activity.pid = blocked_locks.pid
JOIN pg_catalog.pg_locks blocking_locks 
    ON blocking_locks.locktype = blocked_locks.locktype
    AND blocking_locks.database IS NOT DISTINCT FROM blocked_locks.database
    AND blocking_locks.relation IS NOT DISTINCT FROM blocked_locks.relation
    AND blocking_locks.pid != blocked_locks.pid
JOIN pg_catalog.pg_stat_activity blocking_activity ON blocking_activity.pid = blocking_locks.pid
WHERE NOT blocked_locks.granted;
```

**Kill blocking query:**
```sql
SELECT pg_terminate_backend(pid);
```

## Data Retention

The cleanup service automatically removes old data:

- **Jobs**: Deleted after `job_retention_hours` (default: 12 hours)
- **Export Jobs**: Deleted after `export_retention_hours` (default: 24 hours)

Configure in `backend/config.py`:
```python
cleanup_interval_hours: int = 1
job_retention_hours: int = 12
export_retention_hours: int = 24
```

## Security

- **Password**: Change default `POSTGRES_PASSWORD` in production
- **Network**: Database only accessible within Docker network
- **Parameterized Queries**: All queries use parameterized statements (prevents SQL injection)
- **Backups**: Regular backups recommended for production

## Access from Host

PostgreSQL is not exposed to the host by default (no port mapping). To access:

**Option 1: Add port mapping** (development only):
```yaml
# docker-compose.yml
postgres:
  ports:
    - "5432:5432"
```

**Option 2: Use docker exec:**
```bash
docker exec -it meetmemo-postgres psql -U meetmemo meetmemo
```

**Option 3: Port forward:**
```bash
kubectl port-forward svc/postgres 5432:5432  # If using Kubernetes
```

## Monitoring

### Connection Pool Status

```sql
SELECT 
    numbackends as current_connections,
    datname as database
FROM pg_stat_database
WHERE datname = 'meetmemo';
```

### Active Queries

```sql
SELECT 
    pid,
    usename,
    application_name,
    client_addr,
    state,
    query,
    query_start
FROM pg_stat_activity
WHERE datname = 'meetmemo'
AND state != 'idle'
ORDER BY query_start;
```

### Database Statistics

```sql
SELECT 
    schemaname,
    tablename,
    n_tup_ins as inserts,
    n_tup_upd as updates,
    n_tup_del as deletes,
    n_live_tup as live_rows,
    n_dead_tup as dead_rows,
    last_vacuum,
    last_autovacuum,
    last_analyze,
    last_autoanalyze
FROM pg_stat_user_tables
ORDER BY n_live_tup DESC;
```
