# Transplant Wizard Infrastructure
# Terraform configuration for AWS resources
#
# This Terraform configuration manages the complete infrastructure for the
# Transplant Wizard platform including:
# - VPC with public/private subnets
# - EC2 instance running Node.js services
# - RDS PostgreSQL database
# - SES email configuration
# - Security groups and IAM roles

terraform {
  required_version = ">= 1.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.0"
    }
  }

  # Uncomment to use S3 backend for state storage (recommended for production)
  # backend "s3" {
  #   bucket         = "transplant-wizard-terraform-state"
  #   key            = "prod/terraform.tfstate"
  #   region         = "us-east-1"
  #   encrypt        = true
  #   dynamodb_table = "transplant-wizard-terraform-locks"
  # }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "transplant-wizard"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

# Cloudflare provider - uses CLOUDFLARE_API_TOKEN environment variable
provider "cloudflare" {
  # API token should be set via CLOUDFLARE_API_TOKEN environment variable
  # Or uncomment below and set in terraform.tfvars (not recommended)
  # api_token = var.cloudflare_api_token
}

# VPC and Networking
module "vpc" {
  source = "./modules/vpc"

  project_name       = var.project_name
  environment        = var.environment
  vpc_cidr           = var.vpc_cidr
  availability_zones = var.availability_zones
  public_subnets     = var.public_subnets
  private_subnets    = var.private_subnets
}

# Security Groups
module "security_groups" {
  source = "./modules/security-groups"

  project_name = var.project_name
  environment  = var.environment
  vpc_id       = module.vpc.vpc_id
}

# IAM Roles
module "iam" {
  source = "./modules/iam"

  project_name = var.project_name
  environment  = var.environment
}

# EC2 Instance
module "ec2" {
  source = "./modules/ec2"

  project_name          = var.project_name
  environment           = var.environment
  instance_type         = var.ec2_instance_type
  ami_id                = var.ec2_ami_id
  key_name              = var.ec2_key_name
  subnet_id             = module.vpc.public_subnet_ids[0]
  security_group_ids    = [module.security_groups.ec2_security_group_id]
  iam_instance_profile  = module.iam.ec2_instance_profile_name
}

# RDS PostgreSQL Database
module "rds" {
  source = "./modules/rds"

  project_name           = var.project_name
  environment            = var.environment
  instance_class         = var.rds_instance_class
  allocated_storage      = var.rds_allocated_storage
  engine_version         = var.rds_engine_version
  db_name                = var.rds_db_name
  db_username            = var.rds_username
  db_password            = var.rds_password
  subnet_ids             = module.vpc.private_subnet_ids
  vpc_security_group_ids = [module.security_groups.rds_security_group_id]
  publicly_accessible    = var.rds_publicly_accessible
}

# SES Email Configuration
module "ses" {
  source = "./modules/ses"

  domain = var.ses_domain
}

# Cloudflare DNS Configuration
module "cloudflare" {
  source = "./modules/cloudflare"

  domain          = var.cloudflare_domain
  ec2_public_ip   = module.ec2.public_ip
  ses_dkim_tokens = module.ses.dkim_tokens
}
