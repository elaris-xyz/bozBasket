# . tools/env.ps1   (PowerShell)
# Puts the native Windows Solana/Anchor toolchain and the bundled MinGW
# dlltool on PATH, and loads .env. See CLAUDE.md "Toolchain on this host".
$env:PATH = "$env:USERPROFILE\.local\share\solana\install\active_release\bin;$env:USERPROFILE\.cargo\bin;$env:USERPROFILE\.rustup\toolchains\stable-x86_64-pc-windows-gnu\lib\rustlib\x86_64-pc-windows-gnu\bin\self-contained;$env:PATH"
$env:CARGO_HTTP_TIMEOUT = "900"
$envFile = Join-Path $PSScriptRoot "..\.env"
if (Test-Path $envFile) {
	Get-Content $envFile | ForEach-Object {
		if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {
			Set-Item -Path "env:$($matches[1])" -Value $matches[2].Trim()
		}
	}
}
