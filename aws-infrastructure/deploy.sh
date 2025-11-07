#!/bin/bash

# Transplant Platform - AWS Infrastructure Deployment Script
# HIPAA-Compliant Infrastructure Deployment

set -e  # Exit on any error

# Configuration
PROJECT_NAME="transplant-platform"
AWS_REGION="us-east-1"
DB_PASSWORD=""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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

# Function to check if AWS CLI is configured
check_aws_cli() {
    print_status "Checking AWS CLI configuration..."
    
    if ! command -v aws &> /dev/null; then
        print_error "AWS CLI is not installed. Please install it first."
        exit 1
    fi
    
    if ! aws sts get-caller-identity &> /dev/null; then
        print_error "AWS CLI is not configured or credentials are invalid."
        exit 1
    fi
    
    print_success "AWS CLI is properly configured"
}

# Function to generate a secure database password
generate_db_password() {
    if [ -z "$DB_PASSWORD" ]; then
        print_status "Generating secure database password..."
        DB_PASSWORD=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-20)
        print_success "Database password generated"
        print_warning "IMPORTANT: Save this password securely: $DB_PASSWORD"
    fi
}

# Function to deploy CloudFormation stack
deploy_stack() {
    local stack_name=$1
    local template_file=$2
    local parameters=$3
    
    print_status "Deploying stack: $stack_name"
    
    if aws cloudformation describe-stacks --stack-name "$stack_name" --region "$AWS_REGION" &> /dev/null; then
        print_status "Stack $stack_name exists, updating..."
        aws cloudformation update-stack \
            --stack-name "$stack_name" \
            --template-body file://"$template_file" \
            --parameters "$parameters" \
            --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM \
            --region "$AWS_REGION"
    else
        print_status "Creating new stack: $stack_name"
        aws cloudformation create-stack \
            --stack-name "$stack_name" \
            --template-body file://"$template_file" \
            --parameters "$parameters" \
            --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM \
            --region "$AWS_REGION"
    fi
    
    print_status "Waiting for stack $stack_name to complete..."
    aws cloudformation wait stack-create-complete --stack-name "$stack_name" --region "$AWS_REGION" 2>/dev/null || \
    aws cloudformation wait stack-update-complete --stack-name "$stack_name" --region "$AWS_REGION"
    
    print_success "Stack $stack_name deployed successfully"
}

# Function to get stack outputs
get_stack_outputs() {
    local stack_name=$1
    aws cloudformation describe-stacks \
        --stack-name "$stack_name" \
        --region "$AWS_REGION" \
        --query 'Stacks[0].Outputs' \
        --output table
}

# Main deployment function
main() {
    print_status "Starting HIPAA-Compliant Infrastructure Deployment"
    print_status "Project: $PROJECT_NAME"
    print_status "Region: $AWS_REGION"
    echo
    
    # Pre-deployment checks
    check_aws_cli
    generate_db_password
    
    echo
    print_warning "IMPORTANT: This deployment will create AWS resources that may incur costs."
    read -p "Do you want to continue? (yes/no): " -r
    if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
        print_status "Deployment cancelled"
        exit 0
    fi
    
    echo
    print_status "==== Phase 1: VPC and Networking ===="
    deploy_stack \
        "$PROJECT_NAME-vpc" \
        "01-vpc-networking.yaml" \
        "ParameterKey=ProjectName,ParameterValue=$PROJECT_NAME"
    
    echo
    print_status "==== Phase 2: RDS Database ===="
    deploy_stack \
        "$PROJECT_NAME-database" \
        "02-rds-database.yaml" \
        "ParameterKey=ProjectName,ParameterValue=$PROJECT_NAME ParameterKey=DBUsername,ParameterValue=transplant_admin ParameterKey=DBPassword,ParameterValue=$DB_PASSWORD"
    
    echo
    print_status "==== Phase 3: Cognito Authentication ===="
    deploy_stack \
        "$PROJECT_NAME-auth" \
        "03-cognito-auth.yaml" \
        "ParameterKey=ProjectName,ParameterValue=$PROJECT_NAME"
    
    echo
    print_status "==== Phase 4: S3 Storage ===="
    deploy_stack \
        "$PROJECT_NAME-storage" \
        "04-s3-storage.yaml" \
        "ParameterKey=ProjectName,ParameterValue=$PROJECT_NAME"
    
    echo
    print_success "==== Deployment Complete! ===="
    
    # Display important outputs
    echo
    print_status "==== Important Information ===="
    echo "Database Password: $DB_PASSWORD"
    echo "SAVE THIS PASSWORD SECURELY - IT WILL NOT BE SHOWN AGAIN"
    echo
    
    print_status "VPC Stack Outputs:"
    get_stack_outputs "$PROJECT_NAME-vpc"
    echo
    
    print_status "Database Stack Outputs:"
    get_stack_outputs "$PROJECT_NAME-database"
    echo
    
    print_status "Authentication Stack Outputs:"
    get_stack_outputs "$PROJECT_NAME-auth"
    echo
    
    print_status "Storage Stack Outputs:"
    get_stack_outputs "$PROJECT_NAME-storage"
    echo
    
    print_status "Next Steps:"
    echo "1. Set up SES email verification (see setup instructions)"
    echo "2. Update application configuration with the output values"
    echo "3. Deploy your backend API to use these resources"
    echo "4. Test the infrastructure with your applications"
    
    print_success "Infrastructure deployment completed successfully!"
}

# Run main function
main "$@"