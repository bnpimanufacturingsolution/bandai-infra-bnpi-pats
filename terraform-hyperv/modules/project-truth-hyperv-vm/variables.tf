variable "vm_name" {
  type = string
}

variable "switch_name" {
  type = string
}

variable "switch_type" {
  type = string
}

variable "net_adapter_names" {
  type    = list(string)
  default = []
}

variable "source_image_path" {
  type = string
}

variable "vm_path" {
  type = string
}

variable "memory_mb" {
  type = number
}

variable "cpu_count" {
  type = number
}
