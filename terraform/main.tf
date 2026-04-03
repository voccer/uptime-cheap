module "storage" {
  source = "./modules/storage"
  prefix = var.project_name
}

module "compute" {
  source            = "./modules/compute"
  prefix            = var.project_name
  sites_table_name  = module.storage.sites_table_name
  sites_table_arn   = module.storage.sites_table_arn
  beats_table_name  = module.storage.beats_table_name
  beats_table_arn   = module.storage.beats_table_arn
  slack_webhook_url = var.slack_webhook_url
  admin_token       = var.admin_token
}

module "api" {
  source                   = "./modules/api"
  prefix                   = var.project_name
  api_lambda_invoke_arn    = module.compute.api_lambda_invoke_arn
  api_lambda_function_name = module.compute.api_lambda_function_name
}

module "dashboard" {
  source       = "./modules/dashboard"
  prefix       = var.project_name
  api_endpoint = module.api.api_endpoint
}
