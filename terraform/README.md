# Transplant Wizard Infrastructure

This Terraform configuration manages the complete AWS infrastructure for the Transplant Wizard platform.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                          VPC (10.0.0.0/16)                       │
│  ┌─────────────────────────┐  ┌─────────────────────────────┐   │
│  │   Public Subnet 1       │  │   Public Subnet 2           │   │
│  │   (10.0.1.0/24)         │  │   (10.0.2.0/24)             │   │
│  │   us-east-1a            │  │   us-east-1b                │   │
│  │   ┌─────────────────┐   │  │                             │   │
│  │   │   EC2 Instance  │   │  │                             │   │
│  │   │   (t3.micro)    │   │  │                             │   │
│  │   │   Node.js Apps  │   │  │                             │   │
│  │   └─────────────────┘   │  │                             │   │
│  └─────────────────────────┘  └─────────────────────────────┘   │
│                                                                  │
│  ┌─────────────────────────┐  ┌─────────────────────────────┐   │
│  │   Private Subnet 1      │  │   Private Subnet 2          │   │
│  │   (10.0.3.0/24)         │  │   (10.0.4.0/24)             │   │
│  │   us-east-1a            │  │   us-east-1b                │   │
│  │                         │  │   ┌─────────────────┐       │   │
│  │                         │  │   │  RDS PostgreSQL │       │   │
│  │                         │  │   │  (db.t3.micro)  │       │   │
│  │                         │  │   └─────────────────┘       │   │
│  └─────────────────────────┘  └─────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ Internet Gateway
                              ▼
                    ┌─────────────────┐
                    │   Cloudflare    │
                    │   (DNS/Proxy)   │
                    └─────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │   AWS SES       │
                    │   (Email)       │
                    └─────────────────┘
```

## Resources Created

| Resource | Description |
|----------|-------------|
| VPC | 10.0.0.0/16 CIDR block |
| Public Subnets | 2 subnets for internet-facing resources |
| Private Subnets | 2 subnets for internal resources |
| Internet Gateway | Provides internet access to public subnets |
| EC2 Instance | t3.micro running Node.js applications |
| RDS PostgreSQL | db.t3.micro database instance |
| Security Groups | EC2 and RDS security groups |
| IAM Role | Allows EC2 to send emails via SES |
| SES Domain | Email sending configured for transplantwizard.com |

## Prerequisites

1. **AWS CLI** installed and configured
2. **Terraform** >= 1.0 installed
3. **SSH Key Pair** created in AWS (default: `transplant-platform-key`)

## Quick Start

### 1. Initialize Terraform

```bash
cd terraform
terraform init
```

### 2. Create Configuration File

```bash
cp terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars` with your values:

```hcl
rds_password = "your-secure-password-here"
```

### 3. Preview Changes

```bash
terraform plan
```

### 4. Apply Infrastructure

```bash
terraform apply
```

### 5. Get Outputs

```bash
terraform output
```

## Importing Existing Resources

If you have existing AWS resources, you can import them into Terraform state:

```bash
# Import VPC
terraform import module.vpc.aws_vpc.main vpc-00c38e269fb7969f9

# Import EC2 Instance
terraform import module.ec2.aws_instance.main i-01ccb106fd09c4e58

# Import RDS
terraform import module.rds.aws_db_instance.main transplant-platform-db

# Import Security Groups
terraform import module.security_groups.aws_security_group.ec2 sg-086b17e6bed8cd119
terraform import module.security_groups.aws_security_group.rds sg-05661f0da8ebd85ce
```

## Services Running on EC2

The EC2 instance runs 4 systemd services:

| Service | Port | Description |
|---------|------|-------------|
| transplant-backend | 3004 | Backend API (simple-auth-server.js) |
| transplant-main-website | 3000 | Main website |
| transplant-dusw-website | 3001 | DUSW (Social Worker) Portal |
| transplant-tc-website | 3002 | Transplant Center Portal |

### Managing Services

```bash
# SSH into the server
ssh -i ~/.ssh/transplant-platform-key.pem ec2-user@<EC2_PUBLIC_IP>

# Check service status
sudo systemctl status transplant-backend

# Restart a service
sudo systemctl restart transplant-backend

# View logs
sudo journalctl -u transplant-backend -f
```

## DNS Configuration (Cloudflare)

The following DNS records are managed in Cloudflare:

| Type | Name | Value | Proxied |
|------|------|-------|---------|
| A | @ | 3.215.185.174 | Yes |
| A | www | 3.215.185.174 | Yes |
| A | api | 3.215.185.174 | Yes |
| A | dusw | 3.215.185.174 | Yes |
| A | tc | 3.215.185.174 | Yes |
| CNAME | *._domainkey | *.dkim.amazonses.com | No |
| TXT | @ | v=spf1 include:amazonses.com ~all | - |
| TXT | _dmarc | v=DMARC1; p=quarantine; ... | - |

## Security Considerations

### Current Configuration (Development)
- RDS is publicly accessible (for development convenience)
- SSH open to 0.0.0.0/0
- Storage encryption disabled

### Production Recommendations
1. Set `rds_publicly_accessible = false`
2. Restrict SSH to specific IP ranges
3. Enable `storage_encrypted = true` for RDS
4. Enable `deletion_protection = true`
5. Set up proper backup retention
6. Enable Performance Insights and Enhanced Monitoring
7. Use AWS Secrets Manager for credentials
8. Enable Multi-AZ for RDS

## Cost Estimate

| Resource | Monthly Cost (approx) |
|----------|----------------------|
| EC2 t3.micro | ~$8 |
| RDS db.t3.micro | ~$15 |
| Data Transfer | Variable |
| **Total** | ~$25-30/month |

## Troubleshooting

### Terraform State Issues
```bash
# Refresh state
terraform refresh

# Force unlock (use with caution)
terraform force-unlock <LOCK_ID>
```

### EC2 Connection Issues
```bash
# Check security group rules
aws ec2 describe-security-groups --group-ids sg-086b17e6bed8cd119

# Check instance status
aws ec2 describe-instance-status --instance-ids i-01ccb106fd09c4e58
```

### RDS Connection Issues
```bash
# Test connection
psql -h <RDS_ENDPOINT> -U transplant_admin -d transplant_platform

# Check security group allows EC2
aws ec2 describe-security-groups --group-ids sg-05661f0da8ebd85ce
```

## File Structure

```
terraform/
├── main.tf                 # Root module, calls all sub-modules
├── variables.tf            # Input variables
├── outputs.tf              # Output values
├── terraform.tfvars.example # Example variable values
├── README.md               # This file
└── modules/
    ├── vpc/                # VPC, subnets, route tables
    ├── ec2/                # EC2 instance
    ├── rds/                # RDS PostgreSQL
    ├── ses/                # SES email configuration
    ├── security-groups/    # Security groups
    └── iam/                # IAM roles and policies
```
