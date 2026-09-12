# source tools/env.sh   (Git Bash)
# Puts the native Windows Solana/Anchor toolchain and the bundled MinGW
# dlltool/as (MSYS2 ucrt64 binutils) on PATH, sets HOME for cargo-build-sbf, and loads .env. See CLAUDE.md "Toolchain on this host".
export PATH="$HOME/.local/share/solana/install/active_release/bin:$HOME/.cargo/bin:/c/msys64/ucrt64/bin:$PATH"
export CARGO_HTTP_TIMEOUT=900
export HOME="${HOME:-$USERPROFILE}"
if [ -f "$(dirname "${BASH_SOURCE[0]}")/../.env" ]; then
	set -a; . "$(dirname "${BASH_SOURCE[0]}")/../.env"; set +a
fi
