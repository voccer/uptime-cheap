output "api_url" {
  description = "API Gateway endpoint"
  value       = module.api.api_endpoint
}

output "dashboard_url" {
  description = "S3 static website URL"
  value       = module.dashboard.dashboard_url
}

output "admin_url" {
  description = "Admin page URL (dashboard with #admin hash)"
  value       = "${module.dashboard.dashboard_url}#admin"
}
