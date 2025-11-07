#!/bin/bash

# TransplantWizard - Service Health Monitor
# This script checks if all services are running and restarts them if needed

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to check if a port is responding
check_service_health() {
    local name=$1
    local port=$2
    local url=$3
    
    echo -e "${BLUE}Checking $name health...${NC}"
    
    # Check if port is listening
    if ! lsof -Pi :$port -sTCP:LISTEN -t >/dev/null; then
        echo -e "${RED}❌ $name is not running (port $port not listening)${NC}"
        return 1
    fi
    
    # Check if service responds to HTTP request
    if curl -sf http://localhost:$port >/dev/null; then
        echo -e "${GREEN}✅ $name is healthy${NC}"
        if [ ! -z "$url" ]; then
            echo -e "   🌐 Public URL: $url"
        fi
        return 0
    else
        echo -e "${RED}❌ $name port is open but not responding to HTTP${NC}"
        return 1
    fi
}

# Function to check cloudflare tunnel
check_tunnel_health() {
    echo -e "${BLUE}Checking Cloudflare Tunnel...${NC}"
    
    if ! pgrep -f "cloudflared tunnel run" >/dev/null; then
        echo -e "${RED}❌ Cloudflare tunnel is not running${NC}"
        return 1
    fi
    
    # Test if tunnel is accessible from outside
    if curl -sf --max-time 10 https://transplantwizard.com >/dev/null; then
        echo -e "${GREEN}✅ Cloudflare tunnel is healthy${NC}"
        echo -e "   🌐 External access confirmed"
        return 0
    else
        echo -e "${YELLOW}⚠️  Cloudflare tunnel process running but external access may be limited${NC}"
        return 1
    fi
}

echo -e "${YELLOW}🔍 TransplantWizard Service Health Check${NC}"
echo "========================================"
echo "$(date)"
echo ""

# Check all services
main_healthy=$(check_service_health "Main Website" 3001 "https://transplantwizard.com" && echo "true" || echo "false")
dusw_healthy=$(check_service_health "DUSW Portal" 3002 "https://dusw.transplantwizard.com" && echo "true" || echo "false")
tc_healthy=$(check_service_health "TC Portal" 3003 "https://tc.transplantwizard.com" && echo "true" || echo "false")
tunnel_healthy=$(check_tunnel_health && echo "true" || echo "false")

echo ""
echo -e "${YELLOW}📊 Summary:${NC}"
echo "============"

if [ "$main_healthy" = "true" ]; then
    echo -e "${GREEN}✅ Main Website${NC}"
else
    echo -e "${RED}❌ Main Website${NC}"
fi

if [ "$dusw_healthy" = "true" ]; then
    echo -e "${GREEN}✅ DUSW Portal${NC}"
else
    echo -e "${RED}❌ DUSW Portal${NC}"
fi

if [ "$tc_healthy" = "true" ]; then
    echo -e "${GREEN}✅ TC Portal${NC}"
else
    echo -e "${RED}❌ TC Portal${NC}"
fi

if [ "$tunnel_healthy" = "true" ]; then
    echo -e "${GREEN}✅ Cloudflare Tunnel${NC}"
else
    echo -e "${RED}❌ Cloudflare Tunnel${NC}"
fi

# Check if any services need attention
if [ "$main_healthy" = "false" ] || [ "$dusw_healthy" = "false" ] || [ "$tc_healthy" = "false" ] || [ "$tunnel_healthy" = "false" ]; then
    echo ""
    echo -e "${RED}⚠️  Some services need attention!${NC}"
    echo -e "${YELLOW}💡 To restart all services, run: ./start-all-services.sh${NC}"
    exit 1
else
    echo ""
    echo -e "${GREEN}🎉 All services are healthy!${NC}"
    exit 0
fi