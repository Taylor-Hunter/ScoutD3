#!/bin/bash
# ScoutD3 Update Script
# This script handles updates to my production ScoutD3 system

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}Starting ScoutD3 update process...${NC}"

# Create backup before update
echo -e "${YELLOW}Creating backup before update...${NC}"
./scripts/backup.sh

# Pull latest changes
echo -e "${YELLOW}Pulling latest code changes...${NC}"
git pull origin main

# Rebuild and restart services
echo -e "${YELLOW}Rebuilding services...${NC}"
docker-compose -f docker-compose.prod.yml build --no-cache

# Stop services for update
echo -e "${YELLOW}Stopping services for update...${NC}"
docker-compose -f docker-compose.prod.yml down

# Start updated services
echo -e "${YELLOW}Starting updated services...${NC}"
docker-compose -f docker-compose.prod.yml up -d

# Wait for services to be ready
sleep 30

# Run any pending migrations
echo -e "${YELLOW}Running database migrations...${NC}"
docker-compose -f docker-compose.prod.yml exec -T backend python -m alembic upgrade head

# Health check
echo -e "${YELLOW}Performing health check...${NC}"
if curl -f http://localhost/api/health > /dev/null 2>&1; then
    echo -e "${GREEN}✓ ScoutD3 update completed successfully!${NC}"
else
    echo -e "${RED}✗ Health check failed after update${NC}"
    echo "Check the logs for issues:"
    docker-compose -f docker-compose.prod.yml logs --tail 20
    exit 1
fi