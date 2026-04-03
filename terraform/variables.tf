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
