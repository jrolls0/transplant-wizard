# Systemd Service Configuration

This document describes the systemd services running on the EC2 instance.

## Services Overview

| Service | Port | Working Directory | Script |
|---------|------|-------------------|--------|
| transplant-backend | 3004 | /home/ec2-user/transplant-wizard/backend-api | simple-auth-server.js |
| transplant-main-website | 3000 | /home/ec2-user/transplant-wizard/main-website | server.js |
| transplant-dusw-website | 3001 | /home/ec2-user/transplant-wizard/dusw-website | server.js |
| transplant-tc-website | 3002 | /home/ec2-user/transplant-wizard/tc-website | server.js |

## Service Files

### transplant-backend.service
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

### transplant-main-website.service
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

### transplant-dusw-website.service
```ini
[Unit]
Description=Transplant Platform DUSW Portal
After=network.target

[Service]
Type=simple
User=ec2-user
WorkingDirectory=/home/ec2-user/transplant-wizard/dusw-website
Environment=NODE_ENV=production
Environment=PORT=3001
ExecStart=/usr/bin/node /home/ec2-user/transplant-wizard/dusw-website/server.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

### transplant-tc-website.service
```ini
[Unit]
Description=Transplant Platform TC Portal
After=network.target

[Service]
Type=simple
User=ec2-user
WorkingDirectory=/home/ec2-user/transplant-wizard/tc-website
Environment=NODE_ENV=production
Environment=PORT=3002
ExecStart=/usr/bin/node /home/ec2-user/transplant-wizard/tc-website/server.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

## Managing Services

### View Status
```bash
sudo systemctl status transplant-backend
sudo systemctl status transplant-main-website
sudo systemctl status transplant-dusw-website
sudo systemctl status transplant-tc-website

# View all transplant services
sudo systemctl list-units --type=service | grep transplant
```

### Start/Stop/Restart
```bash
# Restart a single service
sudo systemctl restart transplant-backend

# Stop a service
sudo systemctl stop transplant-backend

# Start a service
sudo systemctl start transplant-backend

# Restart all services
sudo systemctl restart transplant-backend transplant-main-website transplant-dusw-website transplant-tc-website
```

### View Logs
```bash
# View recent logs
sudo journalctl -u transplant-backend -n 100

# Follow logs in real-time
sudo journalctl -u transplant-backend -f

# View logs since boot
sudo journalctl -u transplant-backend -b

# View logs from last hour
sudo journalctl -u transplant-backend --since "1 hour ago"
```

### Enable/Disable on Boot
```bash
# Enable service to start on boot
sudo systemctl enable transplant-backend

# Disable service from starting on boot
sudo systemctl disable transplant-backend
```

## Deployment Process

### 1. SSH into Server
```bash
ssh -i ~/.ssh/transplant-platform-key.pem ec2-user@3.215.185.174
```

### 2. Pull Latest Code
```bash
cd ~/transplant-wizard/backend-api
git pull origin main
```

### 3. Install Dependencies (if needed)
```bash
npm install
```

### 4. Restart Service
```bash
sudo systemctl restart transplant-backend
```

### 5. Verify Service is Running
```bash
sudo systemctl status transplant-backend
curl http://localhost:3004/health
```

## Creating New Services

To create a new systemd service:

### 1. Create Service File
```bash
sudo nano /etc/systemd/system/my-new-service.service
```

### 2. Add Configuration
```ini
[Unit]
Description=My New Service
After=network.target

[Service]
Type=simple
User=ec2-user
WorkingDirectory=/home/ec2-user/transplant-wizard/my-new-service
Environment=NODE_ENV=production
Environment=PORT=3005
ExecStart=/usr/bin/node /home/ec2-user/transplant-wizard/my-new-service/server.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

### 3. Reload Systemd
```bash
sudo systemctl daemon-reload
```

### 4. Enable and Start
```bash
sudo systemctl enable my-new-service
sudo systemctl start my-new-service
```

## Troubleshooting

### Service Won't Start
```bash
# Check for syntax errors in service file
sudo systemd-analyze verify /etc/systemd/system/transplant-backend.service

# Check detailed status
sudo systemctl status transplant-backend -l

# Check if port is in use
sudo lsof -i :3004
sudo fuser -k 3004/tcp  # Kill process on port
```

### Permission Issues
```bash
# Ensure correct ownership
sudo chown -R ec2-user:ec2-user /home/ec2-user/transplant-wizard

# Check file permissions
ls -la /home/ec2-user/transplant-wizard/backend-api/src/
```

### Node.js Issues
```bash
# Check Node.js version
node --version

# Check if node is in path
which node

# Verify script runs manually
cd /home/ec2-user/transplant-wizard/backend-api
node src/simple-auth-server.js
```
