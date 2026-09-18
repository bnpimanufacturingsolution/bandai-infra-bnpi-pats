terraform {
  required_version = ">= 1.5.0"

  required_providers {
    hyperv = {
      source  = "taliesins/hyperv"
      version = ">= 1.2.1"
    }
  }
}

provider "hyperv" {
  https    = true
  insecure = true
  user     = "zenja"
  use_ntlm = true
}
