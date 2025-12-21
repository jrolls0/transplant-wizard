#!/bin/bash
# Import existing AWS resources into Terraform state
# Run this once to sync Terraform with existing infrastructure
#
# Prerequisites:
# 1. AWS credentials set (export AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY)
#    OR use: export AWS_PROFILE=transplant-admin
# 2. CLOUDFLARE_API_TOKEN set for DNS imports
# 3. terraform init already run

set -e

echo "=== Transplant Platform Terraform Import ==="
echo ""

# Check if terraform is initialized
if [ ! -d ".terraform" ]; then
    echo "Running terraform init..."
    terraform init
fi

echo "Importing VPC..."
terraform import module.vpc.aws_vpc.main vpc-00c38e269fb7969f9 || echo "VPC already imported or failed"

echo "Importing Internet Gateway..."
# Get IGW ID
IGW_ID=$(aws ec2 describe-internet-gateways --region us-east-1 --filters "Name=attachment.vpc-id,Values=vpc-00c38e269fb7969f9" --query 'InternetGateways[0].InternetGatewayId' --output text)
if [ "$IGW_ID" != "None" ] && [ -n "$IGW_ID" ]; then
    terraform import module.vpc.aws_internet_gateway.main $IGW_ID || echo "IGW already imported or failed"
fi

echo "Importing Public Subnets..."
terraform import 'module.vpc.aws_subnet.public[0]' subnet-0bc614bba1e6fa53d || echo "Public subnet 1 already imported or failed"
terraform import 'module.vpc.aws_subnet.public[1]' subnet-0bc9e10841c78b89c || echo "Public subnet 2 already imported or failed"

echo "Importing Private Subnets..."
terraform import 'module.vpc.aws_subnet.private[0]' subnet-09d3f0f1c1dc81d56 || echo "Private subnet 1 already imported or failed"
terraform import 'module.vpc.aws_subnet.private[1]' subnet-057e8ab3833f3b2aa || echo "Private subnet 2 already imported or failed"

echo "Importing Security Groups..."
terraform import module.security_groups.aws_security_group.ec2 sg-086b17e6bed8cd119 || echo "EC2 SG already imported or failed"
terraform import module.security_groups.aws_security_group.rds sg-05661f0da8ebd85ce || echo "RDS SG already imported or failed"

echo "Importing EC2 Instance..."
terraform import module.ec2.aws_instance.main i-01ccb106fd09c4e58 || echo "EC2 already imported or failed"

echo "Importing RDS Instance..."
terraform import module.rds.aws_db_instance.main transplant-platform-db || echo "RDS already imported or failed"

echo ""
echo "=== Import Complete ==="
echo ""
echo "Run 'terraform plan' to see if there are any differences"
echo "between the actual infrastructure and your Terraform config."
