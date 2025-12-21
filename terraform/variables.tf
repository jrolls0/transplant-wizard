# Transplant Wizard Infrastructure Variables
#
# These variables define the configuration for all AWS resources.
# Override these in terraform.tfvars or via environment variables.

# General
variable "project_name" {
  description = "Name of the project, used for resource naming"
  type        = string
  default     = "transplant-platform"
}

variable "environment" {
  description = "Environment name (e.g., prod, staging, dev)"
  type        = string
  default     = "prod"
}

variable "aws_region" {
  description = "AWS region for all resources"
  type        = string
  default     = "us-east-1"
}

# VPC Configuration
variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "availability_zones" {
  description = "List of availability zones to use"
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b"]
}

variable "public_subnets" {
  description = "CIDR blocks for public subnets"
  type        = list(string)
  default     = ["10.0.1.0/24", "10.0.2.0/24"]
}

variable "private_subnets" {
  description = "CIDR blocks for private subnets"
  type        = list(string)
  default     = ["10.0.3.0/24", "10.0.4.0/24"]
}

# EC2 Configuration
variable "ec2_instance_type" {
  description = "EC2 instance type"
  type        = string
  default     = "t3.micro"
}

variable "ec2_ami_id" {
  description = "AMI ID for EC2 instance (Amazon Linux 2023)"
  type        = string
  default     = "ami-0453ec754f44f9a4a"  # Amazon Linux 2023 in us-east-1
}

variable "ec2_key_name" {
  description = "Name of the SSH key pair"
  type        = string
  default     = "transplant-platform-key"
}

# RDS Configuration
variable "rds_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t3.micro"
}

variable "rds_allocated_storage" {
  description = "Allocated storage in GB for RDS"
  type        = number
  default     = 20
}

variable "rds_engine_version" {
  description = "PostgreSQL engine version"
  type        = string
  default     = "17.4"
}

variable "rds_db_name" {
  description = "Name of the database to create"
  type        = string
  default     = "transplant_platform"
}

variable "rds_username" {
  description = "Master username for RDS"
  type        = string
  default     = "transplant_admin"
}

variable "rds_password" {
  description = "Master password for RDS (sensitive)"
  type        = string
  sensitive   = true
}

variable "rds_publicly_accessible" {
  description = "Whether RDS should be publicly accessible"
  type        = bool
  default     = true  # Set to false for production best practices
}

# SES Configuration
variable "ses_domain" {
  description = "Domain for SES email sending"
  type        = string
  default     = "transplantwizard.com"
}
