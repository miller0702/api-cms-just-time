#!/usr/bin/env node
require('./apply-db-url.cjs')
const { spawnSync } = require('child_process')
const result = spawnSync(
  process.execPath,
  [require.resolve('prisma/build/index.js'), ...process.argv.slice(2)],
  { stdio: 'inherit', env: process.env },
)
process.exit(result.status ?? 1)
