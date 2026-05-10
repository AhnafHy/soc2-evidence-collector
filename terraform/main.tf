terraform {
  backend "s3" {
    bucket = "soc2-tfstate-ahnaf"
    key    = "soc2/terraform.tfstate"
    region = "us-east-2"
  }
}

provider "aws" {
  region = var.aws_region
}

resource "random_id" "suffix" {
  byte_length = 4
}

# ─── S3 FOR FRONTEND ────────────────────────────────────────
resource "aws_s3_bucket" "frontend" {
  bucket        = "${var.project_name}-frontend-${random_id.suffix.hex}"
  force_destroy = true
  tags = { Name = "${var.project_name}-frontend" }
}

resource "aws_s3_bucket_website_configuration" "frontend" {
  bucket = aws_s3_bucket.frontend.id
  index_document { suffix = "index.html" }
  error_document { key = "index.html" }
}

resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket                  = aws_s3_bucket.frontend.id
  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = false
  restrict_public_buckets = false
}

resource "aws_s3_bucket_policy" "frontend" {
  bucket = aws_s3_bucket.frontend.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = "*"
      Action    = "s3:GetObject"
      Resource  = "${aws_s3_bucket.frontend.arn}/*"
    }]
  })
  depends_on = [aws_s3_bucket_public_access_block.frontend]
}

# ─── DYNAMODB ───────────────────────────────────────────────
resource "aws_dynamodb_table" "evidence" {
  name         = "${var.project_name}-evidence"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"
  range_key    = "sk"

  attribute {
    name = "pk"
    type = "S"
  }
  attribute {
    name = "sk"
    type = "S"
  }

  tags = { Name = "${var.project_name}-evidence" }
}

# ─── IAM ROLE FOR LAMBDA ────────────────────────────────────
resource "aws_iam_role" "lambda_role" {
  name = "${var.project_name}-lambda-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_basic" {
  role       = aws_iam_role.lambda_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "lambda_policy" {
  name = "${var.project_name}-policy"
  role = aws_iam_role.lambda_role.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["dynamodb:PutItem", "dynamodb:GetItem", "dynamodb:Query", "dynamodb:Scan", "dynamodb:BatchWriteItem"]
        Resource = aws_dynamodb_table.evidence.arn
      },
      {
        Effect   = "Allow"
        Action   = ["iam:GetAccountPasswordPolicy", "iam:GetAccountSummary", "iam:ListRoles", "iam:ListUsers", "iam:ListPolicies"]
        Resource = "*"
      },
      {
        Effect   = "Allow"
        Action   = ["cloudtrail:DescribeTrails", "cloudtrail:GetTrailStatus"]
        Resource = "*"
      },
      {
        Effect   = "Allow"
        Action   = ["s3:ListAllMyBuckets", "s3:GetBucketEncryption", "s3:GetBucketAcl", "s3:GetBucketVersioning"]
        Resource = "*"
      },
      {
        Effect   = "Allow"
        Action   = ["cloudwatch:DescribeAlarms"]
        Resource = "*"
      },
      {
        Effect   = "Allow"
        Action   = ["lambda:InvokeFunction"]
        Resource = "*"
      }
    ]
  })
}

# ─── COLLECTOR LAMBDA ───────────────────────────────────────
data "archive_file" "collector_zip" {
  type        = "zip"
  source_file = "${path.module}/../lambda/evidence_collector.py"
  output_path = "${path.module}/../lambda/evidence_collector.zip"
}

resource "aws_lambda_function" "collector" {
  filename         = data.archive_file.collector_zip.output_path
  function_name    = "${var.project_name}-collector"
  role             = aws_iam_role.lambda_role.arn
  handler          = "evidence_collector.lambda_handler"
  runtime          = "python3.11"
  timeout          = 60
  source_code_hash = data.archive_file.collector_zip.output_base64sha256
  environment {
    variables = {
      DYNAMODB_TABLE = aws_dynamodb_table.evidence.name
    }
  }
  tags = { Name = "${var.project_name}-collector" }
}

# ─── API LAMBDA ─────────────────────────────────────────────
data "archive_file" "api_zip" {
  type        = "zip"
  source_file = "${path.module}/../lambda/evidence_api.py"
  output_path = "${path.module}/../lambda/evidence_api.zip"
}

resource "aws_lambda_function" "api" {
  filename         = data.archive_file.api_zip.output_path
  function_name    = "${var.project_name}-api"
  role             = aws_iam_role.lambda_role.arn
  handler          = "evidence_api.lambda_handler"
  runtime          = "python3.11"
  timeout          = 30
  source_code_hash = data.archive_file.api_zip.output_base64sha256
  environment {
    variables = {
      DYNAMODB_TABLE     = aws_dynamodb_table.evidence.name
      COLLECTOR_FUNCTION = aws_lambda_function.collector.function_name
    }
  }
  tags = { Name = "${var.project_name}-api" }
}

# ─── API GATEWAY ────────────────────────────────────────────
resource "aws_api_gateway_rest_api" "api" {
  name = "${var.project_name}-api"
}

resource "aws_api_gateway_resource" "proxy" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_rest_api.api.root_resource_id
  path_part   = "{proxy+}"
}

resource "aws_api_gateway_method" "proxy" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.proxy.id
  http_method   = "ANY"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "lambda" {
  rest_api_id             = aws_api_gateway_rest_api.api.id
  resource_id             = aws_api_gateway_resource.proxy.id
  http_method             = aws_api_gateway_method.proxy.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.api.invoke_arn
}

resource "aws_api_gateway_stage" "prod" {
  deployment_id = aws_api_gateway_deployment.deployment.id
  rest_api_id   = aws_api_gateway_rest_api.api.id
  stage_name    = "prod"
}

resource "aws_api_gateway_deployment" "deployment" {
  depends_on  = [aws_api_gateway_integration.lambda]
  rest_api_id = aws_api_gateway_rest_api.api.id
  lifecycle { create_before_destroy = true }
}

resource "aws_lambda_permission" "api_gateway" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.api.execution_arn}/*/*"
}

# ─── EVENTBRIDGE SCHEDULE ───────────────────────────────────
resource "aws_cloudwatch_event_rule" "schedule" {
  name                = "${var.project_name}-schedule"
  schedule_expression = var.collection_schedule
}

resource "aws_cloudwatch_event_target" "collector" {
  rule      = aws_cloudwatch_event_rule.schedule.name
  target_id = "CollectorLambda"
  arn       = aws_lambda_function.collector.arn
}

resource "aws_lambda_permission" "eventbridge" {
  statement_id  = "AllowEventBridgeInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.collector.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.schedule.arn
}

# ─── CLOUDWATCH ALARM ───────────────────────────────────────
resource "aws_cloudwatch_metric_alarm" "api_errors" {
  alarm_name          = "${var.project_name}-api-errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = 300
  statistic           = "Sum"
  threshold           = 5
  alarm_description   = "API Lambda error rate too high"
  dimensions = { FunctionName = aws_lambda_function.api.function_name }
}