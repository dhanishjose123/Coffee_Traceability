$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$BundledNode = "C:\Users\hp\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
$BundledModules = "C:\Users\hp\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules"
$RunDir = Join-Path $env:TEMP "digital-twin-excel-export"
$LocalModules = Join-Path $RunDir "node_modules"
$TablesDir = Join-Path $ScriptDir "logs\tables"

if (!(Test-Path $BundledNode)) {
  throw "Bundled Node.js not found: $BundledNode"
}

if (!(Test-Path $BundledModules)) {
  throw "Bundled node_modules not found: $BundledModules"
}

if (!(Test-Path $RunDir)) {
  New-Item -ItemType Directory -Path $RunDir | Out-Null
}

if (!(Test-Path $LocalModules)) {
  New-Item -ItemType Junction -Path $LocalModules -Target $BundledModules | Out-Null
}

Copy-Item -Path (Join-Path $ScriptDir "export_results_excel.mjs") -Destination (Join-Path $RunDir "export_results_excel.mjs") -Force

$env:RESULTS_DIR = $TablesDir
$env:EXCEL_OUT_DIR = $TablesDir

Push-Location $RunDir
try {
  & $BundledNode ".\export_results_excel.mjs"
} finally {
  Pop-Location
}
