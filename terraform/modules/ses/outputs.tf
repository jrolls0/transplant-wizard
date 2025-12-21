# SES Module Outputs

output "domain_identity_arn" {
  description = "ARN of the SES domain identity"
  value       = aws_ses_domain_identity.main.arn
}

output "domain_verification_token" {
  description = "Domain verification token"
  value       = aws_ses_domain_identity.main.verification_token
}

output "dkim_tokens" {
  description = "DKIM tokens for DNS configuration"
  value       = aws_ses_domain_dkim.main.dkim_tokens
}
