# Deployment Guide

## Overview

The Transplant Platform is deployed on AWS with the following stack:
- **EC2**: Amazon Linux 2023, t3.micro
- **RDS**: PostgreSQL 17.4, db.t3.micro
- **Cloudflare**: DNS and CDN proxy
- **SES**: Email delivery

## Server Details

| Component | Value |
|-----------|-------|
| EC2 Instance ID | `i-01ccb106fd09c4e58` |
| EC2 Public IP | `3.215.185.174` |
| Region | `us-east-1` |
| OS | Amazon Linux 2023 |
| Node.js | v20.19.5 |
| npm | v10.8.2 |

## SSH Access

```bash
ssh -i ~/.ssh/transplant-wizard-key.pem ec2-user@3.215.185.174
```

**Note**: The SSH key file is `transplant-wizard-key.pem` located in `~/.ssh/`

## Deployment Directory Structure

On the EC2 server:

```
/home/ec2-user/transplant-wizard/
├── backend-api/           # Backend API (port 3004)
├── main-website/          # Main website (port 3000)
├── dusw-website/          # DUSW Portal (port 3001)
├── tc-website/            # TC Portal (port 3002)
├── Shakir-ClaudeCode/     # iOS app source (reference only)
├── database/              # SQL schema files
├── terraform/             # Infrastructure code
├── start-all-services.sh  # Helper script
└── monitor-services.sh    # Monitoring script
```

## Systemd Services

All Node.js applications run as systemd services:

| Service | Port | Working Directory |
|---------|------|-------------------|
| `transplant-backend` | 3004 | `/home/ec2-user/transplant-wizard/backend-api` |
| `transplant-main-website` | 3000 | `/home/ec2-user/transplant-wizard/main-website` |
| `transplant-dusw-website` | 3001 | `/home/ec2-user/transplant-wizard/dusw-website` |
| `transplant-tc-website` | 3002 | `/home/ec2-user/transplant-wizard/tc-website` |

### Service Configuration Files

Located at `/etc/systemd/system/`:

**transplant-backend.service**:
```ini
[Unit]
Description=Transplant Platform Backend API
After=network.target

[Service]
Type=simple
User=ec2-user
WorkingDirectory=/home/ec2-user/transplant-wizard/backend-api
Environment=NODE_ENV=production
ExecStart=/usr/bin/node /home/ec2-user/transplant-wizard/backend-api/src/simple-auth-server.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

**transplant-main-website.service**:
```ini
[Unit]
Description=Transplant Platform Main Website
After=network.target

[Service]
Type=simple
User=ec2-user
WorkingDirectory=/home/ec2-user/transplant-wizard/main-website
Environment=NODE_ENV=production
Environment=PORT=3000
ExecStart=/usr/bin/node /home/ec2-user/transplant-wizard/main-website/server.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Similar configurations exist for `transplant-dusw-website` (port 3001) and `transplant-tc-website` (port 3002).

## Nginx Configuration

Nginx acts as a reverse proxy, routing traffic to the appropriate service.

**Config file**: `/etc/nginx/conf.d/transplant-platform.conf`

```nginx
# Main website - transplantwizard.com and www
server {
    listen 80;
    listen 443 ssl http2;
    server_name transplantwizard.com www.transplantwizard.com;

    ssl_certificate /etc/nginx/cert.pem;
    ssl_certificate_key /etc/nginx/cert.key;

    # Cloudflare IP trust (real_ip_from blocks)
    set_real_ip_from 173.245.48.0/20;
    # ... additional Cloudflare ranges
    real_ip_header CF-Connecting-IP;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# API subdomain
server {
    listen 80;
    listen 443 ssl http2;
    server_name api.transplantwizard.com;

    # ... SSL and Cloudflare config ...

    location / {
        proxy_pass http://localhost:3004;
        # ... proxy headers ...
    }
}

# DUSW Portal
server {
    listen 80;
    listen 443 ssl http2;
    server_name dusw.transplantwizard.com;

    # ... SSL and Cloudflare config ...

    location / {
        proxy_pass http://localhost:3001;
        # ... proxy headers ...
    }
}

# Transplant Center Portal
server {
    listen 80;
    listen 443 ssl http2;
    server_name tc.transplantwizard.com;

    # ... SSL and Cloudflare config ...

    location / {
        proxy_pass http://localhost:3002;
        # ... proxy headers ...
    }
}
```

## Deploying Code Changes

### Manual Deployment

1. **SSH to server**:
   ```bash
   ssh -i ~/.ssh/transplant-wizard-key.pem ec2-user@3.215.185.174
   ```

2. **Navigate to project**:
   ```bash
   cd /home/ec2-user/transplant-wizard
   ```

3. **Pull latest changes**:
   ```bash
   git pull origin main
   ```

4. **Install dependencies** (if package.json changed):
   ```bash
   cd backend-api && npm install
   cd ../main-website && npm install
   cd ../dusw-website && npm install
   cd ../tc-website && npm install
   ```

5. **Restart services**:
   ```bash
   sudo systemctl restart transplant-backend
   sudo systemctl restart transplant-main-website
   sudo systemctl restart transplant-dusw-website
   sudo systemctl restart transplant-tc-website
   ```

6. **Verify services**:
   ```bash
   sudo systemctl status transplant-backend
   curl http://localhost:3004/health
   ```

### Quick Restart All Services

```bash
sudo systemctl restart transplant-backend transplant-main-website transplant-dusw-website transplant-tc-website
```

### Reload Nginx (after config changes)

```bash
sudo nginx -t              # Test config
sudo systemctl reload nginx
```

## iOS App Deployment

### TestFlight Deployment

1. **Build Archive in Xcode**:
   - Select "Any iOS Device" as target
   - Product > Archive

2. **Upload to App Store Connect**:
   - Window > Organizer
   - Select archive > Distribute App
   - Choose App Store Connect > Upload

3. **TestFlight Configuration**:
   - Log into App Store Connect
   - Select app > TestFlight tab
   - Add testers or enable Public Link

### Build Commands (CLI)

```bash
# Build release archive
xcodebuild -project Shakir-ClaudeCode.xcodeproj \
  -scheme Shakir-ClaudeCode \
  -configuration Release \
  -archivePath build/Shakir-ClaudeCode.xcarchive \
  archive

# Export for distribution (requires ExportOptions.plist)
xcodebuild -exportArchive \
  -archivePath build/Shakir-ClaudeCode.xcarchive \
  -exportPath build/export \
  -exportOptionsPlist ExportOptions.plist
```

## Database Migrations

### Apply Migration

```bash
# SSH to server
ssh -i ~/.ssh/transplant-wizard-key.pem ec2-user@3.215.185.174

# Run migration
cd /home/ec2-user/transplant-wizard
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -f path/to/migration.sql
```

### Rollback Strategy

1. Always backup before migrations:
   ```bash
   pg_dump -h $DB_HOST -U $DB_USER -d $DB_NAME > backup_$(date +%Y%m%d_%H%M%S).sql
   ```

2. For reversible migrations, create corresponding down migration files

## Environment Updates

When updating environment variables:

1. **Edit .env file**:
   ```bash
   cd /home/ec2-user/transplant-wizard/backend-api
   vim .env
   ```

2. **Restart affected service**:
   ```bash
   sudo systemctl restart transplant-backend
   ```

3. **Verify**:
   ```bash
   curl http://localhost:3004/health
   ```

## Rollback Procedure

### Code Rollback

```bash
# SSH to server
ssh -i ~/.ssh/transplant-wizard-key.pem ec2-user@3.215.185.174

# Check commit history
cd /home/ec2-user/transplant-wizard
git log --oneline -10

# Rollback to specific commit
git checkout <commit-hash>

# Restart services
sudo systemctl restart transplant-backend transplant-main-website transplant-dusw-website transplant-tc-website
```

### Database Rollback

1. Restore from backup:
   ```bash
   psql -h $DB_HOST -U $DB_USER -d $DB_NAME < backup_file.sql
   ```

## Health Checks

### API Health
```bash
curl https://api.transplantwizard.com/health
```

### All Services Status
```bash
sudo systemctl status transplant-backend transplant-main-website transplant-dusw-website transplant-tc-website
```

### Nginx Status
```bash
sudo systemctl status nginx
```

## DNS Records (Cloudflare)

Managed via Terraform. See `terraform/modules/cloudflare/main.tf` or Cloudflare dashboard.

| Type | Name | Content | Proxied |
|------|------|---------|---------|
| A | @ | 3.215.185.174 | Yes |
| A | www | 3.215.185.174 | Yes |
| A | api | 3.215.185.174 | Yes |
| A | dusw | 3.215.185.174 | Yes |
| A | tc | 3.215.185.174 | Yes |
| CNAME | *._domainkey | *.dkim.amazonses.com | No |
| TXT | @ | v=spf1 include:amazonses.com ~all | - |
| TXT | _dmarc | v=DMARC1; p=quarantine; ... | - |

## Terraform Deployment

See `terraform/README.md` for infrastructure changes.

```bash
cd terraform
terraform plan    # Preview changes
terraform apply   # Apply changes
```

## UNKNOWN: Items to Verify

- [ ] CI/CD pipeline configuration (if any)
- [ ] Automated backup schedule for RDS
- [ ] SSL certificate renewal process (self-signed on EC2, Cloudflare handles public SSL)
- [ ] Log rotation configuration
