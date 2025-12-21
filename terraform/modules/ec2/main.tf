# EC2 Module
# Creates EC2 instance for running Node.js services

resource "aws_instance" "main" {
  ami                    = var.ami_id
  instance_type          = var.instance_type
  key_name               = var.key_name
  subnet_id              = var.subnet_id
  vpc_security_group_ids = var.security_group_ids
  iam_instance_profile   = var.iam_instance_profile

  # Enable IMDSv2 (recommended for security)
  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 2
  }

  root_block_device {
    volume_type           = "gp3"
    volume_size           = 8
    delete_on_termination = true
    encrypted             = false  # Consider enabling encryption in production
  }

  # User data script to set up the instance
  user_data = <<-EOF
    #!/bin/bash
    # Update system packages
    yum update -y

    # Install Node.js 20.x
    curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
    yum install -y nodejs git

    # Install PM2 globally (optional, since we use systemd)
    npm install -g pm2

    # Create application directory
    mkdir -p /home/ec2-user/transplant-wizard
    chown -R ec2-user:ec2-user /home/ec2-user/transplant-wizard
  EOF

  tags = {
    Name = "${var.project_name}-server"
  }

  lifecycle {
    # Prevent accidental destruction
    prevent_destroy = false  # Set to true in production
  }
}

# Optional: Elastic IP for consistent public IP
# Uncomment if you want a static IP that persists across instance stop/start
# resource "aws_eip" "main" {
#   instance = aws_instance.main.id
#   domain   = "vpc"
#
#   tags = {
#     Name = "${var.project_name}-eip"
#   }
# }
