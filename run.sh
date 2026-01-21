#!/bin/bash
set -e
cd "@temp-test-run/dashboard"
pnpm install
pnpm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
