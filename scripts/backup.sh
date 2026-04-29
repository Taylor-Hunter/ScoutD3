#!/bin/bash
# ScoutD3 Backup Script
# This script creates backups of my scouting system database and reports

set -e

# Configuration
BACKUP_DIR="/opt/scoutd3/backups"
DATE=$(date +"%Y%m%d_%H%M%S")
RETENTION_DAYS=30

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}Starting ScoutD3 backup process...${NC}"

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Database backup
echo -e "${YELLOW}Creating database backup...${NC}"
docker-compose -f docker-compose.prod.yml exec -T postgres pg_dump -U scoutd3_user scoutd3_prod > "$BACKUP_DIR/database_$DATE.sql"

# Reports backup
echo -e "${YELLOW}Backing up generated reports...${NC}"
tar -czf "$BACKUP_DIR/reports_$DATE.tar.gz" -C ./backend/reports .

# Configuration backup
echo -e "${YELLOW}Backing up configuration...${NC}"
cp .env.prod "$BACKUP_DIR/config_$DATE.env"

# Clean old backups
echo -e "${YELLOW}Cleaning old backups (keeping last $RETENTION_DAYS days)...${NC}"
find "$BACKUP_DIR" -name "*_*.sql" -mtime +$RETENTION_DAYS -delete
find "$BACKUP_DIR" -name "*_*.tar.gz" -mtime +$RETENTION_DAYS -delete
find "$BACKUP_DIR" -name "*_*.env" -mtime +$RETENTION_DAYS -delete

echo -e "${GREEN}Backup completed successfully!${NC}"
echo "Backup files created:"
echo "  - Database: database_$DATE.sql"
echo "  - Reports: reports_$DATE.tar.gz"
echo "  - Config: config_$DATE.env"