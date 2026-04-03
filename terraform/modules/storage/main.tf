resource "aws_dynamodb_table" "sites" {
  name         = "${var.prefix}-sites"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "site_id"

  attribute {
    name = "site_id"
    type = "S"
  }

  tags = { Project = var.prefix }
}

resource "aws_dynamodb_table" "beats" {
  name         = "${var.prefix}-beats"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "site_id"
  range_key    = "timestamp"

  attribute {
    name = "site_id"
    type = "S"
  }

  attribute {
    name = "timestamp"
    type = "S"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  tags = { Project = var.prefix }
}
