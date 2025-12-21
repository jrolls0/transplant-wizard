# RDS Module Outputs

output "endpoint" {
  description = "RDS endpoint address"
  value       = aws_db_instance.main.address
}

output "port" {
  description = "RDS port"
  value       = aws_db_instance.main.port
}

output "identifier" {
  description = "RDS instance identifier"
  value       = aws_db_instance.main.identifier
}

output "arn" {
  description = "ARN of the RDS instance"
  value       = aws_db_instance.main.arn
}

output "db_name" {
  description = "Name of the database"
  value       = aws_db_instance.main.db_name
}

output "db_subnet_group_name" {
  description = "Name of the DB subnet group"
  value       = aws_db_subnet_group.main.name
}
