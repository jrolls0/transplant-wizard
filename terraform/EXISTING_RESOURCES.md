# Existing AWS Resource IDs

This document tracks the actual AWS resource IDs for the Transplant Platform infrastructure.

**Note**: These resources were created manually/outside Terraform. The Terraform config exists for reference and future infrastructure changes, but the state is NOT synchronized with these existing resources.

## VPC Resources

| Resource | ID | Details |
|----------|-----|---------|
| VPC | `vpc-00c38e269fb7969f9` | CIDR: 10.0.0.0/16, Name: transplant-platform-vpc |
| Public Subnet 1 | `subnet-0bc614bba1e6fa53d` | 10.0.1.0/24, us-east-1a |
| Public Subnet 2 | `subnet-0bc9e10841c78b89c` | 10.0.2.0/24, us-east-1b |
| Private Subnet 1 | `subnet-09d3f0f1c1dc81d56` | 10.0.3.0/24, us-east-1a |
| Private Subnet 2 | `subnet-057e8ab3833f3b2aa` | 10.0.4.0/24, us-east-1b |

## Compute Resources

| Resource | ID | Details |
|----------|-----|---------|
| EC2 Instance | `i-01ccb106fd09c4e58` | t3.micro, Amazon Linux 2023, IP: 3.215.185.174 |
| EC2 Security Group | `sg-086b17e6bed8cd119` | transplant-platform-ec2-sg |

## Database Resources

| Resource | ID | Details |
|----------|-----|---------|
| RDS Instance | `transplant-platform-db` | db.t3.micro, PostgreSQL 17.4 |
| RDS Endpoint | `transplant-platform-db.cibqsuyys3wn.us-east-1.rds.amazonaws.com` | Port 5432 |
| RDS Security Group | `sg-05661f0da8ebd85ce` | transplant-platform-rds-sg |

## IAM Resources

| Resource | Details |
|----------|---------|
| EC2 Role | `transplantwizard-backend-ses-role` |
| IAM User | `transplant-platform-admin` |

## Options for Terraform State

### Option 1: Reference Only (Current)
- Terraform configs serve as documentation
- Manual changes via AWS Console
- State file remains empty

### Option 2: Import Resources (Complex)
Requires restructuring modules to avoid count dependencies. Run imports in order:
```bash
# Would need to modify vpc/main.tf to use fixed counts instead of length()
```

### Option 3: Fresh Terraform Apply (Destructive)
- Delete existing resources
- Run `terraform apply` to create new ones
- **WARNING**: Would cause downtime

## Recommended Approach

For this project, **Option 1** is recommended:
- Keep Terraform configs as reference/documentation
- Make infrastructure changes via AWS Console
- Update this file with any new resource IDs
- Use Terraform for future greenfield deployments
