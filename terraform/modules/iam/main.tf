# IAM Module
# Creates IAM roles and instance profiles for EC2

# IAM Role for EC2 to access SES
resource "aws_iam_role" "ec2_ses_role" {
  name = "${var.project_name}-backend-ses-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = {
    Name = "${var.project_name}-backend-ses-role"
  }
}

# Attach SES Full Access policy to the role
resource "aws_iam_role_policy_attachment" "ses_full_access" {
  role       = aws_iam_role.ec2_ses_role.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSESFullAccess"
}

# Instance Profile for EC2
resource "aws_iam_instance_profile" "ec2_profile" {
  name = "${var.project_name}-backend-ses-role"
  role = aws_iam_role.ec2_ses_role.name
}
