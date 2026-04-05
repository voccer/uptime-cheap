variable "aws_region" {
  description = "AWS region"
  default     = "ap-northeast-1"
}

variable "project_name" {
  description = "Project prefix for all resources"
  default     = "site-monitor"
}

variable "slack_webhook_url" {
  description = "Slack incoming webhook URL"
  sensitive   = true
  default     = ""
}

variable "admin_token" {
  description = "Secret token for admin access on the dashboard"
  sensitive   = true
  default     = ""
}

variable "beats_ttl_seconds" {
  description = "TTL for beat records in seconds (default: 18000 = 5 hours)"
  type        = number
  default     = 18000
}
