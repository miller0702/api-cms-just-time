#!/usr/bin/env node
if (!process.env.npm_config_user_agent?.includes('pnpm')) {
  console.error('\nUsa pnpm (no npm/yarn).\n  corepack enable && pnpm install\n')
  process.exit(1)
}
