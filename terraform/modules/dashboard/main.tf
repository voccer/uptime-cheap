data "aws_caller_identity" "current" {}

resource "aws_s3_bucket" "dashboard" {
  bucket = "${var.prefix}-dashboard-${data.aws_caller_identity.current.account_id}"
  tags   = { Project = var.prefix }
}

resource "aws_s3_bucket_website_configuration" "dashboard" {
  bucket = aws_s3_bucket.dashboard.id
  index_document { suffix = "index.html" }
}

resource "aws_s3_bucket_public_access_block" "dashboard" {
  bucket                  = aws_s3_bucket.dashboard.id
  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = false
  restrict_public_buckets = false
}

resource "aws_s3_bucket_policy" "dashboard" {
  bucket     = aws_s3_bucket.dashboard.id
  depends_on = [aws_s3_bucket_public_access_block.dashboard]

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = "*"
      Action    = "s3:GetObject"
      Resource  = "${aws_s3_bucket.dashboard.arn}/*"
    }]
  })
}

locals {
  dashboard_html = replace(
    file("${path.root}/../dashboard/index.html"),
    "__API_URL__",
    var.api_endpoint
  )
}

resource "aws_s3_object" "index" {
  bucket       = aws_s3_bucket.dashboard.id
  key          = "index.html"
  content      = local.dashboard_html
  content_type = "text/html"
  depends_on   = [aws_s3_bucket_policy.dashboard]
}

resource "aws_s3_object" "favicon" {
  bucket = aws_s3_bucket.dashboard.id
  key    = "favicon.ico"
  source = "${path.root}/../dashboard/favicon.ico"
  content_type = "image/x-icon"
  depends_on   = [aws_s3_bucket_policy.dashboard]
}
