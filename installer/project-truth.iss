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
Source: "{#SourceRoot}\image-factory\README.md"; DestDir: "{app}\image-factory"; Flags: ignoreversion

[Dirs]
Name: "{commonappdata}\ProjectTruth\config"
Name: "{commonappdata}\ProjectTruth\images"
Name: "{commonappdata}\ProjectTruth\logs"
Name: "{commonappdata}\ProjectTruth\state"

[Icons]
Name: "{group}\Project Truth"; Filename: "{cmd}"; Parameters: "/c ""{app}\ProjectTruth.cmd"" doctor"; WorkingDir: "{app}"
Name: "{commondesktop}\Project Truth"; Filename: "{cmd}"; Parameters: "/c ""{app}\ProjectTruth.cmd"" doctor"; WorkingDir: "{app}"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Additional shortcuts:"; Flags: unchecked

[Run]
Filename: "{cmd}"; Parameters: "/c echo @echo off> ""{app}\ProjectTruth.cmd"" && echo powershell.exe -NoProfile -ExecutionPolicy Bypass -File ""%~dp0scripts\project-truth.ps1"" %*>> ""{app}\ProjectTruth.cmd"""; Flags: runhidden
