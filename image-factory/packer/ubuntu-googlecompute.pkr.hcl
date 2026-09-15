packer {
  required_plugins {
    googlecompute = {
      version = ">= 1.2.6"
      source  = "github.com/hashicorp/googlecompute"
    }
  }
}

variable "project_id" {
  type    = string
  default = "bnpi-pats-492904"
}

variable "zone" {
  type    = string
  default = "asia-southeast1-a"
}

variable "source_image_project_id" {
  type    = list(string)
  default = ["ubuntu-os-cloud"]
}

variable "source_image_family" {
  type    = string
  default = "ubuntu-2404-lts-amd64"
}

variable "ssh_username" {
  type    = string
  default = "infra"
}

variable "staging_archive_url" {
  type    = string
  default = ""
}

variable "machine_type" {
  type    = string
  default = "e2-standard-4"
}

variable "disk_size" {
  type    = number
  default = 60
}

variable "disk_type" {
  type    = string
  default = "pd-balanced"
}

variable "max_run_duration_seconds" {
  type    = number
  default = 7200
}

variable "preemptible" {
  type    = bool
  default = false
}

locals {
  build_label = "project-truth-node-gcp"
}

source "googlecompute" "ubuntu" {
  project_id              = var.project_id
  zone                    = var.zone
  source_image_project_id = var.source_image_project_id
  source_image_family     = var.source_image_family

  image_name        = "${local.build_label}-{{timestamp}}"
  image_description = "Project Truth node image built by Packer on Google Compute."
  image_family      = "project-truth-node"

  instance_name = "${local.build_label}-build-{{timestamp}}"
  machine_type  = var.machine_type
  disk_size     = var.disk_size
  disk_type     = var.disk_type
  preemptible   = var.preemptible

  ssh_username = var.ssh_username
  ssh_timeout  = "30m"

  labels = {
    app     = "project-truth"
    purpose = "packer-image-build"
  }

  image_labels = {
    app     = "project-truth"
    purpose = "base-node-image"
  }
}

build {
  name    = "project-truth-googlecompute-image"
  sources = ["source.googlecompute.ubuntu"]

  provisioner "shell" {
    execute_command = "chmod +x {{ .Path }}; sudo -E bash -o pipefail -c '{{ .Vars }} {{ .Path }} 2>&1 | tee -a /var/log/project-truth-provision.log'"
    inline_shebang  = "/bin/bash -e"
    inline = [
      "set -euo pipefail",
      "test -n '${var.staging_archive_url}'",
      "TOKEN=\"$(curl -fsH 'Metadata-Flavor: Google' 'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token' | python3 -c 'import json,sys; print(json.load(sys.stdin)[\"access_token\"])')\"",
      "curl -fL --retry 6 --retry-delay 10 --retry-all-errors -H \"Authorization: Bearer $${TOKEN}\" '${var.staging_archive_url}' -o /tmp/project-truth-staging.tar",
      "test -s /tmp/project-truth-staging.tar",
      "rm -rf /tmp/project-truth-staging",
      "mkdir -p /tmp/project-truth-staging",
      "tar -xf /tmp/project-truth-staging.tar -C /tmp/project-truth-staging",
      "mkdir -p /opt/project-truth",
      "rm -rf /opt/project-truth/gitops /opt/project-truth/appliance /opt/project-truth/bnpi-pats-api /opt/project-truth/bnpi-pats-app /opt/project-truth/vendor",
      "cp -R /tmp/project-truth-staging/gitops /opt/project-truth/gitops",
      "cp -R /tmp/project-truth-staging/appliance /opt/project-truth/appliance",
      "cp -R /tmp/project-truth-staging/bnpi-pats-api /opt/project-truth/bnpi-pats-api",
      "cp -R /tmp/project-truth-staging/bnpi-pats-app /opt/project-truth/bnpi-pats-app",
      "cp -R /tmp/project-truth-staging/vendor /opt/project-truth/vendor",
      "find /opt/project-truth -type f \\( -name '*.tmp' -o -name '.env' -o -name '.env.*' \\) -delete",
      "chown -R infra:infra /opt/project-truth"
    ]
  }

  provisioner "shell" {
    execute_command = "chmod +x {{ .Path }}; sudo -E bash -o pipefail -c '{{ .Vars }} {{ .Path }} 2>&1 | tee -a /var/log/project-truth-provision.log'"
    environment_vars = [
      "PROJECT_TRUTH_IMAGE_TARGET=googlecompute"
    ]
    script          = "${path.root}/provision.sh"
  }
}
