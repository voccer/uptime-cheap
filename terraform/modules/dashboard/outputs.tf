output "dashboard_url" {
  value = "http://${aws_s3_bucket_website_configuration.dashboard.website_endpoint}"
}
