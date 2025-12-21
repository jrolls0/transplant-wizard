# Cloudflare DNS Module
# Manages DNS records for transplantwizard.com

# Data source to get the zone ID
data "cloudflare_zone" "main" {
  name = var.domain
}

# A Records - All pointing to EC2 instance, proxied through Cloudflare
resource "cloudflare_record" "root" {
  zone_id = data.cloudflare_zone.main.id
  name    = "@"
  content = var.ec2_public_ip
  type    = "A"
  ttl     = 1  # Auto TTL when proxied
  proxied = true
  comment = "Root domain - EC2 server"
}

resource "cloudflare_record" "www" {
  zone_id = data.cloudflare_zone.main.id
  name    = "www"
  content = var.ec2_public_ip
  type    = "A"
  ttl     = 1
  proxied = true
  comment = "WWW subdomain - EC2 server"
}

resource "cloudflare_record" "api" {
  zone_id = data.cloudflare_zone.main.id
  name    = "api"
  content = var.ec2_public_ip
  type    = "A"
  ttl     = 1
  proxied = true
  comment = "API subdomain - Backend API"
}

resource "cloudflare_record" "dusw" {
  zone_id = data.cloudflare_zone.main.id
  name    = "dusw"
  content = var.ec2_public_ip
  type    = "A"
  ttl     = 1
  proxied = true
  comment = "DUSW Portal - Social Worker interface"
}

resource "cloudflare_record" "tc" {
  zone_id = data.cloudflare_zone.main.id
  name    = "tc"
  content = var.ec2_public_ip
  type    = "A"
  ttl     = 1
  proxied = true
  comment = "TC Portal - Transplant Center interface"
}

# SES DKIM Records - CNAME records for email authentication
resource "cloudflare_record" "dkim_1" {
  zone_id = data.cloudflare_zone.main.id
  name    = "${var.ses_dkim_tokens[0]}._domainkey"
  content = "${var.ses_dkim_tokens[0]}.dkim.amazonses.com"
  type    = "CNAME"
  ttl     = 1
  proxied = false  # Must NOT be proxied for DKIM
  comment = "SES DKIM token 1"
}

resource "cloudflare_record" "dkim_2" {
  zone_id = data.cloudflare_zone.main.id
  name    = "${var.ses_dkim_tokens[1]}._domainkey"
  content = "${var.ses_dkim_tokens[1]}.dkim.amazonses.com"
  type    = "CNAME"
  ttl     = 1
  proxied = false
  comment = "SES DKIM token 2"
}

resource "cloudflare_record" "dkim_3" {
  zone_id = data.cloudflare_zone.main.id
  name    = "${var.ses_dkim_tokens[2]}._domainkey"
  content = "${var.ses_dkim_tokens[2]}.dkim.amazonses.com"
  type    = "CNAME"
  ttl     = 1
  proxied = false
  comment = "SES DKIM token 3"
}

# SPF Record - Email sender verification
resource "cloudflare_record" "spf" {
  zone_id = data.cloudflare_zone.main.id
  name    = "@"
  content = "v=spf1 include:amazonses.com ~all"
  type    = "TXT"
  ttl     = 1
  comment = "SPF record for SES email"
}

# DMARC Record - Email authentication policy
resource "cloudflare_record" "dmarc" {
  zone_id = data.cloudflare_zone.main.id
  name    = "_dmarc"
  content = "v=DMARC1; p=quarantine; rua=mailto:privacy@transplantwizard.com"
  type    = "TXT"
  ttl     = 1
  comment = "DMARC policy"
}

# Mail subdomain SPF
resource "cloudflare_record" "mail_spf" {
  zone_id = data.cloudflare_zone.main.id
  name    = "mail"
  content = "v=spf1 include:amazonses.com ~all"
  type    = "TXT"
  ttl     = 1
  comment = "SPF record for mail subdomain"
}

# MX Record for mail subdomain (for bounce handling)
resource "cloudflare_record" "mail_mx" {
  zone_id  = data.cloudflare_zone.main.id
  name     = "mail"
  content  = "feedback-smtp.us-east-1.amazonses.com"
  type     = "MX"
  ttl      = 1
  priority = 10
  comment  = "MX record for SES bounce handling"
}
