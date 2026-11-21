# Implementation Plan: Patient DOB Events & Birthday Outreach

**Clinic:** Clínica Dental Diamond  
**Repository:** diamond-calendar  
**Status:** ✅ **Complete** — All 5 phases implemented + birthday view refactor, type-checked (`tsc --noEmit` clean for all implementation files)  
**Author:** Senior Full-Stack Architect  
**Date:** 2026-11-21

---

## Summary

Implemented patient Date of Birth (DOB) events and birthday outreach workflows for Clínica Dental Diamond into the existing `diamond-calendar` app. DOB events are **dynamically projected** from `patients.fecha_nacimiento` at query time — never materialized into `events` — avoiding endless duplication. Birthday outreach uses WhatsApp with an optional promotion toggle, guarded against duplicate wishes per patient per year.

Birthdays are rendered in a **dedicated `Cumpleaños` view tab** (separate from clinical `Mes | Semana | Semana laboral | Día | Agenda`), preventing birthday pills from crowding clinical appointments.

---

## Files Changed / Created

### New files

| File | Purpose |
|------|---------|
| `supabase/migrations/20261121000000_patient_birthday_wishes.sql` | `patient_birthday_wishes` table (patient_id TEXT, UNIQUE(patient_id, wish_year), RLS, indexes) |
| `supabase/migrations/20261121000001_birthday_cron.sql` | Defensive pg_cron job `'0 14 * * *'` (08:00 Honduras) + idempotency notes |
| `src/calendario/dobProjection.ts` | `projectDobEvents()` — leap-year-safe, Tegucigalpa, wish enrichment |
| `src/calendario/birthdayTemplates.ts` | `buildBirthdayWhatsAppMessage()`, `ACTIVE_BIRTHDAY_PROMO`, `promoPayload()` |
| `src/calendario/BirthdaysView.tsx` | Dedicated glassmorphic birthday outreach view (Hoy / Próximos este mes / Ya celebrados este mes) |
| `app/api/dob-events/route.ts` | Clerk-gated + service-role, returns projected DOB events |
| `app/api/birthday-wishes/route.ts` | POST records wish (409 on dup); GET lists user's wishes |
| `app/api/cron/birthdays/route.ts` | POST/GET, CRON_SECRET gated, idempotent staff bell/push alerts |
| `.github/workflows/birthday-cron-fallback.yml` | GitHub Actions fallback at `'15 14 * * *'` (08:15 Honduras) |

### Modified files

| File | Change |
|------|--------|
| `lib/supabase-types.ts` | `patients` → real Spanish columns (`paciente_id`, `nombre_completo`, `numero_identidad`, `telefono`, `fecha_nacimiento`); added `patient_birthday_wishes` table type |
| `src/lib/types-calendar.ts` | `ClinicEvent.event_type` adds `'dob'`; `is_dob_event?: boolean` |
| `src/calendario/event/eventSchema.ts` | `'dob'` in `EVENT_TYPES`; `EVENT_TYPE_LABELS.dob = 'Cumpleaños'` |
| `src/calendario/calendarRepository.ts` | Added `getDobEvents(range)` |
| `src/calendario/hooks/useCalendarData.ts` | Added `useDobEvents(range)` + `calendarKeys.dobEvents` |
| `src/calendario/range.ts` | Added `CalendarView` type (`View \| 'birthdays'`); `viewToRange` handles `birthdays` (full month window) |
| `src/calendario/calendarComponents.tsx` | `VIEW_LABELS` adds `birthdays: 'Cumpleaños'`; `CalendarToolbar` accepts `CalendarView`; toolbar removed from RBC `components` (rendered in shell) |
| `src/calendario/CalendarShell.tsx` | `view` type is `CalendarView`; DOB events excluded from clinical views (only merged for `birthdays` view); renders `BirthdaysView` for `view === 'birthdays'`; `CalendarToolbar` rendered directly with `Cumpleaños` tab; removed 🎂 toggle chip |
| `src/calendario/rbcAdapter.ts` | DOB events → `allDay: true`, birthday color (kept for backward compat) |
| `src/calendario/eventTint.ts` | Added `tintedDobEventStyle()` (pink `#ec4899`) |
| `src/calendario/RbcCalendar.tsx` | `eventPropGetter` uses dob tint for DOB events (kept for backward compat) |
| `components/calendar-new/EventModal.tsx` | `ModalPrefill` extended with patient fields; pre-fills from DOB |
| `components/calendar-new/EventDetailDrawer.tsx` | "Enviar felicitación" WhatsApp, "Ya felicitado ✓", "Agendar cita", promo toggle, read-only DOB |
| `components/calendar-new/DayDetail.tsx` | Cake icon + "Cumpleaños" badge for DOB events (kept for backward compat) |

---

## Architecture: Dedicated `Cumpleaños` View

### View separation

| View | Shows DOB events? | Component |
|------|-------------------|-----------|
| `Mes` | ❌ No | `RbcCalendar` (clinical only) |
| `Semana` | ❌ No | `RbcCalendar` (clinical only) |
| `Semana laboral` | ❌ No | `RbcCalendar` (clinical only) |
| `Día` | ❌ No | `RbcCalendar` (clinical only) |
| `Agenda` | ❌ No | `RbcCalendar` (clinical only) |
| `Cumpleaños` (`birthdays`) | ✅ Yes | `BirthdaysView` (dedicated glassmorphic view) |

### `BirthdaysView.tsx` sections

- **Hoy** — highlighted at top when viewing the current month
- **Próximos este mes** — grouped by date (e.g. `Sáb 21 Nov`), sorted chronologically
- **Ya celebrados este mes** — muted section for earlier days in the selected month

### Row actions (inline, no drawer needed)

- **Promo toggle** — "Adjuntar regalo de cumpleaños" (unchecked by default, controlled by `ACTIVE_BIRTHDAY_PROMO.enabledByDefault`)
- **Enviar felicitación** — opens WhatsApp via `createWhatsAppUrl()` + logs `POST /api/birthday-wishes`; optimistic "Ya felicitado ✓" state
- **Agendar cita** — triggers `openScheduleCita()` pre-filling `EventModal` with patient details
- **Search** — "Buscar paciente..." input
- **Filter** — "Pendientes / Todos" quick toggle

---

## Design Decisions (Guardrails Honored)

1. **No `ALTER TABLE patients`** — reads `patients.fecha_nacimiento` directly (already exists).
2. **No `ALTER TABLE events`** — `'dob'` / `is_dob_event` live only in TypeScript + UI adapter; DOB events are dynamically projected, never persisted.
3. **`patient_birthday_wishes.patient_id`** is `TEXT` (no FK) to avoid text/uuid mismatch on `paciente_id` (repo migrations conflict on the type).
4. **Feb 29 → Feb 28** in non-leap years; all dates/ages in `America/Tegucigalpa`.
5. **Cron bell alerts decoupled from wish table** — cron writes only `notifications` (`type='birthday_wish'`); `patient_birthday_wishes` is written only on staff click.
6. **Idempotent cron** — skips patients who already have a `birthday_wish` notification today (Tegucigalpa bounds), so pg_cron + GitHub fallback never duplicate.
7. **Server-side Clerk gate + service-role client** on `/api/dob-events` and `/api/birthday-wishes`.
8. **DOB events excluded from clinical views** — only merged into the event stream when `view === 'birthdays'`; clinical views (`Mes`, `Semana`, etc.) show 100% clinical appointments.

---

## Verification

- `tsc --noEmit`: clean for all implementation files (only pre-existing unrelated errors in `validator.ts` and `app/api/patients/[id]/route.ts`)
- ESLint: not runnable (no config file — pre-existing repo issue)
- `node --check`: all new/modified `.ts`/`.tsx` files parse cleanly
- `npm run build`: ✅ green — `/calendario` + all 3 new API routes compile

---

## Manual Steps Remaining (Supabase)

1. **Apply `supabase/migrations/20261121000000_patient_birthday_wishes.sql`** via Supabase SQL Editor.
2. **Apply `supabase/migrations/20261121000001_birthday_cron.sql`** via Supabase SQL Editor as **postgres user**, replacing:
   - `<BASE_URL>` → production URL serving `/api/cron/birthdays`
   - `<CRON_SECRET>` → the `CRON_SECRET` value on Vercel
3. **Ensure `pg_cron` + `pg_net` extensions** are enabled (default on Supabase Pro+).
4. **Set `CRON_SECRET`** on Vercel production env.
5. **GitHub Actions secrets**: add `CRON_BASE_URL` and `CRON_SECRET` to the repo for the fallback workflow.
6. If `cron.schedule` is rejected (cron schema owned by postgres, not service_role), the migration emits a NOTICE and skips — the GitHub Actions fallback alone delivers daily birthday alerts at 08:15 Honduras time.

---

## QA Checklist

- [ ] Clinical views (`Mes`, `Semana`, `Semana laboral`, `Día`, `Agenda`) show zero DOB clutter
- [ ] `Cumpleaños` tab appears in toolbar alongside clinical views
- [ ] URL sync: `?view=birthdays&date=2026-11-01` loads the Cumpleaños view
- [ ] `Hoy` section highlighted when viewing current month
- [ ] `Próximos este mes` grouped by date, sorted chronologically
- [ ] `Ya celebrados este mes` section for earlier days
- [ ] Each row shows: name, age badge (`Cumple X años`), formatted phone, status (`Ya felicitado ✓` / `Pendiente`)
- [ ] "Adjuntar regalo de cumpleaños" toggle appends promo to WhatsApp + payload
- [ ] "Enviar felicitación" opens WhatsApp + logs wish (409 if already wished this year)
- [ ] "Agendar cita" pre-fills `EventModal` with patient name/phone
- [ ] Search filter (`Buscar paciente…`) filters rows
- [ ] `Pendientes / Todos` toggle filters by wish status
- [ ] Feb 29 → Feb 28 in non-leap years
- [ ] All dates/ages computed in `America/Tegucigalpa`
- [ ] Cron bell fires for today's birthdays (no premature `patient_birthday_wishes` write)
- [ ] pg_cron + GitHub fallback are idempotent (zero duplicates)
