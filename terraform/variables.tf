variable "aws_region" {
  default = "us-east-2"
}

variable "project_name" {
  default = "soc2-evidence-collector"
}

variable "collection_schedule" {
  default = "rate(1 day)"
}