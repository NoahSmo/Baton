#!/bin/sh
# Installs or upgrades Baton on Linux.
#
#   curl -fsSL https://raw.githubusercontent.com/NoahSmo/Baton/main/install.sh | sh
#
# Uses the .deb on apt systems and the .rpm on dnf and zypper ones, both through
# sudo. Elsewhere, or with BATON_INSTALL=user, unpacks the app in ~/.local
# without root. BATON_VERSION=0.2.0 picks a version instead of the latest.
set -eu

REPO="NoahSmo/Baton"

say() { printf '%s\n' "baton: $*"; }
fail() { say "$*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || fail "$1 is required"; }

[ "$(uname -s)" = Linux ] || fail "this script is for Linux. On macOS: brew install --cask noahsmo/tap/baton"
need curl
need tar

case "$(uname -m)" in
  x86_64 | amd64) arch=x64 ;;
  aarch64 | arm64) arch=arm64 ;;
  *) fail "unsupported architecture: $(uname -m)" ;;
esac

version="${BATON_VERSION:-}"
if [ -z "$version" ]; then
  version=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" |
    sed -n 's/.*"tag_name": *"v\{0,1\}\([^"]*\)".*/\1/p' | head -n 1)
  [ -n "$version" ] || fail "could not find the latest release"
fi
base="https://github.com/$REPO/releases/download/v$version"

if [ "$(id -u)" -eq 0 ]; then sudo=""; else sudo="sudo"; fi
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

fetch() {
  say "downloading $1"
  curl -fL --progress-bar -o "$tmp/$1" "$base/$1" || fail "no $1 in release v$version"
}

mode="${BATON_INSTALL:-}"
if [ -z "$mode" ]; then
  if command -v apt-get >/dev/null 2>&1; then mode=deb
  elif command -v dnf >/dev/null 2>&1 || command -v zypper >/dev/null 2>&1; then mode=rpm
  else mode=user
  fi
fi

case "$mode" in
  deb)
    # Debian names the architectures its own way.
    [ "$arch" = x64 ] && deb_arch=amd64 || deb_arch=arm64
    file="Baton-$version-linux-$deb_arch.deb"
    fetch "$file"
    $sudo apt-get install -y "$tmp/$file"
    ;;
  rpm)
    [ "$arch" = x64 ] && rpm_arch=x86_64 || rpm_arch=aarch64
    file="Baton-$version-linux-$rpm_arch.rpm"
    fetch "$file"
    if command -v dnf >/dev/null 2>&1; then $sudo dnf install -y "$tmp/$file"
    else $sudo zypper --non-interactive install --allow-unsigned-rpm "$tmp/$file"
    fi
    ;;
  user)
    file="Baton-$version-linux-$arch.tar.gz"
    fetch "$file"
    dest="$HOME/.local/share/baton"
    rm -rf "$dest"
    mkdir -p "$dest" "$HOME/.local/bin" "$HOME/.local/share/applications" "$HOME/.local/share/icons/hicolor/512x512/apps"
    tar -xzf "$tmp/$file" -C "$dest" --strip-components=1
    ln -sf "$dest/baton" "$HOME/.local/bin/baton"
    curl -fsSL -o "$HOME/.local/share/icons/hicolor/512x512/apps/baton.png" \
      "https://raw.githubusercontent.com/$REPO/v$version/build/icon.png" || true
    cat >"$HOME/.local/share/applications/baton.desktop" <<DESKTOP
[Desktop Entry]
Name=Baton
Comment=Feature-first orchestrator for Claude Code agents
Exec=$dest/baton %U
Icon=baton
Type=Application
Categories=Development;
StartupWMClass=Baton
DESKTOP
    # Chromium's sandbox helper must belong to root to work.
    if [ -n "$sudo" ] && command -v sudo >/dev/null 2>&1; then
      say "setting up Chromium's sandbox helper (sudo)"
      sudo chown root:root "$dest/chrome-sandbox" && sudo chmod 4755 "$dest/chrome-sandbox" ||
        say "could not; if Baton does not start, run: $dest/baton --no-sandbox"
    fi
    case ":$PATH:" in
      *":$HOME/.local/bin:"*) ;;
      *) say "add ~/.local/bin to your PATH to run baton from a terminal" ;;
    esac
    ;;
  *) fail "BATON_INSTALL must be deb, rpm or user" ;;
esac

say "Baton $version installed. It needs git, and Claude Code installed and logged in (run: claude)."
