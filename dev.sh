#!/bin/bash
# PAN Development Script - Starts all services

echo "🔐 Starting PAN Development Environment"
echo "========================================"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check for bun
if ! command -v bun &> /dev/null; then
    echo -e "${RED}Error: bun is required but not installed.${NC}"
    exit 1
fi

# Install dependencies if needed
echo -e "${YELLOW}Installing dependencies...${NC}"
(cd signing-iframe && bun install --silent)
(cd main-app && bun install --silent)
(cd api-server && bun install --silent)

echo -e "${GREEN}Dependencies installed!${NC}"
echo ""

# Start services in background
echo -e "${YELLOW}Starting services...${NC}"
echo ""

# API Server (port 8080)
cd api-server
bun run dev &
API_PID=$!
cd ..

# Signing Iframe (port 3001)
cd signing-iframe
bun run dev &
SIGNING_PID=$!
cd ..

# Main App (port 3000)
cd main-app
bun run dev &
MAIN_PID=$!
cd ..

echo ""
echo -e "${GREEN}✅ All services started!${NC}"
echo ""
echo "📍 Access Points:"
echo "   Main App:      http://localhost:3000"
echo "   Signing Iframe: http://localhost:3001"
echo "   API Server:     http://localhost:8080"
echo ""
echo "Press Ctrl+C to stop all services"

# Wait for any process to exit
wait

# Cleanup
trap "kill $API_PID $SIGNING_PID $MAIN_PID 2>/dev/null" EXIT
