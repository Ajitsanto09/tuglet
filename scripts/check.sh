#!/bin/bash
# Builds and runs the reminder-logic self-checks.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p build
swiftc -O Sources/Core/*.swift Checks/main.swift -o build/checks
build/checks
