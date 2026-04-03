# ─── IAM ──────────────────────────────────────────────────────────────────────
data "aws_iam_policy_document" "lambda_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "lambda" {
  name               = "${var.prefix}-lambda-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

resource "aws_iam_role_policy" "lambda" {
  name = "${var.prefix}-lambda-policy"
  role = aws_iam_role.lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:Scan", "dynamodb:GetItem", "dynamodb:PutItem",
          "dynamodb:UpdateItem", "dynamodb:DeleteItem", "dynamodb:Query",
        ]
        Resource = [var.sites_table_arn, var.beats_table_arn]
      },
      {
        Effect   = "Allow"
        Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "arn:aws:logs:*:*:*"
      },
    ]
  })
}

# ─── Lambda packages ──────────────────────────────────────────────────────────
data "archive_file" "checker" {
  type        = "zip"
  source_dir  = "${path.root}/../lambda/checker"
  output_path = "${path.root}/.builds/checker.zip"
}

data "archive_file" "api" {
  type        = "zip"
  source_dir  = "${path.root}/../lambda/api"
  output_path = "${path.root}/.builds/api.zip"
}

# ─── Lambda functions ─────────────────────────────────────────────────────────
resource "aws_lambda_function" "checker" {
  function_name    = "${var.prefix}-checker"
  role             = aws_iam_role.lambda.arn
  runtime          = "nodejs22.x"
  handler          = "handler.lambda_handler"
  filename         = data.archive_file.checker.output_path
  source_code_hash = data.archive_file.checker.output_base64sha256
  timeout          = 65
  memory_size      = 128

  environment {
    variables = {
      SITES_TABLE       = var.sites_table_name
      BEATS_TABLE       = var.beats_table_name
      SLACK_WEBHOOK_URL = var.slack_webhook_url
    }
  }

  tags = { Project = var.prefix }
}

resource "aws_lambda_function" "api" {
  function_name    = "${var.prefix}-api"
  role             = aws_iam_role.lambda.arn
  runtime          = "nodejs22.x"
  handler          = "handler.lambda_handler"
  filename         = data.archive_file.api.output_path
  source_code_hash = data.archive_file.api.output_base64sha256
  timeout          = 10
  memory_size      = 128

  environment {
    variables = {
      SITES_TABLE  = var.sites_table_name
      BEATS_TABLE  = var.beats_table_name
      ADMIN_TOKEN  = var.admin_token
    }
  }

  tags = { Project = var.prefix }
}

# ─── EventBridge ──────────────────────────────────────────────────────────────
resource "aws_cloudwatch_event_rule" "checker" {
  name                = "${var.prefix}-every-minute"
  schedule_expression = "rate(1 minute)"
  description         = "Trigger checker Lambda every minute (checks 3× at 20s intervals)"
}

resource "aws_cloudwatch_event_target" "checker" {
  rule      = aws_cloudwatch_event_rule.checker.name
  target_id = "checker-lambda"
  arn       = aws_lambda_function.checker.arn
}

resource "aws_lambda_permission" "eventbridge" {
  statement_id  = "AllowEventBridge"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.checker.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.checker.arn
}
