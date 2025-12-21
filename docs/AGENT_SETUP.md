# Agent Setup Guide

Instructions for setting up a new development environment (for Windsurf or other AI agents).

## Prerequisites

Transfer these files from the original development machine:
1. `.secrets/secrets.enc` - Encrypted credentials file
2. `~/.ssh/transplant-wizard-key.pem` - SSH key for EC2 access

## Step 1: Place Files

```bash
# Create secrets directory
mkdir -p /path/to/Shakir-ClaudeCode/.secrets

# Place secrets.enc in the .secrets folder
# Place transplant-wizard-key.pem in ~/.ssh/

# Set correct permissions on SSH key
chmod 400 ~/.ssh/transplant-wizard-key.pem
```

## Step 2: Decrypt Secrets

```bash
cd /path/to/Shakir-ClaudeCode

# Decrypt the secrets file
openssl enc -aes-256-cbc -d -pbkdf2 \
  -in .secrets/secrets.enc \
  -out .secrets/secrets.txt \
  -pass pass:TransplantWizard2024
```

## Step 3: View Secrets

```bash
cat .secrets/secrets.txt
```

This file contains:
- AWS credentials (Account ID, Access Key, Secret Key)
- Database connection info (host, user, password)
- JWT and Session secrets
- Server access info (EC2 IP, SSH user)

## Step 4: Load Into Environment (Optional)

```bash
# Load all secrets as environment variables
export $(cat .secrets/secrets.txt | grep -v '^#' | grep '=' | xargs)

# Verify
echo $DB_HOST
echo $AWS_ACCESS_KEY_ID
```

## Step 5: Set Up AWS CLI Profile

```bash
# Add to ~/.aws/credentials
cat >> ~/.aws/credentials << 'EOF'

[transplant-admin]
aws_access_key_id = <from encrypted secrets file>
aws_secret_access_key = <from encrypted secrets file>
EOF

# Add to ~/.aws/config
cat >> ~/.aws/config << 'EOF'

[profile transplant-admin]
region = us-east-1
output = json
EOF
```

**Note**: Get the AWS credentials from `.secrets/secrets.txt` (decrypted from `.secrets/secrets.enc`)

## Step 6: Clean Up Plaintext

```bash
# Delete the decrypted file after you've extracted what you need
rm .secrets/secrets.txt
```

## Step 7: Test Connectivity

```bash
# Test SSH to EC2
ssh -i ~/.ssh/transplant-wizard-key.pem ec2-user@3.215.185.174 "echo 'SSH OK'"

# Test AWS CLI
aws --profile transplant-admin sts get-caller-identity

# Test Database (from EC2)
ssh -i ~/.ssh/transplant-wizard-key.pem ec2-user@3.215.185.174 \
  "PGPASSWORD='ball9BaseSecure2024' psql -h transplant-platform-db.cibqsuyys3wn.us-east-1.rds.amazonaws.com -U transplant_admin -d postgres -c 'SELECT 1'"
```

## Quick Reference

| Secret | Value |
|--------|-------|
| Encryption Password | `TransplantWizard2024` |
| DB Password | `ball9BaseSecure2024` |
| EC2 IP | `3.215.185.174` |
| SSH User | `ec2-user` |
| AWS Profile | `transplant-admin` |

## Troubleshooting

**"Permission denied" on SSH key**
```bash
chmod 400 ~/.ssh/transplant-wizard-key.pem
```

**"Bad decrypt" error**
- Make sure you're using the correct password: `TransplantWizard2024`

**Database connection fails**
- Database is only accessible from verified IPs or via EC2
- SSH tunnel through EC2 if connecting from new machine
