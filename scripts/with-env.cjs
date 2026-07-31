#!/usr/bin/env node
/**
 * Carga uno o más archivos .env (último gana) y ejecuta el comando.
 * Uso: node scripts/with-env.cjs .env .env.production.local -- nest start --watch
 */
const { spawn } = require('child_process')
const { config } = require('dotenv')
const fs = require('fs')
const path = require('path')

const args = process.argv.slice(2)
const sep = args.indexOf('--')
if (sep < 0 || sep === args.length - 1) {
  console.error('Uso: node scripts/with-env.cjs [archivos.env...] -- <comando> [...args]')
  process.exit(1)
}

const envFiles = args.slice(0, sep)
const cmdParts = args.slice(sep + 1)

for (const file of envFiles) {
  const full = path.resolve(process.cwd(), file)
  if (!fs.existsSync(full)) {
    console.error(`Falta ${file}`)
    console.error(`Copia el .example correspondiente → ${file} y completa secretos.`)
    process.exit(1)
  }
  const result = config({ path: full, override: true })
  if (result.error) {
    console.error(`Error leyendo ${file}:`, result.error.message)
    process.exit(1)
  }
  console.log(`[with-env] cargado ${file}`)
}

process.env.JT_ENV_FILE = envFiles[envFiles.length - 1]
process.env.JT_SKIP_DEFAULT_DOTENV = '1'

const child = spawn(cmdParts.join(' '), {
  stdio: 'inherit',
  env: process.env,
  shell: true,
})
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  process.exit(code ?? 1)
})
