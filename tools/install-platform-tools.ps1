# Installs Solana platform-tools for cargo-build-sbf without admin rights.
#
#   . tools/env.ps1
#   tools/install-platform-tools.ps1 -Tarball C:\path\to\platform-tools-windows-x86_64.tar.bz2 [-Version v1.43]
#
# Why this exists: cargo-build-sbf downloads platform-tools itself, then
# creates a *symlink* under <sdk>/sbf/dependencies. On Windows that needs
# SeCreateSymbolicLinkPrivilege (admin or Developer Mode) and fails with
# "os error 1314" after the whole 425 MB download, deleting the cache.
# A directory junction needs no privilege and cargo-build-sbf accepts it.
#
# Get the tarball with curl (resumable, the host is slow):
#   curl -L -C - -o platform-tools-windows-x86_64.tar.bz2 `
#     https://github.com/anza-xyz/platform-tools/releases/download/v1.43/platform-tools-windows-x86_64.tar.bz2

param(
	[Parameter(Mandatory = $true)] [string] $Tarball,
	[string] $Version = "v1.43"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $Tarball)) { throw "tarball not found: $Tarball" }

$home_ = if ($env:HOME) { $env:HOME } else { $env:USERPROFILE }
$cacheDir = Join-Path $home_ ".cache\solana\$Version\platform-tools"
$sdkDeps = Join-Path $home_ ".local\share\solana\install\active_release\bin\sdk\sbf\dependencies"
$link = Join-Path $sdkDeps "platform-tools"

New-Item -ItemType Directory -Force $cacheDir | Out-Null
New-Item -ItemType Directory -Force $sdkDeps | Out-Null

Write-Host "Extracting $Tarball -> $cacheDir"
# Windows ships bsdtar as tar.exe; it understands .tar.bz2.
& tar.exe -xjf $Tarball -C $cacheDir
if ($LASTEXITCODE -ne 0) { throw "tar failed with exit code $LASTEXITCODE" }

if (Test-Path $link) {
	$item = Get-Item $link -Force
	if ($item.LinkType) { cmd /c rmdir "$link" | Out-Null } else { Remove-Item -Recurse -Force $link }
}
cmd /c mklink /J "$link" "$cacheDir" | Out-Null
if ($LASTEXITCODE -ne 0) { throw "mklink /J failed" }

# cargo-build-sbf treats the tools as installed when this marker exists.
$marker = Join-Path $sdkDeps "platform-tools-$Version.md"
if (-not (Test-Path $marker)) { Set-Content -Path $marker -Value "installed from $Tarball on $(Get-Date -Format s)" -Encoding ascii }

& (Join-Path $cacheDir "rust\bin\rustc.exe") --version
Write-Host "platform-tools $Version linked at $link"
