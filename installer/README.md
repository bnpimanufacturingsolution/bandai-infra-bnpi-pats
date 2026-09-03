# Project Truth Installer

Normal users install Project Truth through either:

```text
ProjectTruthSetup.exe
```

or the PowerShell fallback:

```powershell
.\installer\install-project-truth.ps1
```

The installer does not run Packer. It installs the CLI, Terraform configuration, GitOps manifests, and docs, then creates a shortcut that launches the installed CLI.
