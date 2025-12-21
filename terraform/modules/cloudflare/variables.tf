# Cloudflare Module Variables

variable "domain" {
  description = "Domain name managed in Cloudflare"
  type        = string
}

variable "ec2_public_ip" {
  description = "Public IP address of the EC2 instance"
  type        = string
}

variable "ses_dkim_tokens" {
  description = "List of 3 DKIM tokens from AWS SES"
  type        = list(string)
}
