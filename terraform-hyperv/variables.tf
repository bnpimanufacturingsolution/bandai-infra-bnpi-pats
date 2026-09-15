variable "vm_name" {
  type        = string
  description = "Hyper-V VM name."
  default     = "project-truth-node-01"
}

variable "switch_name" {
  type        = string
  description = "Hyper-V switch name."
  default     = "ProjectTruth-External"
}

variable "switch_type" {
  type        = string
  description = "Hyper-V switch type. External is the target architecture; Internal is useful for dry labs."
  default     = "External"

  validation {
    condition     = contains(["External", "Internal", "Private"], var.switch_type)
    error_message = "switch_type must be External, Internal, or Private."
  }
}

variable "net_adapter_names" {
  type        = list(string)
  description = "Physical adapter names for an External switch. Leave empty for Internal or pre-created switch testing."
  default     = []
}

variable "source_image_path" {
  type        = string
  description = "Absolute path to the prebuilt Project Truth VHDX."
}

variable "vm_path" {
  type        = string
  description = "Folder where Hyper-V VM files and copied VHDX are placed."
  default     = "C:\\ProgramData\\ProjectTruth\\HyperV"
}

variable "memory_mb" {
  type        = number
  description = "Startup memory in MB."
  default     = 4096
}

variable "cpu_count" {
  type        = number
  description = "Virtual CPU count."
  default     = 2
}

variable "ssh_port" {
  type        = number
  description = "Documented guest LAN SSH port."
  default     = 22
}

variable "api_port" {
  type        = number
  description = "BNPI PATS API LAN port."
  default     = 3001
}

variable "app_port" {
  type        = number
  description = "BNPI PATS App LAN port."
  default     = 3000
}

variable "guest_ip_hint" {
  type        = string
  description = "Optional expected guest LAN IP for URL outputs before integration services report an IP."
  default     = ""
}

variable "allow_destroy_existing_vm" {
  type        = bool
  description = "Safety gate. This module does not use this to destroy; scripts inspect it before destructive operations."
  default     = false
}
