#!/bin/bash
set -e
cd "$(dirname "$0")"
echo "→ Starting India Stock Analysis Dashboard..."
echo "   http://localhost:3000"
echo "   Set Supabase env vars in .env.local for persistent data storage"
npm run dev
