variable "stack_name" {
  description = "Prefix used for Docker resources."
  type        = string
  default     = "hris-local"
}

variable "redis_host_port" {
  description = "Host port mapped to Redis container 6379."
  type        = number
  default     = 6380

  validation {
    condition     = var.redis_host_port >= 1 && var.redis_host_port <= 65535
    error_message = "redis_host_port must be in range 1-65535."
  }
}

variable "app_port_fallback" {
  description = "Fallback host/container port for app when PORT is not found in .env."
  type        = number
  default     = 3001

  validation {
    condition     = var.app_port_fallback >= 1 && var.app_port_fallback <= 65535
    error_message = "app_port_fallback must be in range 1-65535."
  }
}

variable "redis_password_fallback" {
  description = "Fallback Redis password when REDIS_PASSWORD is not found in .env."
  type        = string
  default     = "template"
  sensitive   = true

  validation {
    condition     = var.allow_insecure_local_defaults || length(var.redis_password_fallback) >= 12
    error_message = "redis_password_fallback must be at least 12 characters unless allow_insecure_local_defaults is true."
  }
}

variable "mongodb_host_port" {
  description = "Host port mapped to MongoDB container 27017."
  type        = number
  default     = 27018

  validation {
    condition     = var.mongodb_host_port >= 1 && var.mongodb_host_port <= 65535
    error_message = "mongodb_host_port must be in range 1-65535."
  }
}

variable "mongodb_root_username" {
  description = "MongoDB root username."
  type        = string
  default     = "root"
}

variable "mongodb_root_password" {
  description = "MongoDB root password."
  type        = string
  default     = "rootpass"
  sensitive   = true

  validation {
    condition     = var.allow_insecure_local_defaults || (length(var.mongodb_root_password) >= 12 && var.mongodb_root_password != "rootpass")
    error_message = "mongodb_root_password must be at least 12 characters and not 'rootpass' unless allow_insecure_local_defaults is true."
  }
}

variable "mongodb_database" {
  description = "MongoDB application database name."
  type        = string
  default     = "hris"
}

variable "project_root" {
  description = "Absolute path of project root used for Docker build context and .env loading."
  type        = string
  default     = ""
}

variable "app_image_name" {
  description = "Local Docker image tag used by app and cron containers."
  type        = string
  default     = "hris-local-app:latest"
}

variable "mongodb_image" {
  description = "MongoDB image used by on-prem Terraform."
  type        = string
  default     = "mongo:7.0.31"
}

variable "redis_image" {
  description = "Redis image used by on-prem Terraform."
  type        = string
  default     = "redis:7.2-alpine"
}

variable "minio_image" {
  description = "MinIO server image used by on-prem Terraform."
  type        = string
  default     = "minio/minio:latest"
}

variable "minio_mc_image" {
  description = "MinIO client image used by on-prem Terraform init tasks."
  type        = string
  default     = "minio/mc:latest"
}

variable "app_extra_env" {
  description = "Extra environment variables for app container (KEY=VALUE)."
  type        = list(string)
  default     = []
}

variable "cron_extra_env" {
  description = "Extra environment variables for cron container (KEY=VALUE)."
  type        = list(string)
  default     = []
}

variable "minio_host_port" {
  description = "Host port mapped to MinIO API container 9000."
  type        = number
  default     = 9000

  validation {
    condition     = var.minio_host_port >= 1 && var.minio_host_port <= 65535
    error_message = "minio_host_port must be in range 1-65535."
  }
}

variable "minio_console_host_port" {
  description = "Host port mapped to MinIO Console container 9001."
  type        = number
  default     = 9001

  validation {
    condition     = var.minio_console_host_port >= 1 && var.minio_console_host_port <= 65535
    error_message = "minio_console_host_port must be in range 1-65535."
  }
}

variable "minio_root_user" {
  description = "MinIO root username."
  type        = string
  default     = "minioadmin"

  validation {
    condition     = var.allow_insecure_local_defaults || (length(var.minio_root_user) >= 3 && var.minio_root_user != "minioadmin")
    error_message = "minio_root_user must be customized and at least 3 characters unless allow_insecure_local_defaults is true."
  }
}

variable "minio_root_password" {
  description = "MinIO root password."
  type        = string
  default     = "minioadmin"
  sensitive   = true

  validation {
    condition     = var.allow_insecure_local_defaults || (length(var.minio_root_password) >= 12 && var.minio_root_password != "minioadmin")
    error_message = "minio_root_password must be at least 12 characters and not 'minioadmin' unless allow_insecure_local_defaults is true."
  }
}

variable "minio_bucket" {
  description = "Default MinIO bucket for HRIS image/document uploads."
  type        = string
  default     = "hris-images"
}

variable "storage_provider" {
  description = "Storage provider injected to app/cron (cloudinary|minio)."
  type        = string
  default     = "minio"

  validation {
    condition     = contains(["cloudinary", "minio"], var.storage_provider)
    error_message = "storage_provider must be either 'cloudinary' or 'minio'."
  }
}

variable "allow_insecure_local_defaults" {
  description = "Set true only for throwaway local demos to allow insecure default credentials."
  type        = bool
  default     = false
}

variable "enable_minio" {
  description = "Enable MinIO and MinIO init containers."
  type        = bool
  default     = true
}

variable "enable_cron" {
  description = "Enable cron container."
  type        = bool
  default     = true
}
