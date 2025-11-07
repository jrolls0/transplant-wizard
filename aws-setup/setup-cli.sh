#!/bin/bash

# Install AWS CLI (if not already installed)
echo "Installing AWS CLI..."
brew install awscli

# Configure AWS CLI
echo "Configuring AWS CLI..."
aws configure set aws_access_key_id YOUR_ACCESS_KEY_HERE
aws configure set aws_secret_access_key YOUR_SECRET_KEY_HERE
aws configure set default.region us-east-1
aws configure set default.output json

# Verify configuration
echo "Testing AWS CLI configuration..."
aws sts get-caller-identity

echo "AWS CLI setup complete!"