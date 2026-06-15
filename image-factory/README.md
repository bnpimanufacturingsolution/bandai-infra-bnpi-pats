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
