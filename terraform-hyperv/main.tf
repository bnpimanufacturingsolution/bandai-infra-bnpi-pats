module "project_truth_hyperv_vm" {
  source = "./modules/project-truth-hyperv-vm"

  vm_name           = var.vm_name
  switch_name       = var.switch_name
  switch_type       = var.switch_type
  net_adapter_names = var.net_adapter_names
  source_image_path = var.source_image_path
  vm_path           = var.vm_path
  memory_mb         = var.memory_mb
  cpu_count         = var.cpu_count
}
