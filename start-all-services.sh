#!/bin/bash

# TransplantWizard - Service Startup Script
# This script starts all required services: web servers and cloudflare tunnel

set -e  # Exit on any error

echo "🚀 Starting TransplantWizard Services..."

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Base directory
BASE_DIR="/Users/jeremy/Downloads/Shakir-ClaudeCode"

# Function to check if a port is in use
check_port() {
    local port=$1
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null; then
        return 0  # Port is in use
    else
        return 1  # Port is available
    fi
}

# Function to start a service
start_service() {
    local name=$1
    local directory=$2
    local port=$3
    local command=$4

    echo -e "${BLUE}Checking $name (port $port)...${NC}"
    
    if check_port $port; then
        echo -e "${GREEN}✅ $name is already running on port $port${NC}"
    else
        echo -e "${YELLOW}🔄 Starting $name...${NC}"
        cd "$BASE_DIR/$directory"
        
        # Start the service in the background
        nohup $command > /dev/null 2>&1 &
        local pid=$!
        
        # Wait a moment for the service to start
        sleep 2
        
        if check_port $port; then
            echo -e "${GREEN}✅ $name started successfully on port $port (PID: $pid)${NC}"
        else
            echo -e "${RED}❌ Failed to start $name${NC}"
            return 1
        fi
    fi
}

# Function to start cloudflare tunnel
start_tunnel() {
    echo -e "${BLUE}Checking Cloudflare Tunnel...${NC}"
    
    if pgrep -f "cloudflared tunnel run" >/dev/null; then
        echo -e "${GREEN}✅ Cloudflare tunnel is already running${NC}"
    else
        echo -e "${YELLOW}🔄 Starting Cloudflare tunnel...${NC}"
        nohup cloudflared tunnel run dusw-portal > /dev/null 2>&1 &
        local pid=$!
        
        # Wait for tunnel to establish connections
        sleep 5
        
        if pgrep -f "cloudflared tunnel run" >/dev/null; then
            echo -e "${GREEN}✅ Cloudflare tunnel started successfully (PID: $pid)${NC}"
        else
            echo -e "${RED}❌ Failed to start Cloudflare tunnel${NC}"
            return 1
        fi
    fi
}

echo -e "${YELLOW}📋 Service Status Check & Startup${NC}"
echo "================================="

# Start all services
start_service "Main Website" "main-website" 3001 "node server.js"
start_service "DUSW Portal" "dusw-website" 3002 "node server.js"  
start_service "TC Portal" "tc-website" 3003 "node server.js"

# Start cloudflare tunnel
start_tunnel

echo ""
echo -e "${GREEN}🎉 All services started successfully!${NC}"
echo ""
echo -e "${BLUE}📝 Service URLs:${NC}"
echo "• Main Website: https://transplantwizard.com"
echo "• DUSW Portal: https://dusw.transplantwizard.com" 
echo "• TC Portal: https://tc.transplantwizard.com"
echo ""
echo -e "${YELLOW}🔍 To check service status: ps aux | grep -E '(node|cloudflared)'${NC}"
echo -e "${YELLOW}🛑 To stop services: pkill -f 'node server.js' && pkill -f 'cloudflared'${NC}"