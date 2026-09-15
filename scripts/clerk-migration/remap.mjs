import fs from 'node:fs'
import path from 'node:path'

const HERE = path.dirname(new URL(import.meta.url).pathname)
const MAPPING_PATH = path.join(HERE, 'mapping.json')

const SUPABASE_URL = 'https://hmtkayufelqyfytpmdtl.supabase.co'
const REST = SUPABASE_URL + '/rest/v1'

const REMAP_COLS = [
  ['events', 'user_id'],
  ['event_invitees', 'user_id'],
  ['event_invitees', 'created_by'],
  ['notifications', 'user_id'],
  ['push_subscriptions', 'user_id'],
  ['reminders', 'user_id'],
  ['tasks', 'user_id'],
  ['doctors', 'user_id'],
]

function loadEnv() {
  const out = {}
  const txt = fs.existsSync(path.join(process.cwd(), '.env')) ? fs.readFileSync(path.join(process.cwd(), '.env'), 'utf8') : ''
  for (const line of txt.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)=["']?(.*?)["']?\s*$/)
    if (m) out[m[1]] = m[2]
  }
  return out
}

const apply = process.argv.includes('--apply')
const env = loadEnv()
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY

if (!serviceKey) {
  console.error('SUPABASE_SERVICE_ROLE_KEY not found in .env')
  process.exit(1)
}

const headers = {
  apikey: serviceKey,
  Authorization: 'Bearer ' + serviceKey,
  'Content-Type': 'application/json',
}

const mapping = JSON.parse(fs.readFileSync(MAPPING_PATH, 'utf8'))
console.log('Mappings loaded:', mapping.length)
console.log('Mode:', apply ? 'APPLY' : 'DRY-RUN (add --apply to write)')
console.log('')

async function count(table, col, value) {
  const url = `${REST}/${table}?${col}=eq.${encodeURIComponent(value)}&select=id`
  const res = await fetch(url, { method: 'HEAD', headers: { ...headers, Prefer: 'count=exact' } })
  const range = res.headers.get('content-range') || res.headers.get('content-range') || ''
  const total = Number((range.match(/\/(\d+)/) || [])[1])
  return isNaN(total) ? 0 : total
}

async function patch(table, col, from, to) {
  const url = `${REST}/${table}?${col}=eq.${encodeURIComponent(from)}`
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { ...headers, Prefer: 'return=minimal' },
    body: JSON.stringify({ [col]: to }),
  })
  return res.ok
}

const summary = {}
for (const [table, col] of REMAP_COLS) {
  for (const m of mapping) {
    const n = await count(table, col, m.oldId)
    if (n > 0) {
      const key = `${table}.${col}`
      summary[key] = (summary[key] || 0) + n
      if (apply) {
        const ok = await patch(table, col, m.oldId, m.newId)
        console.log(`${ok ? 'UPDATED' : 'ERROR'} ${key}: ${m.oldId} -> ${m.newId} (${n} rows)`)
      } else {
        console.log(`${key}: ${m.oldId} -> ${m.newId} (${n} rows)`)
      }
    }
  }
}

console.log('')
if (apply) {
  console.log('APPLY finished. Verifying...')
  let remaining = 0
  for (const [table, col] of REMAP_COLS) {
    for (const m of mapping) {
      const n = await count(table, col, m.oldId)
      if (n > 0) {
        remaining += n
        console.log(`REMAINING ${table}.${col} ${m.oldId}: ${n}`)
      }
    }
  }
  console.log(remaining === 0 ? 'VERIFIED: no rows reference old ids.' : `INCOMPLETE: ${remaining} rows still reference old ids.`)
} else {
  console.log('DRY-RUN totals:')
  for (const [k, v] of Object.entries(summary)) console.log(`  ${k}: ${v}`)
}