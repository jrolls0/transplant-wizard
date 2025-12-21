# IAM Module Outputs

output "ec2_role_arn" {
  description = "ARN of the EC2 IAM role"
  value       = aws_iam_role.ec2_ses_role.arn
}

output "ec2_role_name" {
  description = "Name of the EC2 IAM role"
  value       = aws_iam_role.ec2_ses_role.name
}

output "ec2_instance_profile_name" {
  description = "Name of the EC2 instance profile"
  value       = aws_iam_instance_profile.ec2_profile.name
}

output "ec2_instance_profile_arn" {
  description = "ARN of the EC2 instance profile"
  value       = aws_iam_instance_profile.ec2_profile.arn
}
