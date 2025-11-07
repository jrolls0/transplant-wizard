#!/bin/bash

# Database Setup Script for Transplant Platform
# Sets up the PostgreSQL database with schema and seed data

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Database configuration from AWS RDS
DB_HOST="transplant-platform-db.c90ca0kcwjsh.us-east-1.rds.amazonaws.com"
DB_PORT="5432"
DB_NAME="postgres"  # Default database to connect to initially
DB_USER="transplant_admin"
DB_PASSWORD="WKAx9FEJACRunBPVCa5X"
TARGET_DB="transplant_platform"

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check if psql is installed
check_psql() {
    if ! command -v psql &> /dev/null; then
        print_error "PostgreSQL client (psql) is not installed."
        print_status "Install it with: brew install postgresql"
        exit 1
    fi
    print_success "PostgreSQL client found"
}

# Function to test database connectivity
test_connection() {
    print_status "Testing database connection..."
    
    if PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "SELECT version();" > /dev/null 2>&1; then
        print_success "Database connection successful"
        
        # Get database version
        DB_VERSION=$(PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -t -c "SELECT version();" | xargs)
        print_status "Connected to: $DB_VERSION"
    else
        print_error "Cannot connect to database"
        print_error "Please check:"
        print_error "- Database is running and accessible"
        print_error "- Credentials are correct"
        print_error "- Security groups allow connection"
        exit 1
    fi
}

# Function to create target database if it doesn't exist
create_target_database() {
    print_status "Checking if target database '$TARGET_DB' exists..."
    
    DB_EXISTS=$(PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -t -c "SELECT 1 FROM pg_database WHERE datname='$TARGET_DB';" | xargs)
    
    if [ "$DB_EXISTS" = "1" ]; then
        print_warning "Database '$TARGET_DB' already exists"
        read -p "Do you want to drop and recreate it? (yes/no): " -r
        if [[ $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
            print_status "Dropping existing database..."
            PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "DROP DATABASE IF EXISTS $TARGET_DB;"
            print_success "Existing database dropped"
        else
            print_status "Using existing database"
            return 0
        fi
    fi
    
    print_status "Creating target database '$TARGET_DB'..."
    PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "CREATE DATABASE $TARGET_DB;"
    print_success "Target database '$TARGET_DB' created"
}

# Function to run schema creation
setup_schema() {
    print_status "Setting up database schema..."
    
    if [ ! -f "schema.sql" ]; then
        print_error "Schema file 'schema.sql' not found"
        exit 1
    fi
    
    PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $TARGET_DB -f schema.sql
    
    if [ $? -eq 0 ]; then
        print_success "Database schema created successfully"
    else
        print_error "Failed to create database schema"
        exit 1
    fi
}

# Function to run seed data
setup_seed_data() {
    print_status "Loading seed data..."
    
    if [ ! -f "seed-data.sql" ]; then
        print_error "Seed data file 'seed-data.sql' not found"
        exit 1
    fi
    
    PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $TARGET_DB -f seed-data.sql
    
    if [ $? -eq 0 ]; then
        print_success "Seed data loaded successfully"
    else
        print_error "Failed to load seed data"
        exit 1
    fi
}

# Function to run validation tests
validate_setup() {
    print_status "Running validation tests..."
    
    # Test 1: Check table counts
    print_status "Checking table creation..."
    TABLE_COUNT=$(PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $TARGET_DB -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';" | xargs)
    print_status "Created $TABLE_COUNT tables"
    
    # Test 2: Check seed data
    print_status "Checking seed data..."
    CLINIC_COUNT=$(PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $TARGET_DB -t -c "SELECT COUNT(*) FROM dialysis_clinics;" | xargs)
    TRANSPLANT_COUNT=$(PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $TARGET_DB -t -c "SELECT COUNT(*) FROM transplant_centers;" | xargs)
    SW_COUNT=$(PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $TARGET_DB -t -c "SELECT COUNT(*) FROM social_workers;" | xargs)
    
    print_status "- Dialysis Clinics: $CLINIC_COUNT"
    print_status "- Transplant Centers: $TRANSPLANT_COUNT" 
    print_status "- Social Workers: $SW_COUNT"
    
    # Test 3: Check views
    print_status "Testing database views..."
    VIEW_TEST=$(PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $TARGET_DB -t -c "SELECT COUNT(*) FROM social_worker_details;" | xargs)
    print_status "- Social worker details view: $VIEW_TEST records"
    
    # Test 4: Check functions
    print_status "Testing database functions..."
    FUNCTION_TEST=$(PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $TARGET_DB -t -c "SELECT COUNT(*) FROM get_social_workers_by_clinic('Metro Health Dialysis Center');" | xargs)
    print_status "- Metro Health social workers: $FUNCTION_TEST"
    
    if [ "$CLINIC_COUNT" = "3" ] && [ "$TRANSPLANT_COUNT" = "10" ] && [ "$SW_COUNT" = "6" ]; then
        print_success "All validation tests passed!"
    else
        print_warning "Some validation tests failed - please check the output above"
    fi
}

# Function to display connection information
display_connection_info() {
    print_success "Database setup complete!"
    echo
    print_status "=== Connection Information ==="
    echo "Host: $DB_HOST"
    echo "Port: $DB_PORT"
    echo "Database: $TARGET_DB"
    echo "Username: $DB_USER"
    echo "Password: [SAVED SECURELY - USE ENVIRONMENT VARIABLES]"
    echo
    print_status "=== Connection String ==="
    echo "postgresql://$DB_USER:[PASSWORD]@$DB_HOST:$DB_PORT/$TARGET_DB"
    echo
    print_status "=== Environment Variables for Applications ==="
    echo "export DB_HOST=\"$DB_HOST\""
    echo "export DB_PORT=\"$DB_PORT\""
    echo "export DB_NAME=\"$TARGET_DB\""
    echo "export DB_USER=\"$DB_USER\""
    echo "export DB_PASSWORD=\"$DB_PASSWORD\""
    echo
    print_status "=== Manual Connection ==="
    echo "PGPASSWORD=\"$DB_PASSWORD\" psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $TARGET_DB"
}

# Function to create environment file
create_env_file() {
    print_status "Creating environment configuration file..."
    
    cat > .env << EOF
# Transplant Platform Database Configuration
# IMPORTANT: Keep this file secure and never commit to version control

# Database Connection
DB_HOST=$DB_HOST
DB_PORT=$DB_PORT
DB_NAME=$TARGET_DB
DB_USER=$DB_USER
DB_PASSWORD=$DB_PASSWORD

# AWS Configuration  
AWS_REGION=us-east-1
COGNITO_USER_POOL_ID=us-east-1_G8KcsbQN9
COGNITO_WEB_CLIENT_ID=2oar6llt1umls179aa9sr3c8cp
COGNITO_MOBILE_CLIENT_ID=77237jqj5neec39d2nr1bnauis
S3_BUCKET=transplant-platform-patient-docs-147997160304

# Application Settings
SESSION_TIMEOUT_MINUTES=30
MAX_TRANSPLANT_SELECTIONS=3
ROI_CONSENT_REQUIRED=true

# Development Settings
NODE_ENV=development
LOG_LEVEL=debug
EOF
    
    print_success "Environment file '.env' created"
    print_warning "Remember to add '.env' to your .gitignore file!"
}

# Main execution
main() {
    print_status "Starting Transplant Platform Database Setup"
    echo
    
    # Pre-flight checks
    check_psql
    
    # Database operations
    test_connection
    create_target_database
    setup_schema
    setup_seed_data
    validate_setup
    
    # Post-setup tasks
    create_env_file
    display_connection_info
    
    print_success "🎉 Database setup completed successfully!"
    print_status "Your HIPAA-compliant database is ready for application development."
}

# Run main function
main "$@"