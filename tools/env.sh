# source tools/env.sh   (Git Bash)
# Puts the native Windows Solana/Anchor toolchain and the bundled MinGW
# dlltool/as (MSYS2 ucrt64 binutils) on PATH, sets HOME for cargo-build-sbf, and loads .env. See CLAUDE.md "Toolchain on this host".
export PATH="$HOME/.local/share/solana/install/active_release/bin:$HOME/.cargo/bin:/c/msys64/ucrt64/bin:$PATH"
export CARGO_HTTP_TIMEOUT=900
export HOME="${HOME:-$USERPROFILE}"
# Parse .env line by line instead of sourcing it: values such as
# "?sslmode=require&channel_binding=require" contain shell metacharacters.
_envfile="$(dirname "${BASH_SOURCE[0]}")/../.env"
if [ -f "$_envfile" ]; then
	while IFS= read -r _line || [ -n "$_line" ]; do
		case "$_line" in ''|'#'*) continue;; esac
		_key="${_line%%=*}"; _val="${_line#*=}"
		export "$_key=$_val"
	done < "$_envfile"
fi
unset _envfile _line _key _val
