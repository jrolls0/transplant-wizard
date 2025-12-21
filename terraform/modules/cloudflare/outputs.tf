# Cloudflare Module Outputs

output "zone_id" {
  description = "Cloudflare Zone ID"
  value       = data.cloudflare_zone.main.id
}

output "nameservers" {
  description = "Cloudflare nameservers for the zone"
  value       = data.cloudflare_zone.main.name_servers
}

output "a_record_ids" {
  description = "IDs of the A records created"
  value = {
    root = cloudflare_record.root.id
    www  = cloudflare_record.www.id
    api  = cloudflare_record.api.id
    dusw = cloudflare_record.dusw.id
    tc   = cloudflare_record.tc.id
  }
}
