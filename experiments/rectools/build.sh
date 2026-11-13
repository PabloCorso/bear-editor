#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
cargo build --locked --release --target wasm32-unknown-unknown
wasm-bindgen --target web --out-dir pkg target/wasm32-unknown-unknown/release/bear_rectools.wasm
curl --fail --silent --show-error --location \
  https://raw.githubusercontent.com/elmadev/rectools/2fd03a85d0fee2b42cdf79d9526ae82ed248dfe6/LICENSE.md \
  --output pkg/rectools-LICENSE.txt
