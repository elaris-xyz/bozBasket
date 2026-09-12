# source tools/env.sh   (Git Bash)
# Puts the native Windows Solana/Anchor toolchain and the bundled MinGW
# dlltool on PATH, and loads .env. See CLAUDE.md "Toolchain on this host".
export PATH="$HOME/.local/share/solana/install/active_release/bin:$HOME/.cargo/bin:$HOME/.rustup/toolchains/stable-x86_64-pc-windows-gnu/lib/rustlib/x86_64-pc-windows-gnu/bin/self-contained:$PATH"
export CARGO_HTTP_TIMEOUT=900
if [ -f "$(dirname "${BASH_SOURCE[0]}")/../.env" ]; then
	set -a; . "$(dirname "${BASH_SOURCE[0]}")/../.env"; set +a
fi
