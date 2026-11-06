#!/usr/bin/env bash
# Builds NEAR-compatible wasm for both contracts using cargo-near
# (cargo-near applies the wasm feature flags nearcore accepts).
#   Install once:  cargo install cargo-near --locked   (or the prebuilt installer from github.com/near/cargo-near)
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p res
for c in quire-market qusd-token; do
  (cd "$c" && cargo near build non-reproducible-wasm)
  cp "target/near/${c//-/_}/${c//-/_}.wasm" "res/${c}.wasm"
done
ls -la res
