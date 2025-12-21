# Transplant Wizard Infrastructure Outputs
#
# These outputs expose important resource information after deployment.

# VPC Outputs
output "vpc_id" {
  description = "ID of the VPC"
  value       = module.vpc.vpc_id
}

output "public_subnet_ids" {
  description = "IDs of public subnets"
  value       = module.vpc.public_subnet_ids
}

output "private_subnet_ids" {
  description = "IDs of private subnets"
  value       = module.vpc.private_subnet_ids
}

# EC2 Outputs
output "ec2_instance_id" {
  description = "ID of the EC2 instance"
  value       = module.ec2.instance_id
}

output "ec2_public_ip" {
  description = "Public IP address of the EC2 instance"
  value       = module.ec2.public_ip
}

output "ec2_public_dns" {
  description = "Public DNS name of the EC2 instance"
  value       = module.ec2.public_dns
}

# RDS Outputs
output "rds_endpoint" {
  description = "RDS database endpoint"
  value       = module.rds.endpoint
}

output "rds_port" {
  description = "RDS database port"
  value       = module.rds.port
}

# Security Group Outputs
output "ec2_security_group_id" {
  description = "ID of the EC2 security group"
  value       = module.security_groups.ec2_security_group_id
}

output "rds_security_group_id" {
  description = "ID of the RDS security group"
  value       = module.security_groups.rds_security_group_id
}

# SES Outputs
output "ses_domain_identity_arn" {
  description = "ARN of the SES domain identity"
  value       = module.ses.domain_identity_arn
}

output "ses_dkim_tokens" {
  description = "DKIM tokens for DNS configuration"
  value       = module.ses.dkim_tokens
}

# Connection Information
output "ssh_command" {
  description = "SSH command to connect to EC2 instance"
  value       = "ssh -i ~/.ssh/${var.ec2_key_name}.pem ec2-user@${module.ec2.public_ip}"
}

output "database_connection_string" {
  description = "PostgreSQL connection string (without password)"
  value       = "postgresql://${var.rds_username}@${module.rds.endpoint}:${module.rds.port}/${var.rds_db_name}"
  sensitive   = false
}
