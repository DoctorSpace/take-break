param([string]$Dotnet = 'dotnet', [string]$OutputDirectory = 'dist')
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
& (Join-Path $PSScriptRoot 'generate-icon.ps1')
& $Dotnet run --project (Join-Path $root 'tests\TakeBreak.Tests.csproj') -c Release
if ($LASTEXITCODE -ne 0) { throw 'Tests failed' }
& $Dotnet publish (Join-Path $root 'TakeBreak.csproj') -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -p:DebugType=None -p:DebugSymbols=false -o (Join-Path $root $OutputDirectory)
if ($LASTEXITCODE -ne 0) { throw 'Publish failed' }
Write-Host "Ready: $root\$OutputDirectory\TakeBreak.exe"
