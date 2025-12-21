# Security Groups Module Outputs

output "ec2_security_group_id" {
  description = "ID of the EC2 security group"
  value       = aws_security_group.ec2.id
}

output "ec2_security_group_name" {
  description = "Name of the EC2 security group"
  value       = aws_security_group.ec2.name
}

output "rds_security_group_id" {
  description = "ID of the RDS security group"
  value       = aws_security_group.rds.id
}

output "rds_security_group_name" {
  description = "Name of the RDS security group"
  value       = aws_security_group.rds.name
}
