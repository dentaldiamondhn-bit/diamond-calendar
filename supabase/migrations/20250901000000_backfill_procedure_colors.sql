-- =====================================================================
-- Migration: backfill existing events with their procedure's tint.
--
-- The event color code now tints each event automatically (EventModal
-- auto-tint effect: the instant a Procedimiento is chosen, the pill adopts
-- PROCEDURE_COLORS[procedure], i.e. EVENT_COLORS[0]=teal is replaced on
-- live-write). Rows created *before* that effect existed still carry the
-- default teal (or an empty) color.
--
-- This backfills them so the whole board matches the new color coding:
--
--   * known procedure AND current color IS NULL / empty / default teal
--       -> set color = PROCEDURE_COLORS[procedure]
--   * known procedure AND color is a manual swatch (already non-default)
--       -> untouched (manual swatches are preser
--   * no procedure OR procedure not in the map
--       -> untouched (keeps default teal tint)
--
-- Idempotent: re-running is a no-op (WHERE only matches default rows).
--
-- Run via:
--   node scripts/run_migration.js 20250901000000_backfill_procedure_colors.sql
-- =====================================================================

UPDATE events
SET color = CASE
    WHEN procedure IS NULL OR procedure = '' THEN '#6b7280'
    WHEN procedure = 'Limpieza' THEN '#0d9488'
    WHEN procedure = 'Chequeo' THEN '#2563eb'
    WHEN procedure = 'Restauraciones' THEN '#059669'
    WHEN procedure = 'Endodoncia' THEN '#7c3aed'
    WHEN procedure = 'Corona' THEN '#e11d48'
    WHEN procedure = 'Extracción' THEN '#d97706'
    WHEN procedure = 'Blanqueamiento' THEN '#0ea5e9'
    WHEN procedure = 'Radiografía' THEN '#2563eb'
    WHEN procedure = 'Ortodoncia' THEN '#7c3aed'
    WHEN procedure = 'Implante' THEN '#0d9488'
    WHEN procedure = 'Promo 3 tapones' THEN '#d97706'
    WHEN procedure = 'Limpieza + 3 tapones' THEN '#059669'
    ELSE color
END
WHERE color IS NULL
   OR color = ''
   OR lower(color) = '#0d9488';
