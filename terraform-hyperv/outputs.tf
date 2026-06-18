output "vm_name" {
  value = module.project_truth_hyperv_vm.vm_name
}

output "switch_name" {
  value = module.project_truth_hyperv_vm.switch_name
}

output "guest_ip_hint" {
  value = var.guest_ip_hint
}

output "ssh_target" {
  value = var.guest_ip_hint == "" ? "infra@<guest-lan-ip>" : "infra@${var.guest_ip_hint}"
}

output "hris_api_health_url" {
  value = var.guest_ip_hint == "" ? "http://<guest-lan-ip>:${var.api_port}/health" : "http://${var.guest_ip_hint}:${var.api_port}/health"
}

output "hris_app_url" {
  value = var.guest_ip_hint == "" ? "http://<guest-lan-ip>:${var.app_port}/" : "http://${var.guest_ip_hint}:${var.app_port}/"
}
