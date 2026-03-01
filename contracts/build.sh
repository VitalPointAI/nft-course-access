#!/bin/bash
set -e

cd "$(dirname "$0")"

echo "Building course-access-nft contract..."
cd course-access-nft
cargo build --target wasm32-unknown-unknown --release

# Copy to deploy folder
mkdir -p ../../deploy
cp target/wasm32-unknown-unknown/release/course_access_nft.wasm ../../deploy/

echo "✅ Contract built: deploy/course_access_nft.wasm"
