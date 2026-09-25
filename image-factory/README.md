# Image Factory

This folder is maintainer-only.

Normal users should not run Packer. Hyper-V users should consume a released VHDX and checksum through the Project Truth CLI, then import and start the Hyper-V VM directly with the CLI. VirtualBox clients should consume the separate VDI/OVA artifact.

Use this flow only when the base platform changes:

```text
packer build
  -> publish project-truth-node-<version>.vhdx for Hyper-V
  -> publish project-truth-node-<version>.vdi for VirtualBox
  -> publish project-truth-node-<version>.sha256
  -> normal users select/download the new image
```

Local maintainer command:

```powershell
.\scripts\project-truth.ps1 build-image
.\scripts\project-truth.ps1 build-image -TargetPlatform virtualbox
```

To create or repair a VirtualBox VM from the selected VDI with bridged networking:

```powershell
.\scripts\project-truth.ps1 configure-virtualbox -ImagePath C:\ProgramData\BandaiApp\Bnpipats\images\project-truth-node-latest.vdi -VmName project-truth-node-01 -Start
```

To publish an already-built bootable image:

```powershell
.\scripts\project-truth.ps1 build-image -TargetPlatform hyperv -SkipBuild -BuiltImagePath <path-to-bootable-project-truth.vhdx>
.\scripts\project-truth.ps1 build-image -TargetPlatform virtualbox -SkipBuild -BuiltImagePath <path-to-bootable-project-truth.vdi>
```

Do not use `New-VHD` or an empty VirtualBox disk as a shortcut. The artifact must be a bootable Project Truth image with K3s and Argo CD content.
