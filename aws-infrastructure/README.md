# AWS Infrastructure Deployment Guide

## HIPAA-Compliant Infrastructure for Transplant Platform

This directory contains CloudFormation templates and deployment scripts for setting up a complete, HIPAA-compliant AWS infrastructure for the Transplant Platform.

## 🏗️ Infrastructure Components

### 1. VPC and Networking (`01-vpc-networking.yaml`)
- **VPC**: Isolated network environment with public/private subnets
- **Security Groups**: Restrictive access controls for web and database tiers
- **NAT Gateways**: Secure outbound internet access for private resources
- **Route Tables**: Proper network routing configuration

### 2. RDS Database (`02-rds-database.yaml`)
- **PostgreSQL 15**: Encrypted database with AES-256
- **Multi-AZ**: High availability configuration (disabled for cost in dev)
- **Automated Backups**: 30-day retention for compliance
- **Enhanced Monitoring**: Performance insights with encryption
- **Audit Logging**: Comprehensive connection and query logging

### 3. Cognito Authentication (`03-cognito-auth.yaml`)
- **User Pools**: Separate client configs for web and mobile
- **Advanced Security**: Enforced mode with threat detection
- **MFA Support**: Optional multi-factor authentication
- **Custom Attributes**: Support for user roles and medical data
- **Session Management**: HIPAA-compliant token validity periods

### 4. S3 Storage (`04-s3-storage.yaml`)
- **Encrypted Storage**: KMS encryption for all patient documents
- **Versioning**: Document history and recovery
- **Lifecycle Policies**: Automatic archiving and retention (10 years)
- **Access Logging**: Complete audit trail of document access
- **Secure Access**: IAM policies and bucket policies

## 🚀 Quick Deployment

### Prerequisites
- AWS CLI installed and configured with your new IAM user
- Appropriate permissions (see IAM policy in `/aws-setup/`)
- macOS/Linux environment with bash

### One-Command Deployment
```bash
cd aws-infrastructure
./deploy.sh
```

The script will:
1. ✅ Verify AWS CLI configuration
2. 🔐 Generate a secure database password
3. 🏗️ Deploy all infrastructure stacks in order
4. 📋 Display important configuration values
5. 💾 Provide next steps for application setup

### Manual Deployment
If you prefer to deploy manually:

```bash
# 1. VPC and Networking
aws cloudformation create-stack \
  --stack-name transplant-platform-vpc \
  --template-body file://01-vpc-networking.yaml \
  --parameters ParameterKey=ProjectName,ParameterValue=transplant-platform \
  --region us-east-1

# 2. Wait for VPC completion
aws cloudformation wait stack-create-complete \
  --stack-name transplant-platform-vpc \
  --region us-east-1

# 3. Database (replace YOUR_SECURE_PASSWORD)
aws cloudformation create-stack \
  --stack-name transplant-platform-database \
  --template-body file://02-rds-database.yaml \
  --parameters ParameterKey=ProjectName,ParameterValue=transplant-platform \
               ParameterKey=DBUsername,ParameterValue=transplant_admin \
               ParameterKey=DBPassword,ParameterValue=YOUR_SECURE_PASSWORD \
  --region us-east-1

# Continue with auth and storage stacks...
```

## 🔐 Security Features

### HIPAA Compliance
- ✅ **Encryption at Rest**: All data encrypted with customer-managed KMS keys
- ✅ **Encryption in Transit**: TLS 1.2+ for all communications
- ✅ **Access Controls**: Role-based access with least privilege
- ✅ **Audit Logging**: Complete trail of all data access and modifications
- ✅ **Data Retention**: Medical industry standard retention periods
- ✅ **Network Isolation**: Private subnets for sensitive resources
- ✅ **Identity Management**: Strong authentication with optional MFA

### Data Protection
- **Field-Level Encryption**: Ready for additional PHI encryption
- **Versioning**: Document history and point-in-time recovery
- **Backup Strategy**: Automated backups with cross-region replication ready
- **Monitoring**: CloudWatch integration for security event detection

## 📊 Cost Estimation (Monthly)

**Development Environment:**
- RDS t3.micro: ~$15-25
- NAT Gateways: ~$45 (2 gateways)
- S3 Storage: ~$5-15 (depending on usage)
- CloudWatch Logs: ~$5-10
- **Total: ~$70-95/month**

**Production Recommendations:**
- RDS Multi-AZ with larger instance
- Application Load Balancer
- CloudFront distribution
- Additional monitoring and alerting

## 🔧 Configuration Values

After deployment, you'll receive these important values for your applications:

### Database Connection
- **Endpoint**: `transplant-platform-database.xxxxx.us-east-1.rds.amazonaws.com`
- **Port**: `5432`
- **Database**: `transplant_platform`
- **Username**: `transplant_admin`
- **Password**: Generated during deployment

### Cognito Authentication
- **User Pool ID**: `us-east-1_xxxxxxxxx`
- **Web Client ID**: For React application
- **Mobile Client ID**: For iOS application
- **Identity Pool ID**: For federated access

### S3 Storage
- **Patient Documents Bucket**: For ROI forms and medical documents
- **Access Logs Bucket**: For audit trail storage

## 🔄 Next Steps

1. **SES Email Setup**: Configure email domain verification
2. **Application Configuration**: Update your apps with the generated values
3. **SSL Certificates**: Set up ACM certificates when domain is ready
4. **Monitoring**: Configure CloudWatch alarms and notifications
5. **Backup Testing**: Verify backup and restore procedures

## 🆘 Troubleshooting

### Common Issues
- **IAM Permissions**: Ensure your user has the required policies
- **Resource Limits**: Check AWS service quotas for your account
- **Stack Dependencies**: Deploy stacks in the correct order (VPC → DB → Auth → Storage)

### Clean Up
To remove all resources:
```bash
# Delete stacks in reverse order
aws cloudformation delete-stack --stack-name transplant-platform-storage
aws cloudformation delete-stack --stack-name transplant-platform-auth
aws cloudformation delete-stack --stack-name transplant-platform-database
aws cloudformation delete-stack --stack-name transplant-platform-vpc
```

## 📞 Support
- Check CloudFormation Events tab for deployment issues
- Verify AWS CLI configuration and permissions
- Review CloudWatch logs for runtime errors