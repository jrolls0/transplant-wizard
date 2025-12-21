# SES Module
# Creates SES domain identity and DKIM configuration

# SES Domain Identity
resource "aws_ses_domain_identity" "main" {
  domain = var.domain
}

# SES Domain DKIM
resource "aws_ses_domain_dkim" "main" {
  domain = aws_ses_domain_identity.main.domain
}

# Note: You need to add these DNS records to your domain:
#
# 1. DKIM Records (CNAME):
#    Each token from ses_dkim_tokens output needs a CNAME record:
#    {token}._domainkey.{domain} -> {token}.dkim.amazonses.com
#
# 2. SPF Record (TXT):
#    {domain} -> "v=spf1 include:amazonses.com ~all"
#
# 3. DMARC Record (TXT):
#    _dmarc.{domain} -> "v=DMARC1; p=quarantine; adkim=r; aspf=r;"
#
# These DNS records are managed in Cloudflare for this project.
