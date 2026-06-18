locals {
  effective_project_root = var.project_root != "" ? var.project_root : abspath("${path.module}/../..")

  env_file_path = "${local.effective_project_root}/.env"

  env_lines = fileexists(local.env_file_path) ? [
    for raw in split("\n", replace(file(local.env_file_path), "\r", "")) :
    trimspace(raw)
    if trimspace(raw) != "" && !startswith(trimspace(raw), "#") && length(split(trimspace(raw), "=")) > 1
  ] : []

  env_map = {
    for line in local.env_lines :
    trimspace(element(split(line, "="), 0)) => trimspace(join("=", slice(split(line, "="), 1, length(split(line, "=")))))
  }

  redis_password        = lookup(local.env_map, "REDIS_PASSWORD", var.redis_password_fallback)
  app_port              = try(tonumber(lookup(local.env_map, "PORT", "")), var.app_port_fallback)
  mongodb_url           = "mongodb://mongodb:27017/${var.mongodb_database}?replicaSet=rs0"
  minio_public_base_url = "http://localhost:${var.minio_host_port}"

  app_base_env = concat(
    [
      "REDIS_HOST=redis",
      "REDIS_URL=redis://:${local.redis_password}@redis:6379",
      "DATABASE_URL=${local.mongodb_url}",
      "STORAGE_PROVIDER=${var.storage_provider}"
    ],
    var.enable_minio ? [
      "MINIO_ENDPOINT=minio",
      "MINIO_PORT=9000",
      "MINIO_USE_SSL=false",
      "MINIO_ACCESS_KEY=${var.minio_root_user}",
      "MINIO_SECRET_KEY=${var.minio_root_password}",
      "MINIO_BUCKET=${var.minio_bucket}",
      "MINIO_PUBLIC_BASE_URL=${local.minio_public_base_url}"
    ] : []
  )
}

check "env_file_exists" {
  assert {
    condition     = fileexists(local.env_file_path)
    error_message = "Expected env file at ${local.env_file_path}. Create it before running Terraform."
  }
}

check "redis_password_present" {
  assert {
    condition     = var.allow_insecure_local_defaults || trimspace(local.redis_password) != ""
    error_message = "An effective Redis password must be provided via .env REDIS_PASSWORD or redis_password_fallback unless allow_insecure_local_defaults is true."
  }
}

check "redis_password_strength" {
  assert {
    condition = var.allow_insecure_local_defaults || (
      length(local.redis_password) >= 12 &&
      local.redis_password != "template"
    )
    error_message = "Redis password must be at least 12 chars and not the default placeholder."
  }
}

resource "docker_network" "onprem" {
  name = "${var.stack_name}-network"
}

resource "docker_volume" "redis_data" {
  name = "${var.stack_name}-redisdata"
}

resource "docker_volume" "mongodb_data" {
  name = "${var.stack_name}-mongodbdata"
}

resource "docker_volume" "minio_data" {
  count = var.enable_minio ? 1 : 0
  name  = "${var.stack_name}-miniodata"
}

resource "docker_container" "redis" {
  name  = "${var.stack_name}-redis"
  image = var.redis_image

  command = [
    "redis-server",
    "--appendonly",
    "yes",
    "--requirepass",
    local.redis_password
  ]

  ports {
    internal = 6379
    external = var.redis_host_port
  }

  mounts {
    target = "/data"
    source = docker_volume.redis_data.name
    type   = "volume"
  }

  networks_advanced {
    name = docker_network.onprem.name
  }

  restart = "unless-stopped"
  wait    = false
}

resource "docker_container" "mongodb" {
  name  = "${var.stack_name}-mongodb"
  image = var.mongodb_image

  command = [
    "mongod",
    "--replSet",
    "rs0",
    "--bind_ip_all"
  ]

  ports {
    internal = 27017
    external = var.mongodb_host_port
  }

  mounts {
    target = "/data/db"
    source = docker_volume.mongodb_data.name
    type   = "volume"
  }

  networks_advanced {
    name = docker_network.onprem.name
  }

  restart = "unless-stopped"
  wait    = false
}

resource "docker_container" "minio" {
  count = var.enable_minio ? 1 : 0
  name  = "${var.stack_name}-minio"
  image = var.minio_image

  command = [
    "server",
    "/data",
    "--console-address",
    ":9001"
  ]

  env = [
    "MINIO_ROOT_USER=${var.minio_root_user}",
    "MINIO_ROOT_PASSWORD=${var.minio_root_password}"
  ]

  ports {
    internal = 9000
    external = var.minio_host_port
  }

  ports {
    internal = 9001
    external = var.minio_console_host_port
  }

  mounts {
    target = "/data"
    source = docker_volume.minio_data[0].name
    type   = "volume"
  }

  networks_advanced {
    name = docker_network.onprem.name
  }

  restart = "unless-stopped"
  wait    = false
}

resource "docker_container" "minio_init" {
  count = var.enable_minio ? 1 : 0
  name  = "${var.stack_name}-minio-init"
  image = var.minio_mc_image

  command = [
    "/bin/sh",
    "-c",
    "until mc alias set local http://minio:9000 ${var.minio_root_user} ${var.minio_root_password}; do sleep 2; done && mc mb -p local/${var.minio_bucket} || true && mc anonymous set download local/${var.minio_bucket} || true"
  ]

  must_run = false
  restart  = "no"
  wait     = false

  networks_advanced {
    name = docker_network.onprem.name
  }

  depends_on = [
    docker_container.minio[0]
  ]
}

resource "docker_container" "app" {
  name  = "${var.stack_name}-app"
  image = var.app_image_name

  env = concat(
    local.app_base_env,
    var.app_extra_env
  )

  ports {
    internal = local.app_port
    external = local.app_port
  }

  command = ["node", "dist/server.js"]

  mounts {
    type      = "bind"
    source    = local.env_file_path
    target    = "/app/.env"
    read_only = true
  }

  networks_advanced {
    name = docker_network.onprem.name
  }

  restart = "unless-stopped"
  wait    = false

  depends_on = [
    docker_container.redis,
    docker_container.mongodb,
    docker_container.minio,
    docker_container.minio_init
  ]
}

resource "docker_container" "cron" {
  count = var.enable_cron ? 1 : 0
  name  = "${var.stack_name}-cron"
  image = var.app_image_name

  env = concat(
    local.app_base_env,
    var.cron_extra_env
  )

  command = ["node", "dist/cron.js"]

  mounts {
    type      = "bind"
    source    = local.env_file_path
    target    = "/app/.env"
    read_only = true
  }

  networks_advanced {
    name = docker_network.onprem.name
  }

  restart = "unless-stopped"
  wait    = false

  depends_on = [
    docker_container.redis,
    docker_container.mongodb,
    docker_container.minio,
    docker_container.minio_init,
    docker_container.app
  ]
}
