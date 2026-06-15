#define AppName "Project Truth"
#define AppVersion "0.1.0"
#define SourceRoot ".."

[Setup]
AppId={{7F671155-B008-40A9-8CF2-ED43805B171F}
AppName={#AppName}
AppVersion={#AppVersion}
DefaultDirName={autopf}\ProjectTruth
DefaultGroupName=Project Truth
OutputDir=..\dist
OutputBaseFilename=ProjectTruthSetup
Compression=lzma
SolidCompression=yes
PrivilegesRequired=admin
UninstallDisplayName=Project Truth

[Files]
Source: "{#SourceRoot}\README.md"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#SourceRoot}\app\*"; DestDir: "{app}\app"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#SourceRoot}\docs\*"; DestDir: "{app}\docs"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#SourceRoot}\gitops\*"; DestDir: "{app}\gitops"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#SourceRoot}\terraform-hyperv\*"; DestDir: "{app}\terraform-hyperv"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#SourceRoot}\scripts\*"; DestDir: "{app}\scripts"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#SourceRoot}\installer\*"; DestDir: "{app}\installer"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#SourceRoot}\image-factory\README.md"; DestDir: "{app}\image-factory"; Flags: ignoreversion

[Dirs]
Name: "{commonappdata}\ProjectTruth\config"
Name: "{commonappdata}\ProjectTruth\images"
Name: "{commonappdata}\ProjectTruth\logs"
Name: "{commonappdata}\ProjectTruth\state"

[Icons]
Name: "{group}\Project Truth Doctor"; Filename: "{app}\ProjectTruth.cmd"; Parameters: "doctor"; WorkingDir: "{app}"
Name: "{group}\Select Project Truth Image"; Filename: "{app}\ProjectTruth.cmd"; Parameters: "select-image"; WorkingDir: "{app}"
Name: "{group}\Terraform Plan"; Filename: "{app}\ProjectTruth.cmd"; Parameters: "terraform-plan"; WorkingDir: "{app}"
Name: "{group}\Apply Hyper-V VM"; Filename: "{app}\ProjectTruth.cmd"; Parameters: "terraform-apply"; WorkingDir: "{app}"
Name: "{group}\Watch Until Healthy"; Filename: "{app}\ProjectTruth.cmd"; Parameters: "watch-until-healthy"; WorkingDir: "{app}"
Name: "{group}\Repair And Verify"; Filename: "{app}\ProjectTruth.cmd"; Parameters: "repair-and-verify"; WorkingDir: "{app}"
Name: "{group}\Open Project Truth Folder"; Filename: "{app}"; WorkingDir: "{app}"
Name: "{group}\Open Logs"; Filename: "{commonappdata}\ProjectTruth\logs"; WorkingDir: "{app}"
Name: "{group}\Open Documentation"; Filename: "{app}\docs"; WorkingDir: "{app}"
Name: "{commondesktop}\Project Truth Doctor"; Filename: "{app}\ProjectTruth.cmd"; Parameters: "doctor"; WorkingDir: "{app}"; Tasks: desktopicon
Name: "{commondesktop}\Project Truth Repair And Verify"; Filename: "{app}\ProjectTruth.cmd"; Parameters: "repair-and-verify"; WorkingDir: "{app}"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Additional shortcuts:"; Flags: unchecked

[Run]
Filename: "{cmd}"; Parameters: "/c echo @echo off> ""{app}\ProjectTruth.cmd"" && echo powershell.exe -NoProfile -ExecutionPolicy Bypass -File ""%~dp0scripts\project-truth.ps1"" %*>> ""{app}\ProjectTruth.cmd"""; Flags: runhidden
