#!/usr/bin/env bash
# Linux / WSL: build bila belum ada, lalu jalankan server. Jalankan dari mana saja.
set -e
cd "$(dirname "$0")"
if [ ! -x build/raceparts ]; then
  cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
  cmake --build build -j"$(nproc)"
fi
./build/raceparts
