#!/usr/bin/env bash
set -euo pipefail

echo "Installing agentswarm..."

# Check dependencies
for cmd in bash tmux python3; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "Error: $cmd is required. Install it first."
    exit 1
  fi
done

# Check PyYAML
if ! python3 -c "import yaml" 2>/dev/null; then
  echo "Installing PyYAML..."
  pip3 install pyyaml --quiet
fi

# Install to ~/.local/bin
INSTALL_DIR="${HOME}/.local/bin"
mkdir -p "$INSTALL_DIR"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cat > "${INSTALL_DIR}/agentswarm" << EOF
#!/usr/bin/env bash
exec bash "${SCRIPT_DIR}/src/cli.sh" "\$@"
EOF

chmod +x "${INSTALL_DIR}/agentswarm"

echo "Done. Run 'agentswarm help' to get started."
echo "Make sure ${INSTALL_DIR} is in your PATH."
