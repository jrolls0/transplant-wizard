# Operations Guide

## Service Management

### SSH Access

```bash
ssh -i ~/.ssh/transplant-wizard-key.pem ec2-user@3.215.185.174
```

### Service Status

```bash
# Check all services
sudo systemctl status transplant-backend transplant-main-website transplant-dusw-website transplant-tc-website

# Check specific service
sudo systemctl status transplant-backend
```

### Start/Stop/Restart Services

```bash
# Restart single service
sudo systemctl restart transplant-backend

# Restart all services
sudo systemctl restart transplant-backend transplant-main-website transplant-dusw-website transplant-tc-website

# Stop service
sudo systemctl stop transplant-backend

# Start service
sudo systemctl start transplant-backend
```

### Enable/Disable Services at Boot

```bash
# Enable auto-start
sudo systemctl enable transplant-backend

# Disable auto-start
sudo systemctl disable transplant-backend
```

## Log Management

### View Service Logs

```bash
# Follow live logs
sudo journalctl -u transplant-backend -f

# Last 100 lines
sudo journalctl -u transplant-backend -n 100

# Logs since specific time
sudo journalctl -u transplant-backend --since "1 hour ago"

# Logs between dates
sudo journalctl -u transplant-backend --since "2025-12-20" --until "2025-12-21"
```

### Log Locations

| Log Type | Location |
|----------|----------|
| systemd service logs | `journalctl -u <service>` |
| Nginx access | `/var/log/nginx/access.log` |
| Nginx error | `/var/log/nginx/error.log` |
| Application logs | stdout captured by journald |

### Nginx Logs

```bash
# Access logs
sudo tail -f /var/log/nginx/access.log

# Error logs
sudo tail -f /var/log/nginx/error.log
```

## Health Checks

### API Health Check

```bash
# Local (on server)
curl http://localhost:3004/health

# Remote
curl https://api.transplantwizard.com/health
```

**Expected Response**:
```json
{
  "status": "healthy",
  "timestamp": "2025-12-21T...",
  "environment": "production",
  "database": "connected",
  "dbTime": "2025-12-21T...",
  "auth": "basic_auth_enabled"
}
```

### Website Health Checks

```bash
curl -I https://transplantwizard.com
curl -I https://dusw.transplantwizard.com
curl -I https://tc.transplantwizard.com
```

### Database Connectivity

```bash
# From server
cd /home/ec2-user/transplant-wizard/backend-api
node -e "
const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false }
});
pool.query('SELECT NOW()').then(r => {
  console.log('DB OK:', r.rows[0]);
  process.exit(0);
}).catch(e => {
  console.error('DB Error:', e.message);
  process.exit(1);
});
"
```

## Monitoring

### Process Monitoring

```bash
# Check Node.js processes
ps aux | grep node

# Memory usage
free -h

# Disk usage
df -h

# CPU usage
top
```

### Network Connections

```bash
# Active connections to Node.js ports
ss -tlnp | grep -E '300[0-4]'

# All listening ports
ss -tlnp
```

### Service Resource Usage

```bash
# Memory per service
systemctl show transplant-backend --property=MemoryCurrent
```

## Troubleshooting

### Service Won't Start

1. **Check logs**:
   ```bash
   sudo journalctl -u transplant-backend -n 50
   ```

2. **Check syntax errors**:
   ```bash
   cd /home/ec2-user/transplant-wizard/backend-api
   node --check src/simple-auth-server.js
   ```

3. **Check .env file**:
   ```bash
   cat /home/ec2-user/transplant-wizard/backend-api/.env
   ```

4. **Check permissions**:
   ```bash
   ls -la /home/ec2-user/transplant-wizard/backend-api/
   ```

### Database Connection Issues

1. **Test connection directly**:
   ```bash
   PGPASSWORD='<password>' psql -h transplant-platform-db.cibqsuyys3wn.us-east-1.rds.amazonaws.com -U transplant_admin -d postgres -c "SELECT 1"
   ```

2. **Check security group** allows connection from EC2

3. **Check .env** has correct DB credentials

4. **Check RDS status** in AWS Console

### Nginx Issues

1. **Test configuration**:
   ```bash
   sudo nginx -t
   ```

2. **Check error logs**:
   ```bash
   sudo tail -50 /var/log/nginx/error.log
   ```

3. **Reload after fixes**:
   ```bash
   sudo systemctl reload nginx
   ```

### High Memory/CPU

1. **Identify process**:
   ```bash
   top -o %MEM
   top -o %CPU
   ```

2. **Restart affected service**:
   ```bash
   sudo systemctl restart <service-name>
   ```

### Email Not Sending

1. **Check SES mode**:
   - Sandbox mode only sends to verified recipients
   - Check `SES_SANDBOX_MODE` in .env

2. **Check IAM permissions**:
   - EC2 instance needs `ses:SendEmail` permission

3. **Check CloudWatch**:
   - SES logs in AWS CloudWatch

## Backup Procedures

### Database Backup

```bash
# Manual backup
pg_dump -h transplant-platform-db.c90ca0kcwjsh.us-east-1.rds.amazonaws.com \
  -U transplant_admin -d transplant_platform \
  > backup_$(date +%Y%m%d_%H%M%S).sql

# Restore from backup
psql -h transplant-platform-db.c90ca0kcwjsh.us-east-1.rds.amazonaws.com \
  -U transplant_admin -d transplant_platform \
  < backup_file.sql
```

### Code Backup

```bash
# Git is the primary backup mechanism
cd /home/ec2-user/transplant-wizard
git log --oneline -10  # Recent commits

# Create manual archive
tar -czvf backup_code_$(date +%Y%m%d).tar.gz /home/ec2-user/transplant-wizard
```

## Security Operations

### Update System Packages

```bash
sudo dnf update -y
```

### Rotate Credentials

1. Update password in `.env`
2. Restart affected services
3. Update AWS credentials if needed

### Check for Unauthorized Access

```bash
# Last logins
last -20

# Failed SSH attempts
sudo journalctl -u sshd | grep -i failed

# Auth logs
sudo cat /var/log/secure | tail -50
```

## Emergency Procedures

### Service Down - Quick Recovery

```bash
# 1. Check service status
sudo systemctl status transplant-backend

# 2. Restart service
sudo systemctl restart transplant-backend

# 3. If still failing, check logs
sudo journalctl -u transplant-backend -n 50

# 4. If dependency issue, restart all
sudo systemctl restart transplant-backend transplant-main-website transplant-dusw-website transplant-tc-website nginx
```

### Database Down

1. Check RDS status in AWS Console
2. Verify security group rules
3. Check connection from EC2:
   ```bash
   nc -zv transplant-platform-db.c90ca0kcwjsh.us-east-1.rds.amazonaws.com 5432
   ```

### Complete Server Restart

```bash
# Reboot EC2 instance (last resort)
sudo reboot

# Services should auto-start if enabled
```

### Rollback Deployment

```bash
# 1. Identify last good commit
git log --oneline -20

# 2. Checkout that commit
git checkout <commit-hash>

# 3. Restart services
sudo systemctl restart transplant-backend transplant-main-website transplant-dusw-website transplant-tc-website
```

## Useful Scripts on Server

| Script | Purpose |
|--------|---------|
| `start-all-services.sh` | Start all Node.js services |
| `monitor-services.sh` | Monitor service status |
| `test-ios.sh` | Test iOS app connectivity |

## Contact Information

- **AWS Account Owner**: [To be filled]
- **Domain Registrar**: Cloudflare
- **Emergency Escalation**: [To be filled]

## UNKNOWN: Items to Document

- [ ] Alerting/notification setup (PagerDuty, SNS, etc.)
- [ ] On-call rotation schedule
- [ ] Incident response procedures
- [ ] SLA/uptime requirements
- [ ] Disaster recovery plan
