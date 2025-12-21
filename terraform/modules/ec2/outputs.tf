# EC2 Module Outputs

output "instance_id" {
  description = "ID of the EC2 instance"
  value       = aws_instance.main.id
}

output "public_ip" {
  description = "Public IP address of the instance"
  value       = aws_instance.main.public_ip
}

output "private_ip" {
  description = "Private IP address of the instance"
  value       = aws_instance.main.private_ip
}

output "public_dns" {
  description = "Public DNS name of the instance"
  value       = aws_instance.main.public_dns
}

output "private_dns" {
  description = "Private DNS name of the instance"
  value       = aws_instance.main.private_dns
}

output "arn" {
  description = "ARN of the instance"
  value       = aws_instance.main.arn
}
