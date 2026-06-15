output "vm_name" {
  value = hyperv_machine_instance.project_truth.name
}

output "switch_name" {
  value = hyperv_network_switch.project_truth.name
}

output "ip_addresses" {
  value = try(hyperv_machine_instance.project_truth.network_adaptors[0].ip_addresses, [])
}
