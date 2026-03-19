# Production Deployment Guide

Instructions for deploying and maintaining the application in production.

## Current Production Setup

**Hosting:** Cloud VPS (Linux)  
**Process Manager:** PM2  
**Web Server:** Nginx (reverse proxy)  
**Database:** PostgreSQL (managed)  
**Domain:** opendoorchristian.church  
**SSL:** HTTPS with Let's Encrypt

## Pre-Deployment Checklist

- [ ] All code committed and pushed to `main` branch
- [ ] `npm run build` succeeds without errors
- [ ] Environment variables properly configured
- [ ] Database schema migrations run
- [ ] Backup of production database created
- [ ] Code reviewed and tested
- [ ] Change log updated

## Deployment Steps

### 1. Build Locally

```bash
npm install
npm run build
```

### 2. Push to Repository

```bash
git add .
git commit -m "v1.2.0: Add new features"
git push origin main
```

### 3. SSH to Production Server

```bash
ssh user@opendoorchristian.church
cd /var/www/odcc-church-website
```

### 4. Pull Latest Changes

```bash
git pull origin main
npm install
npm run build
```

### 5. Restart Application

```bash
pm2 restart app --update-env
pm2 logs app --lines 50
```

### 6. Verify Deployment

```bash
pm2 status app
curl -s https://opendoorchristian.church/ | head -20
```

## Environment Variables (Production)

Manage in `/home/appuser/app/.env` on the server:

```env
# Database
DATABASE_URL=postgresql://user:password@db-host:5432/church_db

# Server
PORT=3000
NODE_ENV=production

# Security
JWT_SECRET=use-strong-random-secret-here
CORS_ORIGIN=https://opendoorchristian.church
TURNSTILE_SECRET_KEY=from-cloudflare-dashboard
TURNSTILE_SITE_KEY=from-cloudflare-dashboard

# Email
SENDGRID_API_KEY=SG.from-sendgrid-dashboard
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=SG.from-sendgrid-dashboard

# Payments
STRIPE_SECRET_KEY=sk_live_xxxxx
STRIPE_PUBLISHABLE_KEY=pk_live_xxxxx
STRIPE_WEBHOOK_SECRET=whsec_live_xxxxx

# AI
OPENAI_API_KEY=sk-from-openai

# Storage
DATA_DIR=/var/www/odcc-church-website/data
```

**Important:**
- Use LIVE keys for Stripe (not test keys)
- Keep secrets out of version control
- Rotate JWT_SECRET periodically
- Update API keys when they expire

## PM2 Process Management

### Start Application

```bash
pm2 start ecosystem.config.js
```

### Monitor Processes

```bash
pm2 monit                    # Real-time resource usage
pm2 status                   # Process status
pm2 logs app                 # Application logs
pm2 logs app --err           # Error logs only
pm2 logs app --lines 100     # Last 100 lines
```

### Restart Application

```bash
# After code changes
pm2 restart app --update-env

# Graceful restart (no downtime)
pm2 reload app
```

### Stop Application

```bash
pm2 stop app       # Stop process
pm2 delete app     # Remove from PM2
pm2 kill           # Stop PM2 daemon
```

### View Logs

```bash
# Real-time logs
pm2 logs app --follow

# Last 100 lines
pm2 logs app --lines 100

# Clear logs
pm2 flush
```

## Database Management

### Backup Database

```bash
# Create backup
pg_dump "$DATABASE_URL" > backup-$(date +%Y%m%d-%H%M%S).sql

# Compress backup
pg_dump "$DATABASE_URL" | gzip > backup.sql.gz
```

### Restore Database

```bash
# From local backup
psql "$DATABASE_URL" < backup.sql

# From compressed backup
gunzip -c backup.sql.gz | psql "$DATABASE_URL"
```

### Connect to Database

```bash
# Interactive console
psql "$DATABASE_URL"

# Run query
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM posts;"
```

### Maintenance

```bash
# Analyze query performance
psql "$DATABASE_URL" -c "ANALYZE;"

# Clean up dead rows
psql "$DATABASE_URL" -c "VACUUM;"

# Combined maintenance
psql "$DATABASE_URL" -c "VACUUM ANALYZE;"
```

## SSL Certificate Management

Using Let's Encrypt (auto-renewed):

```bash
# View certificate details
sudo certbot certificates

# Manual renewal
sudo certbot renew

# Check expiration
echo | openssl s_client -servername opendoorchristian.church -connect opendoorchristian.church:443 2>/dev/null | openssl x509 -noout -dates
```

## Monitoring & Logs

### Application Logs

```bash
pm2 logs app                    # View logs
pm2 logs app --follow           # Follow in real-time
pm2 logs app | grep error       # Search for errors
```

### System Information

```bash
df -h                            # Disk space
du -sh /var/www/odcc-church-website  # Directory size
pm2 monit                        # CPU, memory usage
top                              # System resources
```

## Troubleshooting Production

### Application Won't Start

```bash
pm2 logs app --err
cat /home/appuser/app/.env
psql "$DATABASE_URL" -c "SELECT 1;"
pm2 start app --no-daemon  # See errors in console
```

### High CPU/Memory Usage

```bash
pm2 monit                    # Check resource usage
pm2 logs app | grep slow     # Look for slow operations
pm2 restart app              # Restart if needed
```

### Database Connection Errors

```bash
psql "$DATABASE_URL" -c "SELECT version();"
# Check firewall rules
# Ensure database is accepting connections
```

### SSL Certificate Expired

```bash
sudo certbot renew --force-renewal
sudo nginx -s reload
```

## Scaling Considerations (Future)

### Load Balancing

When traffic exceeds single server:
1. Use load balancer (AWS ELB, Nginx)
2. Run multiple application instances
3. Use shared database
4. Store uploads in S3

### Session Management

For multiple servers:
1. Use Redis for session storage
2. Store JWT in Redis
3. Share JWT_SECRET across servers

### Database Scaling

1. Set up read replicas
2. Implement caching layer (Redis)
3. Archive old data
4. Implement data partitioning

## Backup & Disaster Recovery

### Automated Daily Backups

Create `/home/appuser/backup.sh`:

```bash
#!/bin/bash
BACKUP_DIR=/backups/church-website
DB_URL=$DATABASE_URL

mkdir -p $BACKUP_DIR
pg_dump "$DB_URL" | gzip > $BACKUP_DIR/db-$(date +%Y%m%d-%H%M%S).sql.gz
find $BACKUP_DIR -name "db-*.sql.gz" -mtime +30 -delete

echo "Backup completed: $(date)" >> /var/log/church-backup.log
```

### Setup Cron Job

```bash
crontab -e
# Add daily backup at 2 AM
0 2 * * * /home/appuser/backup.sh
```

### Recovery Plan

1. Stop application: `pm2 stop app`
2. Restore database: `psql "$DATABASE_URL" < backup.sql`
3. Clear application cache
4. Restart application: `pm2 start app`
5. Verify site is working

## Security

### Keep Dependencies Updated

```bash
npm audit
npm audit fix
npm update
```

### Rotate Secrets Periodically

1. Update JWT_SECRET in `.env`
2. All existing tokens become invalid
3. Users must login again
4. Update other API keys

### Monitor Security

```bash
git secrets --scan
pm2 logs app | grep "401\|unauthorized"
```

## Version Tracking

Maintain version in `package.json`:

```json
{
  "name": "odcc-church-website",
  "version": "1.2.0",
  "description": "Open Door Christian Church Website"
}
```

**Semantic Versioning:** MAJOR.MINOR.PATCH
- MAJOR: Breaking changes
- MINOR: New features
- PATCH: Bug fixes

## Change Log

Maintain `CHANGELOG.md`:

```markdown
## [1.2.0] - 2024-01-15

### Added
- New user profile page
- Email auto-reply feature

### Fixed
- Blog post slug generation issue
- Email attachment bug

## [1.1.0] - 2024-01-01

### Added
- Donation recurring payment support
- Newsletter campaign management
```

## Maintenance Windows

Schedule maintenance for low-traffic periods:

1. Announce maintenance to users
2. Enable maintenance mode (optional)
3. Perform updates
4. Test thoroughly
5. Bring site back online
6. Monitor for issues

## Key Contacts

- **Server Admin:** [contact info]
- **Database Admin:** [contact info]
- **Domain Registrar:** [contact info]
- **SSL Provider:** Let's Encrypt (auto-renewed)
- **Hosting Provider:** [Cloud VPS contact]
