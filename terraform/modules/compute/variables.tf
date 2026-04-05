variable "prefix"            { type = string }
variable "sites_table_name"  { type = string }
variable "sites_table_arn"   { type = string }
variable "beats_table_name"  { type = string }
variable "beats_table_arn"   { type = string }

variable "slack_webhook_url" {
  type      = string
  sensitive = true
  default   = ""
}

variable "admin_token" {
  type      = string
  sensitive = true
  default   = ""
}

variable "beats_ttl_seconds" {
  type    = number
  default = 18000  # 5 hours
}
