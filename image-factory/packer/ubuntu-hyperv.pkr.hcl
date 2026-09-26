packer {
  required_plugins {
    hyperv = {
      version = ">= 1.1.5"
      source  = "github.com/hashicorp/hyperv"
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

variable "switch_name" {
  type        = string
  description = "Existing Hyper-V switch used only by the maintainer image build VM."
  default     = "Default Switch"
}

source "hyperv-iso" "ubuntu" {
  vm_name          = var.vm_name
  generation       = 2
  iso_url          = var.iso_url
  iso_checksum     = var.iso_checksum
  cpus             = 2
  memory           = 6144
  disk_size        = 60000
  headless         = true
  switch_name      = var.switch_name
  http_directory   = "${path.root}/http"
  cd_files         = ["${path.root}/http/user-data", "${path.root}/http/meta-data"]
  cd_label         = "cidata"
  ssh_username     = var.ssh_username
  ssh_password     = var.ssh_password
  ssh_timeout      = "90m"
  shutdown_command = "echo '${var.ssh_password}' | sudo -S shutdown -P now"
  output_directory = "output/${var.vm_name}"

  # The previous build never reached SSH: boot_wait was "0s", so the GRUB
  # keystrokes were sent before GRUB was ready, the live ISO booted without the
  # autoinstall kernel arguments, and the guest never provisioned SSH.
  # GRUB needs real time to render before any key is sent.
  boot_wait = "10s"
  # ds=nocloud without s= makes cloud-init discover the seed volume by its
  # "cidata" label, which is what cd_files/cd_label below attach. The previous
  # s=/cdrom/ pointed at the live ISO root instead of the seed volume.
  boot_command = [
    "<esc><wait>",
    "<esc><wait>",
    "c<wait10>",
    "set gfxpayload=keep<enter><wait>",
    "linux /casper/vmlinuz autoinstall ds=nocloud ---<enter><wait>",
    "initrd /casper/initrd<enter><wait>",
    "boot<enter><wait60>",
    "yes<enter>"
  ]
}

build {
  name    = "project-truth-hyperv-image"
  sources = ["source.hyperv-iso.ubuntu"]

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
      "PROJECT_TRUTH_IMAGE_TARGET=hyperv"
    ]
    script = "${path.root}/provision.sh"
  }
}
