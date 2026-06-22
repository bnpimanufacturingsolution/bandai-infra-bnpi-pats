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
  default = "hris-492904"
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
  machine_type  = "e2-standard-8"
  disk_size     = 80
  disk_type     = "pd-ssd"

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

  provisioner "file" {
    source      = "${path.root}/staging/project-truth-staging.tar"
    destination = "/tmp/project-truth-staging.tar"
  }

  provisioner "shell" {
    execute_command = "chmod +x {{ .Path }}; sudo -E bash -o pipefail -c '{{ .Vars }} {{ .Path }} 2>&1 | tee -a /var/log/project-truth-provision.log'"
    inline_shebang  = "/bin/bash -e"
    inline = [
      "set -euo pipefail",
      "rm -rf /tmp/project-truth-staging",
      "mkdir -p /tmp/project-truth-staging",
      "tar -xf /tmp/project-truth-staging.tar -C /tmp/project-truth-staging",
      "mkdir -p /opt/project-truth",
      "rm -rf /opt/project-truth/gitops /opt/project-truth/appliance /opt/project-truth/hris-api /opt/project-truth/hris-app /opt/project-truth/vendor",
      "cp -R /tmp/project-truth-staging/gitops /opt/project-truth/gitops",
      "cp -R /tmp/project-truth-staging/appliance /opt/project-truth/appliance",
      "cp -R /tmp/project-truth-staging/hris-api /opt/project-truth/hris-api",
      "cp -R /tmp/project-truth-staging/hris-app /opt/project-truth/hris-app",
      "cp -R /tmp/project-truth-staging/vendor /opt/project-truth/vendor",
      "find /opt/project-truth -type f \\( -name '*.tmp' -o -name '.env' -o -name '.env.*' \\) -delete",
      "chown -R infra:infra /opt/project-truth"
    ]
  }

  provisioner "shell" {
    execute_command = "chmod +x {{ .Path }}; sudo -E bash -o pipefail -c '{{ .Vars }} {{ .Path }} 2>&1 | tee -a /var/log/project-truth-provision.log'"
    script          = "${path.root}/provision.sh"
  }
}
