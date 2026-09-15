packer {
  required_plugins {
    virtualbox = {
      version = ">= 1.1.3"
      source  = "github.com/hashicorp/virtualbox"
    }
  }
}

variable "vm_name" {
  type    = string
  default = "project-truth-image-build"
}

variable "iso_url" {
  type    = string
  default = "https://releases.ubuntu.com/24.04/ubuntu-24.04.4-live-server-amd64.iso"
}

variable "iso_checksum" {
  type    = string
  default = "file:https://releases.ubuntu.com/24.04/SHA256SUMS"
}

variable "ssh_username" {
  type    = string
  default = "infra"
}

variable "ssh_password" {
  type      = string
  default   = "infra"
  sensitive = true
}

source "virtualbox-iso" "ubuntu" {
  vm_name              = "${var.vm_name}-virtualbox"
  guest_os_type        = "Ubuntu_64"
  firmware             = "efi"
  chipset              = "ich9"
  iso_url              = var.iso_url
  iso_checksum         = var.iso_checksum
  cpus                 = 2
  memory               = 4096
  disk_size            = 30000
  hard_drive_interface = "sata"
  iso_interface        = "sata"
  headless             = false
  http_directory       = "${path.root}/http"
  ssh_username         = var.ssh_username
  ssh_password         = var.ssh_password
  ssh_timeout          = "90m"
  shutdown_command     = "echo '${var.ssh_password}' | sudo -S shutdown -P now"
  output_directory     = "output/${var.vm_name}-virtualbox"
  skip_export          = true
  keep_registered      = true

  boot_wait = "5s"
  boot_command = [
    "c<wait5>",
    "set gfxpayload=keep<enter><wait2>",
    "linux /casper/vmlinuz autoinstall ds='nocloud-net;s=http://{{ .HTTPIP }}:{{ .HTTPPort }}/' ---<enter><wait5>",
    "initrd /casper/initrd<enter><wait5>",
    "boot<enter><wait10>"
  ]
}

build {
  name    = "project-truth-virtualbox-image"
  sources = ["source.virtualbox-iso.ubuntu"]

  provisioner "file" {
    source      = "${path.root}/staging/gitops"
    destination = "/tmp/gitops"
  }

  provisioner "file" {
    source      = "${path.root}/staging/appliance"
    destination = "/tmp/appliance"
  }

  provisioner "file" {
    source      = "${path.root}/staging/bnpi-pats-api"
    destination = "/tmp/bnpi-pats-api"
  }

  provisioner "file" {
    source      = "${path.root}/staging/bnpi-pats-app"
    destination = "/tmp/bnpi-pats-app"
  }

  provisioner "shell" {
    inline = [
      "sudo mkdir -p /opt/project-truth",
      "sudo cp -R /tmp/gitops /opt/project-truth/gitops",
      "sudo cp -R /tmp/appliance /opt/project-truth/appliance",
      "sudo cp -R /tmp/bnpi-pats-api /opt/project-truth/bnpi-pats-api",
      "sudo cp -R /tmp/bnpi-pats-app /opt/project-truth/bnpi-pats-app",
      "sudo find /opt/project-truth -type f \\( -name '*.tmp' -o -name '.env' -o -name '.env.*' \\) -delete",
      "sudo chown -R infra:infra /opt/project-truth"
    ]
  }

  provisioner "shell" {
    environment_vars = [
      "PROJECT_TRUTH_IMAGE_TARGET=virtualbox"
    ]
    script = "${path.root}/provision.sh"
  }
}
