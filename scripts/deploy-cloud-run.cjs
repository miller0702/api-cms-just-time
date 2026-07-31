#!/usr/bin/env node
/**
 * Build + deploy Cloud Run (pnpm / gcloud).
 * Uso: node scripts/deploy-cloud-run.cjs --env=dev|prod
 *
 * Overrides: JT_GCP_PROJECT, JT_REGION, JT_AR_REPO, JT_SERVICE_DEV, JT_SERVICE_PROD, JT_IMAGE_NAME
 */
const { spawnSync } = require('child_process')

const envArg = (process.argv.find((a) => a.startsWith('--env=')) || '--env=dev').split('=')[1]
if (!['dev', 'prod'].includes(envArg)) {
  console.error('Usa --env=dev o --env=prod')
  process.exit(1)
}

const project = process.env.JT_GCP_PROJECT || 'just-time-sas'
const region = process.env.JT_REGION || 'europe-west1'
const repo = process.env.JT_AR_REPO || 'just-time'
const imageName = process.env.JT_IMAGE_NAME || 'cms-api'
const service =
  envArg === 'prod'
    ? process.env.JT_SERVICE_PROD || 'api-cms-just-time'
    : process.env.JT_SERVICE_DEV || 'api-cms-just-time-dev'

const tag = `${region}-docker.pkg.dev/${project}/${repo}/${imageName}:${envArg}`

function run(cmd, args) {
  console.log(`\n> ${cmd} ${args.join(' ')}\n`)
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: false })
  if (r.status !== 0) process.exit(r.status ?? 1)
}

run('gcloud', ['config', 'set', 'project', project])
run('gcloud', ['builds', 'submit', '--tag', tag, '.'])
run('gcloud', [
  'run',
  'deploy',
  service,
  '--image',
  tag,
  '--region',
  region,
  '--platform',
  'managed',
  '--allow-unauthenticated',
  '--port',
  '8080',
])

console.log(`\nOK: ${service} (${envArg}) ← ${tag}`)
console.log('Secretos (DATABASE_URL, JWT, Firebase, etc.): Secret Manager + --set-secrets en Cloud Run.')
