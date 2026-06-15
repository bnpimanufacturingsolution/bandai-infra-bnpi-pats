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

output "dev_health_url" {
  value = var.guest_ip_hint == "" ? "http://<guest-lan-ip>:${var.dev_port}/health" : "http://${var.guest_ip_hint}:${var.dev_port}/health"
}

output "uat_health_url" {
  value = var.guest_ip_hint == "" ? "http://<guest-lan-ip>:${var.uat_port}/health" : "http://${var.guest_ip_hint}:${var.uat_port}/health"
}

output "prod_health_url" {
  value = var.guest_ip_hint == "" ? "http://<guest-lan-ip>:${var.prod_port}/health" : "http://${var.guest_ip_hint}:${var.prod_port}/health"
}
