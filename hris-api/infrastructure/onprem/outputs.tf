output "project_root" {
  description = "Resolved project root used by Terraform."
  value       = local.effective_project_root
}

output "network_name" {
  description = "Docker network name for the stack."
  value       = docker_network.onprem.name
}

output "container_names" {
  description = "Container names created by this Terraform stack."
  value = {
    redis      = docker_container.redis.name
    mongodb    = docker_container.mongodb.name
    minio      = try(docker_container.minio[0].name, null)
    minio_init = try(docker_container.minio_init[0].name, null)
    app        = docker_container.app.name
    cron       = try(docker_container.cron[0].name, null)
  }
}

output "app_url" {
  description = "Base URL for local app container."
  value       = "http://localhost:${local.app_port}"
}

output "mongodb_url" {
  description = "MongoDB connection URL used by app/cron containers."
  value       = local.mongodb_url
  sensitive   = true
}

output "minio_api_url" {
  description = "Base URL for local MinIO API endpoint."
  value       = var.enable_minio ? "http://localhost:${var.minio_host_port}" : null
}

output "minio_console_url" {
  description = "Base URL for local MinIO Console."
  value       = var.enable_minio ? "http://localhost:${var.minio_console_host_port}" : null
}
