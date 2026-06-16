# Image Factory

This folder is maintainer-only.

Normal users should not run Packer. They should consume a released VHDX and checksum through the Project Truth CLI, then let Terraform create the Hyper-V VM from that image.

Use this flow only when the base platform changes:

```text
packer build
  -> publish project-truth-node-<version>.vhdx
  -> publish project-truth-node-<version>.sha256
  -> normal users select/download the new image
```

Local maintainer command:

```powershell
.\scripts\project-truth.ps1 build-image
```

To publish an already-built bootable image:

```powershell
.\scripts\project-truth.ps1 build-image -SkipBuild -BuiltImagePath <path-to-bootable-project-truth.vhdx>
```

Do not use `New-VHD` as a shortcut. The artifact must be a bootable Project Truth image with K3s and Argo CD content.
