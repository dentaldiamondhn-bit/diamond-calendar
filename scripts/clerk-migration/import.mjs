import fs from 'node:fs'
import path from 'node:path'

const HERE = path.dirname(new URL(import.meta.url).pathname)
const CSV_PATH = path.join(process.cwd(), process.argv[2] || 'ins_37G8KO1vwnaJfFeL0LCDdrfFYHI.csv')
const MAPPING_PATH = path.join(HERE, 'mapping.json')

function loadEnv() {
  const out = {}
  const txt = fs.existsSync(path.join(process.cwd(), '.env')) ? fs.readFileSync(path.join(process.cwd(), '.env'), 'utf8') : ''
  for (const line of txt.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)=["']?(.*?)["']?\s*$/)
    if (m) out[m[1]] = m[2]
  }
  return out
}

function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let inQ = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else inQ = false
      } else field += c
    } else if (c === '"') inQ = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n') {
      row.push(field)
      if (row.some((x) => x !== '')) rows.push(row)
      row = []
      field = ''
    } else field += c
  }
  row.push(field)
  if (row.some((x) => x !== '')) rows.push(row)
  return rows
}

const env = loadEnv()
const secretKey = env.CLERK_SECRET_KEY
const baseUrl = 'https://api.clerk.com/v1/users'

if (!secretKey || !secretKey.startsWith('sk_live_')) {
  console.error('CLERK_SECRET_KEY in .env must be a sk_live_ key (production target).')
  process.exit(1)
}

const [header, ...data] = parseCsv(fs.readFileSync(CSV_PATH, 'utf8'))
const cols = Object.fromEntries(header.map((h, i) => [h, i]))

const delay = (ms) => new Promise((r) => setTimeout(r, ms))

async function clerk(pathPart, opts = {}) {
  const res = await fetch(baseUrl + pathPart, {
    method: opts.method || 'GET',
    headers: { Authorization: 'Bearer ' + secretKey, 'Content-Type': 'application/json' },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch { json = text }
  return { status: res.status, json }
}

async function findExisting(email) {
  const { json } = await clerk('?email_address=' + encodeURIComponent(email))
  if (Array.isArray(json) && json.length > 0) return json[0]
  return null
}

async function createUser(row) {
  const oldId = row[cols.id]
  const firstName = row[cols.first_name] || undefined
  const lastName = row[cols.last_name] || undefined
  const username = row[cols.username] || undefined
  const primary = row[cols.primary_email_address]
  const passwordDigest = row[cols.password_digest] || undefined

  const verified = (row[cols.verified_email_addresses] || '').split('|').filter(Boolean)
  const unverified = (row[cols.unverified_email_addresses] || '').split('|').filter(Boolean)
  const emailAddresses = [...new Set([primary, ...verified, ...unverified].filter(Boolean))]

  if (emailAddresses.length) {
    const existing = await findExisting(emailAddresses[0])
    if (existing) {
      console.log('EXISTS, reusing', existing.id, '<-', oldId, emailAddresses[0])
      return { oldId, newId: existing.id, email: emailAddresses[0], firstName, lastName, reused: true }
    }
  }

  const body = {
    external_id: oldId,
    first_name: firstName,
    last_name: lastName,
    username,
    email_addresses: emailAddresses,
    email_address_verification_strategy: 'verified',
    skip_password_requires: true,
  }
  if (passwordDigest) {
    body.password_digest = passwordDigest
    body.password_hasher = 'bcrypt'
  }

  const { status, json } = await clerk('', { method: 'POST', body })
  if (status === 200 || status === 201) {
    console.log('CREATED', json.id, '<-', oldId, emailAddresses[0] || '(no email)')
    return { oldId, newId: json.id, email: emailAddresses[0] || '', firstName, lastName, reused: false }
  }
  console.error('FAILED', oldId, emailAddresses[0], status, JSON.stringify(json).slice(0, 300))
  return null
}

console.log('Importing', data.length, 'users into production Clerk...')
const mapping = []
for (let i = 0; i < data.length; i++) {
  const result = await createUser(data[i])
  if (result) mapping.push(result)
  await delay(120)
}

fs.writeFileSync(MAPPING_PATH, JSON.stringify(mapping, null, 2))
console.log(`\nWrote ${mapping.length} entries to ${MAPPING_PATH}`)
const failed = data.length - mapping.length
if (failed > 0) {
  console.warn(`WARN: ${failed} rows did not map. Check output above.`)
}