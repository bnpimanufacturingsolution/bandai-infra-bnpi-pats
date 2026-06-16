# Project Truth Image Formats

Project Truth separates the platform image from the runtime target. The image
factory can publish more than one client artifact, but each artifact has a clear
consumer.

## Supported Artifacts

| Target platform | Artifact | Consumer |
|---|---|---|
| `hyperv` | `.vhdx` | Terraform Hyper-V host flow |
| `virtualbox` | `.vdi` first, `.ova` allowed | VirtualBox client handoff |

The Hyper-V Terraform flow still requires `.vhdx`. A VirtualBox `.vdi` is not a
drop-in replacement for `terraform-hyperv/`.

## Maintainer Builds

Build and publish the Hyper-V artifact:

```powershell
.\scripts\project-truth.ps1 build-image -TargetPlatform hyperv
```

Build and publish the VirtualBox artifact:

```powershell
.\scripts\project-truth.ps1 build-image -TargetPlatform virtualbox
```

Publish an already-built VirtualBox image without rebuilding:

```powershell
.\scripts\project-truth.ps1 build-image -TargetPlatform virtualbox -SkipBuild -BuiltImagePath <path-to-project-truth.vdi>
```

## User Selection

Select a Hyper-V image:

```powershell
.\scripts\project-truth.ps1 select-image -TargetPlatform hyperv -ImagePath C:\ProgramData\ProjectTruth\images\project-truth-node-latest.vhdx
```

Select a VirtualBox image:

```powershell
.\scripts\project-truth.ps1 select-image -TargetPlatform virtualbox -ImagePath C:\ProgramData\ProjectTruth\images\project-truth-node-latest.vdi
```

## Notes

VirtualBox can use its own `.vdi` disk format directly. Packer's VirtualBox
builder can also export OVA/OVF appliances, but the first client artifact for
this project is VDI because that is the requested client handoff format.
