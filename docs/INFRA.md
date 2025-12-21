# Infrastructure Documentation

## Overview

Infrastructure is managed via Terraform and deployed on AWS with Cloudflare for DNS/CDN.

**For detailed Terraform documentation, see**: `terraform/README.md`

## AWS Resources

### Account Information
- **AWS Account ID**: `126279420316`
- **Region**: `us-east-1`

### VPC Configuration
- **VPC ID**: `vpc-00c38e269fb7969f9`
- **CIDR Block**: `10.0.0.0/16`

| Subnet Type | CIDR | Availability Zone |
|-------------|------|-------------------|
| Public 1 | 10.0.1.0/24 | us-east-1a |
| Public 2 | 10.0.2.0/24 | us-east-1b |
| Private 1 | 10.0.3.0/24 | us-east-1a |
| Private 2 | 10.0.4.0/24 | us-east-1b |

### EC2 Instance
| Property | Value |
|----------|-------|
| Instance ID | `i-01ccb106fd09c4e58` |
| Instance Type | `t3.micro` |
| AMI | Amazon Linux 2023 (`ami-0453ec754f44f9a4a`) |
| Public IP | `3.215.185.174` |
| Key Pair | `transplant-platform-key` |
| Security Group | `sg-086b17e6bed8cd119` |
| Subnet | Public Subnet 1 (us-east-1a) |

### RDS PostgreSQL
| Property | Value |
|----------|-------|
| Instance Identifier | `transplant-platform-db` |
| Instance Class | `db.t3.micro` |
| Engine Version | PostgreSQL 17.4 |
| Endpoint | `transplant-platform-db.cibqsuyys3wn.us-east-1.rds.amazonaws.com` |
| Port | `5432` |
| Database Name | `postgres` |
| Master Username | `transplant_admin` |
| Storage | 20 GB |
| Publicly Accessible | Yes (for development) |
| Backup Retention | 7 days |
| Backup Window | 07:01-07:31 UTC |
| Deletion Protection | **Disabled** |
| Storage Encryption | **Disabled** |
| Security Group | `sg-05661f0da8ebd85ce` |

### Security Groups

#### EC2 Security Group (`sg-086b17e6bed8cd119`)

| Type | Port | Source | Description |
|------|------|--------|-------------|
| Inbound | 22 | 0.0.0.0/0 | SSH |
| Inbound | 80 | 0.0.0.0/0 | HTTP |
| Inbound | 443 | 0.0.0.0/0 | HTTPS |
| Inbound | 3000-3004 | 0.0.0.0/0 | Node.js apps |
| Outbound | All | 0.0.0.0/0 | All traffic |

#### RDS Security Group (`sg-05661f0da8ebd85ce`)

| Type | Port | Source | Description |
|------|------|--------|-------------|
| Inbound | 5432 | EC2 SG | PostgreSQL from EC2 |
| Inbound | 5432 | 0.0.0.0/0 | PostgreSQL (dev access) |
| Outbound | All | 0.0.0.0/0 | All traffic |

### IAM Configuration

**EC2 Instance Profile**: `transplant-platform-ec2-profile`
**IAM Role**: `transplant-platform-ec2-role`

**Permissions**:
- `ses:SendEmail` - Send emails via SES
- `ses:SendRawEmail` - Send raw emails
- CloudWatch Logs (for logging)

### SES (Simple Email Service)

| Property | Value |
|----------|-------|
| Domain | `transplantwizard.com` |
| Verified | Yes |
| Mode | Sandbox (dev) / Production ready |
| From Email | `noreply@transplantwizard.com` |

**DKIM Records**: 3 CNAME records for email authentication
**SPF Record**: `v=spf1 include:amazonses.com ~all`
**DMARC Record**: `v=DMARC1; p=quarantine; rua=mailto:privacy@transplantwizard.com`

## Cloudflare Configuration

### Zone Information
- **Domain**: `transplantwizard.com`
- **DNS Provider**: Cloudflare
- **Proxy Status**: Enabled (orange cloud)

### DNS Records

| Type | Name | Content | Proxied | TTL |
|------|------|---------|---------|-----|
| A | @ | 3.215.185.174 | Yes | Auto |
| A | www | 3.215.185.174 | Yes | Auto |
| A | api | 3.215.185.174 | Yes | Auto |
| A | dusw | 3.215.185.174 | Yes | Auto |
| A | tc | 3.215.185.174 | Yes | Auto |
| CNAME | *._domainkey | *.dkim.amazonses.com | No | Auto |
| TXT | @ | v=spf1 include:amazonses.com ~all | - | Auto |
| TXT | _dmarc | v=DMARC1; p=quarantine; ... | - | Auto |
| TXT | mail | v=spf1 include:amazonses.com ~all | - | Auto |
| MX | mail | feedback-smtp.us-east-1.amazonses.com | - | Auto |

### SSL/TLS Settings
- **Mode**: Full (strict)
- **Certificate**: Cloudflare Universal SSL
- **EC2 Certificate**: Self-signed (Cloudflare terminates SSL)

## Terraform Structure

```
terraform/
├── main.tf                 # Root module, provider config
├── variables.tf            # Input variables
├── outputs.tf              # Output values
├── terraform.tfvars.example # Example variable values
├── .terraform.lock.hcl     # Provider lock file
└── modules/
    ├── vpc/                # VPC, subnets, route tables
    ├── ec2/                # EC2 instance
    ├── rds/                # RDS PostgreSQL
    ├── ses/                # SES email configuration
    ├── security-groups/    # Security groups
    ├── iam/                # IAM roles and policies
    └── cloudflare/         # Cloudflare DNS records
```

### Terraform Commands

```bash
cd terraform

# Initialize (first time or after provider changes)
terraform init

# Preview changes
terraform plan

# Apply changes
terraform apply

# Destroy (careful!)
terraform destroy
```

### Required Environment Variables

```bash
# AWS credentials (use AWS CLI profile or environment)
export AWS_PROFILE=Jeremy
# OR
export AWS_ACCESS_KEY_ID=<key>
export AWS_SECRET_ACCESS_KEY=<secret>

# Cloudflare API token
export CLOUDFLARE_API_TOKEN=<token>
```

### Importing Existing Resources

If resources exist but aren't in Terraform state:

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

## Cost Estimate

| Resource | Monthly Cost (approx) |
|----------|----------------------|
| EC2 t3.micro | ~$8 |
| RDS db.t3.micro | ~$15 |
| Data Transfer | Variable |
| **Total** | ~$25-30/month |

## Production Security Recommendations

Current configuration is development-friendly. For production:

1. **RDS Access**:
   - Set `rds_publicly_accessible = false`
   - Remove 0.0.0.0/0 from RDS security group

2. **SSH Access**:
   - Restrict SSH to specific IP ranges
   - Consider using AWS Systems Manager Session Manager

3. **Encryption**:
   - Enable `storage_encrypted = true` for RDS
   - Enable deletion protection

4. **Backups**:
   - Configure automated RDS backups
   - Set appropriate retention period

5. **Monitoring**:
   - Enable RDS Performance Insights
   - Set up CloudWatch alarms

6. **Secrets Management**:
   - Migrate to AWS Secrets Manager
   - Remove hardcoded credentials from .env files

## Network Diagram

```
Internet
    │
    ▼
┌───────────────────────────────────────┐
│          Cloudflare CDN/Proxy         │
│  *.transplantwizard.com               │
│  - SSL termination                    │
│  - DDoS protection                    │
│  - Caching                            │
└───────────────────────────────────────┘
    │
    ▼
┌───────────────────────────────────────────────────────────────────┐
│                        VPC (10.0.0.0/16)                          │
│                                                                    │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │              Public Subnet (10.0.1.0/24)                    │  │
│  │                                                              │  │
│  │  ┌─────────────────────────────────────────────────────┐    │  │
│  │  │                 EC2 (t3.micro)                       │    │  │
│  │  │                 3.215.185.174                        │    │  │
│  │  │                                                      │    │  │
│  │  │  ┌─────────┐  ┌──────────────────────────────────┐ │    │  │
│  │  │  │  nginx  │  │     Node.js Services             │ │    │  │
│  │  │  │ :80/443 │──│  :3000 main-website              │ │    │  │
│  │  │  │         │  │  :3001 dusw-website              │ │    │  │
│  │  │  │         │  │  :3002 tc-website                │ │    │  │
│  │  │  │         │  │  :3004 backend-api               │ │    │  │
│  │  │  └─────────┘  └──────────────────────────────────┘ │    │  │
│  │  └─────────────────────────────────────────────────────┘    │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │              Private Subnet (10.0.3.0/24)                   │  │
│  │                                                              │  │
│  │  ┌─────────────────────────────────────────────────────┐    │  │
│  │  │              RDS PostgreSQL (db.t3.micro)            │    │  │
│  │  │  transplant-platform-db.c90ca0kcwjsh...             │    │  │
│  │  │  :5432                                               │    │  │
│  │  └─────────────────────────────────────────────────────┘    │  │
│  └─────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────┘
    │
    ▼
┌───────────────────────────────────────┐
│             AWS SES                    │
│  noreply@transplantwizard.com         │
└───────────────────────────────────────┘
```

## Verified Infrastructure Status (2025-12-21)

| Item | Status |
|------|--------|
| Terraform State | **Reference only** - existing resources not imported |
| RDS Backups | 7-day retention, 07:01-07:31 UTC window |
| CI/CD Pipeline | **None** - no GitHub workflows configured |

### Terraform Usage

The Terraform configs exist for documentation and future use, but the existing AWS resources were created outside Terraform. See `terraform/EXISTING_RESOURCES.md` for all resource IDs.

**For infrastructure changes**: Use AWS Console directly, then update `terraform/EXISTING_RESOURCES.md` with new resource IDs.

### AWS CLI Access

A profile `transplant-admin` has been configured:
```bash
aws --profile transplant-admin rds describe-db-instances --region us-east-1
```

### Remaining Infrastructure TODOs
- [ ] Enable RDS deletion protection
- [ ] Enable RDS storage encryption
- [ ] Set up CI/CD pipeline (GitHub Actions recommended)
- [ ] Configure CloudWatch alarms
