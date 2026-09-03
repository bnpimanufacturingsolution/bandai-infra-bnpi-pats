locals {
  disk_path            = "${var.vm_path}\\Virtual Hard Disks\\${var.vm_name}.vhdx"
  memory_startup_bytes = var.memory_mb * 1024 * 1024
}

resource "hyperv_network_switch" "project_truth" {
  name                                    = var.switch_name
  notes                                   = "Project Truth Hyper-V switch managed by Terraform."
  allow_management_os                     = true
  enable_embedded_teaming                 = false
  enable_iov                              = false
  enable_packet_direct                    = false
  minimum_bandwidth_mode                  = "None"
  switch_type                             = var.switch_type
  net_adapter_names                       = var.net_adapter_names
  default_flow_minimum_bandwidth_absolute = 0
  default_flow_minimum_bandwidth_weight   = 0
  default_queue_vmmq_enabled              = false
  default_queue_vmmq_queue_pairs          = 16
  default_queue_vrss_enabled              = false
}

resource "hyperv_vhd" "project_truth" {
  path   = local.disk_path
  source = var.source_image_path
}

resource "hyperv_machine_instance" "project_truth" {
  name                         = var.vm_name
  path                         = var.vm_path
  generation                   = 2
  processor_count              = var.cpu_count
  memory_startup_bytes         = local.memory_startup_bytes
  static_memory                = true
  automatic_start_action       = "StartIfRunning"
  automatic_stop_action        = "Save"
  automatic_start_delay        = 0
  checkpoint_type              = "Production"
  guest_controlled_cache_types = false
  lock_on_disconnect           = "Off"
  notes                        = "Project Truth K3s/Argo CD node. Base platform comes from prebuilt VHDX."
  state                        = "Running"
  wait_for_ips_timeout         = 600
  wait_for_ips_poll_period     = 5

  vm_firmware {
    enable_secure_boot              = "Off"
    preferred_network_boot_protocol = "IPv4"
    console_mode                    = "None"
    pause_after_boot_failure        = "Off"

    boot_order {
      boot_type           = "HardDiskDrive"
      controller_number   = "0"
      controller_location = "0"
    }
  }

  vm_processor {
    compatibility_for_migration_enabled               = false
    compatibility_for_older_operating_systems_enabled = false
    hw_thread_count_per_core                          = 0
    maximum                                           = 100
    reserve                                           = 0
    relative_weight                                   = 100
    maximum_count_per_numa_node                       = 0
    maximum_count_per_numa_socket                     = 0
    enable_host_resource_protection                   = false
    expose_virtualization_extensions                  = false
  }

  integration_services = {
    "Guest Service Interface" = true
    "Heartbeat"               = true
    "Key-Value Pair Exchange" = true
    "Shutdown"                = true
    "Time Synchronization"    = true
    "VSS"                     = true
  }

  network_adaptors {
    name                              = "lan"
    switch_name                       = hyperv_network_switch.project_truth.name
    management_os                     = false
    is_legacy                         = false
    dynamic_mac_address               = true
    mac_address_spoofing              = "Off"
    dhcp_guard                        = "Off"
    router_guard                      = "Off"
    port_mirroring                    = "None"
    ieee_priority_tag                 = "Off"
    vmq_weight                        = 100
    iov_queue_pairs_requested         = 1
    iov_interrupt_moderation          = "Off"
    iov_weight                        = 0
    maximum_bandwidth                 = 0
    minimum_bandwidth_absolute        = 0
    minimum_bandwidth_weight          = 0
    resource_pool_name                = ""
    test_replica_pool_name            = ""
    test_replica_switch_name          = ""
    virtual_subnet_id                 = 0
    allow_teaming                     = "Off"
    not_monitored_in_cluster          = false
    storm_limit                       = 0
    dynamic_ip_address_limit          = 0
    device_naming                     = "Off"
    fix_speed_10g                     = "Off"
    packet_direct_num_procs           = 0
    packet_direct_moderation_count    = 0
    packet_direct_moderation_interval = 0
    vrss_enabled                      = true
    vmmq_enabled                      = false
    vmmq_queue_pairs                  = 16
    wait_for_ips                      = true
  }

  hard_disk_drives {
    controller_type                 = "Scsi"
    controller_number               = "0"
    controller_location             = "0"
    path                            = hyperv_vhd.project_truth.path
    disk_number                     = 4294967295
    resource_pool_name              = "Primordial"
    support_persistent_reservations = false
    maximum_iops                    = 0
    minimum_iops                    = 0
    qos_policy_id                   = "00000000-0000-0000-0000-000000000000"
    override_cache_attributes       = "Default"
  }
}
