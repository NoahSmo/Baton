#!/bin/sh
# Builds the Linux packages (.deb, .rpm, .tar.gz) in Docker, for x64 and arm64,
# into dist/. node-pty is compiled for Linux there, which a Mac cannot do.
#
#   scripts/build-linux.sh            both architectures
#   scripts/build-linux.sh arm64      one of them
set -eu

root=$(cd "$(dirname "$0")/.." && pwd)
archs="${*:-arm64 x64}"

for arch in $archs; do
  case "$arch" in
    x64) platform=linux/amd64 ;;
    arm64) platform=linux/arm64 ;;
    *) echo "build-linux: unknown architecture $arch" >&2; exit 1 ;;
  esac
  echo "build-linux: $arch"
  # The sources are copied in: the host's node_modules hold macOS binaries.
  docker run --rm --platform "$platform" \
    -v "$root:/src:ro" -v "$root/dist:/out" \
    node:22-bookworm sh -euc "
      apt-get update -qq && apt-get install -y -qq rpm build-essential python3 >/dev/null
      mkdir /build && cd /src
      tar --exclude=./node_modules --exclude=./dist --exclude=./out --exclude=./.git -cf - . | tar -xf - -C /build
      cd /build
      npm ci --no-audit --no-fund
      npx electron-vite build
      npx electron-builder --linux deb rpm tar.gz --$arch --publish never
      cp dist/*.deb dist/*.rpm dist/*.tar.gz /out/
    "
done
