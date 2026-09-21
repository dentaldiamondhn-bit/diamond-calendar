/**
 * Backfill migration: give existing events their procedure's tint.
 *
 * New events now auto-tint at creation time (EventModal auto-tint effect:
 * PROCEDURE_COLORS[values.procedure] is applied the moment a procedure is
 * chosen). Rows created before that effect existed still carry the default
 * teal (or an empty) color. This script backfills them so the whole board
 * matches the new per-procedure color coding.
 *
 * Rule (mirrors the modal, manual swatches preserved):
 *   - known procedure + current color is null/empty/still default teal
 *     -> set color = PROCEDURE_COLORS[procedure]
 *   - has no procedure, OR already has a non-default (manual) color
 *     -> left untouched
 *   - procedure not in the map -> left untouched
 *
 * Usage:
 *   node scripts/backfill-procedure-colors.cjs [--dry-run]
 *
 * Environment (reads .env.local, then .env):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

for (const name of ['.env.local', '.env']) {
  const p = path.join(__dirname, '..', name);
  if (fs.existsSync(p)) require('dotenv').config({ path: p });
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const DEFAULT_COLOR = '#0d9488'; // EVENT_COLORS[0].value (teal)

const PROCEDURE_COLORS = {
  Limpieza: '#0d9488',
  Chequeo: '#2563eb',
  Restauraciones: '#059669',
  Endodoncia: '#7c3aed',
  Corona: '#e11d48',
  Extracción: '#d97706',
  Blanqueamiento: '#0ea5e9',
  Radiografía: '#2563eb',
  Ortodoncia: '#7c3aed',
  Implante: '#0d9488',
  'Promo 3 tapones': '#d97706',
  'Limpieza + 3 tapones': '#059669',
};

const NO_PROCEDURE_COLOR = '#6b7280';

const dryRun = process.argv.includes('--dry-run');

async function runBackfill() {
  console.log('Fetching events (id, procedure, color)...');

  const { data: rows, error } = await supabase
    .from('events')
    .select('id, procedure, color');

  if (error) {
    console.error('Failed to fetch events:', error.message);
    process.exit(1);
  }

  let toUpdate = [];
  let noProc = 0;
  let customColor = 0;
  let unknownProc = 0;

  for (const row of rows || []) {
    if (!row.procedure) {
      const tint = NO_PROCEDURE_COLOR;
      const current = (row.color || '').toLowerCase();
      const isDefault = current === '' || current === '#0d9488';
      if (isDefault) {
        toUpdate.push({ id: row.id, color: tint });
      } else {
        noProc++;
      }
      continue;
    }
    const tint = PROCEDURE_COLORS[row.procedure];
    if (!tint) {
      unknownProc++;
      continue;
    }
    const current = (row.color || '').toLowerCase();
    const isDefault = current === '' || current === '#0d9488';
    if (!isDefault) {
      customColor++;
      continue;
    }
    if (row.color === tint) continue;
    toUpdate.push({ id: row.id, color: tint });
  }

  console.log(`events scanned: ${(rows || []).length}`);
  console.log(`to backfill: ${toUpdate.length}`);
  console.log(`no procedure (kept default): ${noProc}`);
  console.log(`manual color (kept): ${customColor}`);
  console.log(`unknown procedure: ${unknownProc}`);

  if (dryRun) {
    console.log('DRY RUN — nothing written');
    return;
  }

  let done = 0;
  for (const item of toUpdate) {
    const { error: updateError } = await supabase
      .from('events')
      .update({ color: item.color })
      .eq('id', item.id);
    if (updateError) {
      console.error(`Update failed for ${item.id}:`, updateError.message);
    } else {
      done++;
    }
  }

  console.log(`Backfill complete — ${done} events updated`);
}

runBackfill().catch((err) => {
  console.error(err);
  process.exit(1);
});
