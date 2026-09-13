# Calendario Overhaul Plan (Diamond Link) — React-Big-Calendar (RBC) Edition

> **Last updated:** 2026-09-13 · **Status:** Phases 0–5 complete (Phase 5 live QA passed 2026-09-13) · **Phase 9 ~40%** (RBC lazy + batched participants done) · **Phase 6 re-scoped 2026-09-13 → Android/PWA Standalone App (`diamond-calendar` sync) — plan cooked, 0% pending** · Phases 7–8 pending · Phase 10 ledger-only start
>
> This plan keeps the point-for-point structure of `CHAT_OVERHAUL_PLAN.md` (same 11-phase
> skeleton, quick/full/original matrices, analysis, comparison, effort, priority,
> divergences, work state, next move, verification gate, relevant files, Phase 10 QA +
> rollback + changelog) **adapted** so the calendario's view engine is
> **`react-big-calendar` (RBC)** instead of a bespoke grid.
>
> **What changes vs the bespoke plan:** Month/Week/Day/Agenda rendering, date math,
> overlap/duration layout, view-switching and (desktop) drag-and-drop are delegated to
> RBC + `date-fns`. Custom flows stay 100% ours: Clerk auth, Supabase realtime & data,
> **all dental-domain options already in the page are preserved** — `PROCEDURES`,
> `DENTISTS`, `EVENT_COLORS` (teal/blue/violet/rose/amber/emerald swatch), patient
> search + linkage, invitee search, multi-reminders, status/priority chips, es-HN
> formatting, and push notifications (ported onto the chat web-push pipeline).
>
> **Baseline (current, 2026-09-08):** a *functional* `/calendario` exists — custom month
> grid + day panel + tasks + reminders, CRUD via `/api/events|tasks|reminders`, bell
> notifications — but it sits on **two disconnected data models**, has **live auth/RLS
> holes**, a **timezone shim**, **no realtime on the data it actually reads**, and
> **no chat-grade polish**. This overhaul re-founds the data/security/notifications
> layers exactly like chat, and swaps the view layer to RBC.
>
> **Effort impact of RBC:** Phases 1 + 4 shrink (~6 → 3 days); Phase 3 gains RBC slot
> selection handlers. Aggregate ≈ **24–26 person-days** (from ~32 bespoke).

---

## RBC architectural integration strategy

1. **View engine:** `react-big-calendar` + `date-fns` localizer (`format`, `parse`,
   `startOfWeek`, `getDay`, `es` locale) with `Views.MONTH | WEEK | WORK_WEEK | DAY | AGENDA`.
2. **Custom components:** inject `components.event`, `components.agenda.event`,
   `components.toolbar`, `components.header` so dental styling survives — dentist color
   dots, procedure badges, patient labels, status chips, `EVENT_COLORS`.
3. **Interactivity:** RBC `onSelectSlot` → pre-filled `EventModal`; `onSelectEvent` →
   detail drawer; `withDragAndDrop` (drag/resize) with optimistic react-query mutations
   and a chair/cubicle overlap check.
4. **Data bridge:** strict mapper `ClinicEvent` ↔ `RBCEvent` (`id`, `title`, `start`,
   `end`, `resource: ClinicEvent`) in `src/calendario/adapters/rbcAdapter.ts`; the domain
   object rides along in `resource` so no domain data is lost through RBC.
5. **Known constraints (documented, not silent):**
   - DnD addon (`react-big-calendar/lib/addons/dragAndDrop`) needs peer deps
     **`react-dnd` + `react-dnd-html5-backend`** (install both; the addon is not a
     standalone npm package).
   - HTML5 backend doesn't emit touch events on mobile — desktop DnD only; mobile moves
     go through the detail drawer (tap → edit times). Accept as platform behavior.
   - RBC official peer range targets React ≤ 18 — verify against the app's React 19
     (Next.js 15); if peer warnings appear, add an `overrides`/`resolution` pin and
     smoke-test drag/resize on the deployed build (QA C10–C12).
   - RBC calendar is `client-only` → load via `next/dynamic(…, { ssr:false })` with a
     `CalendarSkeleton` fallback.

---

## Audit summary (current state, 2026-09-08)

1. **Two parallel calendar worlds.**
   - **Live "simple" model (what the UI reads/writes):** `events`, `tasks`, `reminders`,
     `event_invitees` (`database/migrations/create_new_calendar_tables.sql` +
     `extend_new_calendar_with_invitees.sql`); SERIAL ids; `date`/`start_time`/`end_time`
     are **plain strings** (`src/lib/types-calendar.ts`: `ClinicEvent`/`Task`/`Reminder`,
     `PROCEDURES`/`DENTISTS`/`EVENT_COLORS`); routes `app/api/events*`, `app/api/tasks`,
     `app/api/reminders`; UI `components/calendar-new/*`.
   - **Orphaned "UUID/legacy" model:** `calendar_events/tasks/reminders/invitees` (UUID),
     `src/services/calendar*`, RPC `get_user_events`/`get_user_tasks`, routes
     `app/api/calendar/*`, realtime service, `src/types/calendar*.ts`. **No rendered UI
     consumes it.** Two routes carry `// TODO: Re-enable authentication` + `created_by:
     'temp-user'`.
2. **Auth/security holes (live, must close first).** `middleware.ts` treats `/api/(.*)`
   as public and has a "TEMPORARY Allow basic access" list that lets any authenticated
   user into `/calendario` (role map says `admin|doctor|assistant`, bypassed in practice).
   Calendar APIs trust the client `x-user-id` header with **no server-side verification**
   (`app/api/events/route.ts::getUserAndToken` ignores the Bearer token).
   `/api/notifications/send-to-user` has **no auth at all**. RLS state on the live tables
   is inconsistent (a trail of `temporarily_disable_rls` / `final_rls_fix` scripts).
3. **Timezone shims, not correct storage.** In-code `SimpleTimezoneFix` (subtract 6 h,
   hardcoded `America/Tegucigalpa`) + data fix scripts adding `+ INTERVAL '6 hours'`.
   `Dashboard` builds `selectedDate` from `new Date().toISOString().slice(0,10)` (UTC →
   off-by-one after ~6 pm local). Three reminder stores coexist (`reminders`,
   `event_reminders`, `calendar_reminders`).
4. **Realtime wired to the wrong tables.** `calendarRealtimeService` subscribes to
   `calendar_events/tasks/reminders/invitees`; the publication covers only the first
   three (drift), and calendar tables lack REPLICA IDENTITY FULL; the only live consumer
   (`CalendarNotificationCounter`) is dead UI.
5. **Notifications skip the push pipeline.** Event/reminder/invitee sends go to the
   `notifications` table via `/api/notifications/send-to-user` (unauthenticated) and the
   in-app bell; nothing flows through the chat web-push pipeline (VAPID + 
   `push_subscriptions` + `public/sw.js`). Dashboard "Próximos Eventos" is N+1.
6. **No i18n layer, chat-only theming.** Mixed `en-US`/`es-HN`/`es-ES` locale calls;
   `app/color-system.css` tokens are chat-scoped; calendar hardcodes `teal-*`/`dark:`.
7. **A11y & perf not addressed.** No focus trap in `EventModal` (883 lines), no
   `aria-live` on toasts, no keyboard nav, no `prefers-reduced-motion`; `/calendario`
   ships the modal in the initial bundle; react-query + react-window installed but
   unused here; `/calendario` **not** in the SW offline precache.
8. **Migrations are unversioned.** Calendar SQL is loose/unnumbered with a manual
   trial-and-error history; no applied-ledger (chat has date-prefixed `2026090x`).
9. **Dead surface:** `components/calendar-new/UpcomingEvents.tsx` (zero importers),
   `components/gestures/SwipeCalendar.tsx` (unused for calendar), old
   `components/calendar/*` (gone from disk; survives only in the stale
   `CALENDAR_SYSTEM_DOCUMENTATION.md`), `diamond-calendar-app/` (compiled-only Vite
   experiment, zero references).

---

### Quick Status Summary (RBC-adapted)

| # | Phase | Status | Progress | Key evidence | Remaining gaps |
|---|-------|--------|----------|--------------|----------------|
| **0** | Foundation, Data Model & Security | ✅ | `████████████████████ 100%` | Two models coexist; RLS inconsistent; `x-user-id` trust; `/api/(.*)` public; `send-to-user` unauthenticated; timezone shims; unversioned SQL | Canonical `events` family; Clerk-session auth; RLS ownership predicates; timezone policy + RBC localizer alignment; versioned migrations + `NEXT_PUBLIC_USE_NEW_CALENDARIO` |
| **1** | RBC Layout & Navigation Engine | ✅ | `████████████████████ 100%` | Custom month-only `CalendarGrid` + `DayDetail`; `en-US` label; framer-motion tiles | Install `react-big-calendar` + `date-fns`; localizer (es, Monday start); Month/Week/Work-Week/Day/Agenda; toolbar → URL sync (`?view=&date=`); responsive shell |
| **2** | Data Layer, RBC Bridge & Realtime | ✅ | `████████████████████ 100%` | Raw `fetch` + `Promise.all` + refetch-all; react-query unused; realtime on orphaned tables; no REPLICA IDENTITY; N+1; public `Cache-Control:7200` | Repository layer; `rbcAdapter` (`ClinicEvent` ↔ `RBCEvent`); react-query per user/range; realtime on live tables + REPLICA IDENTITY FULL + publication fix; dedupe; batched participants; remove stale caching |
| **3** | Slot Selection & Event Modal UX | ✅ | `████████████████████ 100%` | RBC slot closes create modal (un-pre-filled); event select pries open 883-line modal; no Zod/RHF; no drafts | **Implemented + committed (`764f97b`, 2026-09-08):** `onSelectSlot({start,end})` + pre-filled create modal; `onSelectEvent` → detail drawer (edit/delete); **Zod + RHF first adoption** — multi-step Details→Timing→Invitees&Reminders with per-step validation; dentist auto-populated from first doctor invitee (mock dropdown removed) + optional in schema; custom dentist/procedure free-text preserved; `calendar-draft:{date}` debounced autosave + one-tap restore (create-only, submit guarded to explicit button click, no Enter); repo `set/getEventInvitees`/`set/getEventReminders` + `dateToTimeStr`; patient link → `/patient-preview/[id]`; modal + drawer hardened (Escape-to-close, `role=dialog`/`aria-modal`, initial focus); **auth:** `/calendario` open to all authenticated roles (middleware routePermissions + `authorizeCalendar` accept any session; RLS owns scoping) — superuser 403 gone; **layout:** `RbcCalendar` wrapper pinned `height:600px` (RBC `.rbc-month-view{height:100%}` now resolves → month event tiles no longer collapse to headers-only); invitee picker loads in create mode too; both legacy callers intact; gate green (tsc 0 / ESLint 0 errors) | **QA C17–C21 + C25 passed in-browser (2026-09-09)**; a11y focus trap (`useFocusTrap`) deferred to Phase 8; visual mobile pass folded into Phase 4 QA |
| **4** | Custom RBC Rendering & DnD | ✅ | `████████████████████ 100%` | Custom month cells + dots today; no week/day/agenda; no drag; monolithic `RbcCalendar` wrapper | **Implemented (2026-09-09) + perf/invitee tail (committed `c19de75`):** custom RBC `components` — event pill (dentist color dot, patient name, procedure badge), WhatsApp-style agenda rows with status chips, es toolbar (Hoy/‹/› + view switcher), es weekday/month headers (today highlight); `withDragAndDrop` (react-dnd + html5-backend peers installed) with `onEventDrop`/`onEventResize` → optimistic react-query move/resize (snapshot rollback) + **chair/cubicle overlap check** (`findDentistOverlap` — same-dentist collision blocks the move with a toast; cancelled events never block); month/all-day drops preserve existing times (date-only rebase); resize clamps to ≥ start +30 min and within the day; addon DnD CSS; gate green (tsc 0 / ESLint 0 errors, `next build` ✓). **Perf pass:** all mutations `onSettled → void invalidateAll()` (RQ v5 awaits `onSuccess` — modal/drawer close is snappy again), `keepPreviousData` on event range, cold-boot-only spinner, `dateToDateStr` → `clinicDateKey` (clinic-tz off-by-one on DayDetail fixed). **Invitee realtime for guests:** `20260909e` (event_invitees.updated_at) **applied + LEDGER ✓ (2026-09-09)** — owner move/resize now live-refreshes invitee B's calendar. **Browser QA PASSED + 4 follow-up fixes (committed `59b3b02`, deployed @ app.dentaldiamondhn.com ✓):** realtime debounce 10s → **1.5s** (invitee updates ~2s); **touch DnD** via `react-dnd-touch-backend` (coarse-pointer devices, 200ms long-press grace; desktop stays HTML5); **conflict check no longer skips** when the dragged event has no dentist — falls back to any-occupied-slot block + clearer es toast (`conflictMessage`); **`PROCEDURES` dropdown → Spanish** (Limpieza/Chequeo/Empaste/Endodoncia/Corona/Extracción/Blanqueamiento/Radiografía/Ortodoncia/Implante/Otro); ended-phase infra — `próximos esta semana` preview card (today→Sunday, Libre/Agendar, Cancelada chips), GoTrueClient singleton warning fixed, side cards es-HN (Recordatorios above Tareas, event reminders merged in). Gate green (tsc 0 / ESLint 0 errors) | **None — Phase 4 complete** |
| **5** | Notifications & Push Pipeline | ✅ | `████████████████████ 100%` | Bell + `notifications` table + `event_reminders`; **webhook + SW cards + deep-link ✅ (migration applied 2026-09-10)**; invitee double-booking 409 ✅ live; cron reminder dispatcher + 5-min lean built | **✅ DELIVERED — user live QA passed 2026-09-13:** `/api/push/calendar-webhook` (shared secret, push+bell via `deliverCalendarToUser`); SW aggregated tray cards + `?eventId=` deep-link; participant-role recipients; `409 INVITEE_CONFLICT` + override; `/api/cron/reminders` (CRON_SECRET); GitHub Actions 5-min tick; notification RLS owner-scoping (`20260913b`+`20260913c` applied live) + bell mark-all/read/remove + SW mark-read sweeps (`30aa63a`, `a2a5312` deployed). |
| **6** | Android/PWA Standalone App (`diamond-calendar` sync) | ◻ | `░░░░░░░░░░░░░░░░░░░░ 0%` | Sibling repo `/home/dentaldiamondhn/diamond-calendar` = OLD calendar iteration (own git remote, Capacitor + FCM glue) — months behind the current `/calendario` masterpiece | **Re-scoped 2026-09-13 (plan cooked, not executed):** update the standalone to mirror the web calendar 1:1 — RBC views, Zod/RHF modal + drawer, invitees/reminders, realtime SSE, bell+push, Clerk custom `/sign-in`; keep native Capacitor/FCM Android glue; `npx cap sync android` → debug APK + PWA; on-device parity QA. See Phase 6 section |
| **7** | Theming & i18n (es-HN) | ◻ | `░░░░░░░░░░░░░░░░░░░░ 0%` | `--fd-*` tokens chat-scoped; calendar hardcodes `teal-*`; mixed locales | `app/styles/rbc-theme.css` mapping `.rbc-*` to `--fd-*` (dark mode); typed es/en i18n (`CalendarTranslationKey`); `date-fns/locale/es` localizer + Monday `startOfWeek`; central es-HN `America/Tegucigalpa` formatter |
| **8** | Accessibility & Keyboard Nav | ◻ | `░░░░░░░░░░░░░░░░░░░░ 0%` | Loading/error states; no focus trap, `aria-live`, grid keyboard nav, reduced-motion | `useFocusTrap` on modal/drawer; `aria-live` for save/reschedule ("Cita cambiada a las 10:00"); RBC toolbar + event keyboard pass; skip-link; icon labels; reduced-motion; contrast bumps |
| **9** | Performance & Dynamic Bundling | ◔ | `████████████░░░░░░░░ 40%` | RBC shell + `CalendarSkeleton` lazy via `next/dynamic` (Phase 1); participants batched + stale `max-age=7200` removed (Phase 2); `EventModal`/drawer still in route bundle; no bundle-analyzer report; react-window unused | `next/dynamic` RBC (`ssr:false`) + `CalendarSkeleton`; lazy modal/drawer chunks; `@next/bundle-analyzer` report; virtualize agenda; batched participants; First Load target before/after |
| **10** | Final QA, Migration & Roll-out | ◻ | `█░░░░░░░░░░░░░░░░░░░ 5%` | No QA matrix/rollback/changelog; `CALENDAR_SYSTEM_DOCUMENTATION.md` stale; data-migration ledger maintained (`LEDGER.md`, 20260907→20260913) | Execute **C01–C36** (RBC DnD, timezone, role gating, offline queue, web push); migration ledger; rollback plan; changelog; refresh `CALENDAR_SYSTEM_DOCUMENTATION.md`; live axe/Lighthouse + NVDA/VoiceOver |

Aggregate: **Baseline functional; overhaul planned (~0%). Est. ≈ 24–26 person-days (RBC).**

---

| # | Phase | Status | Progress | Current state (evidence) | Remaining gaps (phase scope) |
|---|-------|--------|----------|--------------------------|------------------------------|
| **0 – Foundation, Data Model & Security** | ✅ | `████████████████████ 100%` | Live `events`/`tasks`/`reminders`/`event_invitees` (SERIAL, string dates, `src/lib/types-calendar.ts`) vs orphaned UUID `src/services/calendar*` + RPCs + `app/api/calendar/*`; RLS partial/experimental; `app/api/events/route.ts::getUserAndToken` trusts `x-user-id` (Bearer ignored); `middleware.ts` `/api/(.*)` public + TEMPORARY allow-list; `/api/notifications/send-to-user` unauthenticated; `SimpleTimezoneFix` −6 h shim + `+6h` data-fix scripts; unversioned SQL | **Canonical model:** keep live `events` family as the data core (UI + data + RBC adapter target); port invitee/reminder/realtime onto it; DELETE UUID services/types/routes/RPCs. **Security:** identity from Clerk session server-side everywhere (never the header); middleware gating for `/calendario` (admin\|doctor\|assistant); secure `send-to-user`; RLS ownership + invitee predicates on every live table. **Timezone:** explicit clinic-local policy + RBC localizer under `America/Tegucigalpa`; remove −6h/+6h shims. **Versioning:** date-prefixed migrations + ledger; **feature flag** `NEXT_PUBLIC_USE_NEW_CALENDARIO` + page-loader (fallback = current Dashboard). | **✅ Delivered & live-tested (commits `d4af0c2` + fix `5155588`, 2026-09-08):** UUID layer deleted (services `src/services/calendar*.ts` + `inviteeNotificationService.ts`, types, `app/api/calendar/**`, `components/ui/CalendarNotificationCounter.tsx`, DB tables + `get_user_events`/`get_user_tasks` RPCs); live CRUD routes hardened to Clerk-session auth via `src/lib/calendarAuth.ts` (`authorizeCalendar`/`getCalendarSession`/`roleFromSessionClaims`) + service-role client; invitee routes gated owner/member (23505→409); `send-to-user` now `auth().userId`; `middleware.ts` role-gates `/calendario` (allow-list removed); patients `[id]/events` + `patientService` repointed to canonical `events`; timezone policy `src/calendario/timezone.ts` (`America/Tegucigalpa`, `clinicDateKey`) wired into `/upcoming`, `fix_existing_event_timezones.sql` deleted; feature flag `NEXT_PUBLIC_USE_NEW_CALENDARIO` + dynamic loader (fallback = Dashboard). **Migrations applied + verified live** (`LEDGER.md`): anon locked out of all five canonical tables (`42501`, probe-verified), legacy tables dropped, RLS recursion (`42P17`) found & fixed. **Remaining:** flip flag → `true` once the RBC shell ships (Phase 1) |
| **1 – RBC Layout & Navigation Engine** | ✅ | `████████████████████ 100%` | Custom month-only `CalendarGrid` (42 cells, `en-US`), `DayDetail`, `TaskPanel`, `ReminderPanel`; framer-motion; full-screen spinner; no week/day/agenda | Install `react-big-calendar` + `date-fns` (+ dnd peers `react-dnd`, `react-dnd-html5-backend` once Phase 4 lands); `dateFnsLocalizer` (`es` locale, Monday `startOfWeek`); shell: `Views.MONTH/WEEK/WORK_WEEK/DAY/AGENDA`; toolbar (Today/Back/Next/View) bound to URL `?view=&date=`; responsive `< lg` layout; `next/dynamic(…, {ssr:false})` + `CalendarSkeleton`. | **✅ Delivered (2026-09-08):** `react-big-calendar@1.20.0` + `@types/react-big-calendar` installed (React 18 — no 19 peer concern; `date-fns@4` already present, `es` via `date-fns/locale`); `dateFnsLocalizer` (es, Monday start) + Spanish `messages`; `src/calendario/rbcAdapter.ts` (`clinicEventToRbc` start/end on clinic-local Date, `resource` = `ClinicEvent`); `src/calendario/RbcCalendar.tsx` (heavy chunk) shows `MONTH/WEEK/WORK_WEEK/DAY/AGENDA`, `selectable`, popup overflow, event colored via `eventPropGetter`; `src/calendario/CalendarShell.tsx` = flagged path (RBC + reused `DayDetail`/`TaskPanel`/`ReminderPanel`/`EventModal`, CRUD via existing API) with **URL sync `?view=&date=`** (`history.replaceState`, no `useSearchParams`/Suspense) + `CalendarSkeleton` via `next/dynamic ssr:false`; `components/calendar-new/CalendarShell.tsx` placeholder deleted; loader repointed to `@/calendario/CalendarShell`; **flag `NEXT_PUBLIC_USE_NEW_CALENDARIO=true`**; `next build` green — `/calendario` route 2.07 kB, RBC in separate 92 kB lazy chunk + own CSS; gate clean (tsc + scoped ESLint). **Remaining (Phase 2+):** react-query + realtime, slot→modal prefill + modal split (Phase 3), custom pills/agenda rows + DnD (Phase 4). |
| **2 – Data Layer, RBC Bridge & Realtime** | ✅ | `████████████████████ 100%` | `Dashboard` raw `fetch`/`Promise.all` + refetch-every-action; react-query provided (`contexts/QueryProvider`) unused; `calendarRealtimeService` watches orphaned UUID tables (`calendar_invitees` subscribed, not published; no REPLICA IDENTITY); dashboard N+1 participants; middleware `Cache-Control: public, max-age=7200` | **✅ Delivered (2026-09-08):** `src/calendario/calendarRepository.ts` (thin repo mirroring `src/chat/repository.ts`: `getEvents(range)` + full CRUD for events/tasks/reminders + **batched `getParticipants(ids)`**); `src/calendario/range.ts` `viewToRange` (month/week/work_week/day/agenda fetch windows from the RBC view+date); react-query hooks `src/calendario/hooks/useCalendarData.ts` (`useCalendarEvents(range)` per-range cache, `useCalendarTasks`, `useCalendarReminders`, `useCalendarMutations` with optimistic task toggle + invalidate-on-action); **Clerk-gated service-role SSE** `app/api/events/realtime/route.ts` (owner + invitee filters, keepalive, cleanup-on-cancel) + `src/calendario/hooks/useCalendarRealtime.ts` (10s debounced invalidation dedupe, tombstone-guard refetch, exponential-backoff reconnect); `CalendarShell.tsx` refactored off raw fetch onto the hooks + URL `?view=&date=&from=&to=`; `app/api/events/route.ts` GET now takes `date_from`/`date_to`; batched `app/api/events/participants/route.ts` (`?ids=` → `{[eventId]: Participant[]}`, folded-in membership check, no N+1); **middleware drops `Cache-Control: public…7200`** on user-scoped calendar APIs (`no-store`; SSE leaves its own header alone); migration `20260908c_calendario_phase2_realtime.sql` (**supabase_realtime pub membership + REPLICA IDENTITY FULL** on the canonical five) authored — **apply via Dashboard, then `date_from`/`date_to` + participants batch are gated on it only for realtime**; gate green (`tsc --noEmit` 0, scoped ESLint 0 errors, `next build` ✓ — `/api/events/realtime` dynamic, `/calendario` 2.09 kB). |
| **3 – Slot Selection & Event Modal UX** | ✅ | `████████████████████ 100%` | `EventModal.tsx` (883 lines): patient search, invitee search (`/api/users`), `EVENT_COLORS` swatch, multi-reminder, delete; `TaskPanel` inline add/toggle/delete; no Zod/RHF | **Implemented + committed (`764f97b`, 2026-09-08):** RBC callbacks wired — **`onSelectSlot={({start,end})}` opens the create modal pre-filled** (month/agenda fall back to clinic defaults; week/work_week/day carry the slot times) and **`onSelectEvent={({resource})}` opens a new `EventDetailDrawer`** (invitees/reminders loaded, patient deep-link `/patient-preview/[id]`, Edit → same modal, Delete → confirm). `EventModal` rebuilt as modular **Zod + RHF** steps (*Details* patient search + procedure `PROCEDURES` → *Timing* pre-filled from slot → *Invitados & Recordatorios*), per-step `trigger` validation (C19 inline messages), `EVENT_COLORS` swatch, multi-reminders, delete-confirm. **Dentist:** mock static dropdown removed — value auto-populates from the first doctor invitee (`/api/users` filtered `role=doctor`) and is **optional** in the schema; custom dentist/procedure preserved via free-text escape + `VARCHAR` columns (C21). **Submit guard:** only an explicit button click triggers save (no Enter-key submit). **Drafts `calendar-draft:{date}`** debounced autosave + one-tap Restaurar/Descartar (C20, create-mode only). **Auth:** `/calendario` + all calendar APIs accept **any authenticated role** — `middleware.ts` `/calendario` removed from `routePermissions`, `authorizeCalendar()` gates on session only (RLS + route `.eq('user_id',…)` own the scoping; `tech_support` god-account 403 gone). **Layout:** `RbcCalendar` wrapper fixed `height:600px` (+ `Calendar style height:'100%'`) so RBC's `.rbc-month-view{height:100%}` flex resolves — the month event tiles that collapsed to headers-only in a content-sized parent are restored. `src/calendario/event/` (`eventSchema.ts`, `eventDraft.ts`, `fields.tsx`); repo gained `setEventInvitees`/`setEventReminders`/`getEventInvitees`/`getEventReminders` + `rbcAdapter.dateToTimeStr`. Legacy props kept — `Dashboard` + `DayDetail` workflows untouched. Gate green: `tsc --noEmit` 0, scoped ESLint 0 errors (23 pre-existing warnings), build verified in-session (`764f97b`). **QA (2026-09-09):** browser QA **C17–C21 + C25** passed; focus trap (`useFocusTrap`) deferred to Phase 8; visual mobile pass folded into Phase 4 QA. |
| **4 – Custom RBC Rendering & DnD** | ✅ | `██████████████████████ 100%` | Month dots, per-day lists, string status/priority/type, `EVENT_COLORS` | Custom RBC `components`: event pill (procedure badge, patient name, **dentist color dot**, `EVENT_COLORS`), `agenda.event` WhatsApp-style rows with status chips (Confirmed/In Progress/Completed/Cancelled), `toolbar` (ours, i18n), `header` (Monday-first es); `withDragAndDrop`: `onEventDrop`/`onEventResize` → optimistic react-query mutation + server save + **chair/cubicle overlap check**; **Delivered (2026-09-09):** `src/calendario/calendarComponents.tsx` — event pill (dentist color dot, patient name, procedure badge on full-day cells), WhatsApp-style agenda rows + status chips (`STATUS_LABELS`), es toolbar (Hoy/‹/› + view switcher), es weekday/month headers (today highlight); `RbcCalendar.tsx` = `withDragAndDrop` + `DndProvider` (`react-dnd`/`react-dnd-html5-backend` installed, addon CSS, `selectable="ignoreEvents"`); shell `onEventDrop`/`onEventResize` → `src/calendario/calendarDnD.ts` (`dragTargetUpdates` month/all-day date-only rebase, resize clamp ≥ start +30 min & same-day, `findDentistOverlap` chair/cubicle check — same-dentist collision blocks with toast, cancelled never blocks); `updateEvent` mutation now optimistic w/ snapshot rollback. **QA PASSED (2026-09-10):** browser walkthrough C10–C12 + custom-rendering pass + mobile wrap verified in-browser & committed (`59b3b02`, deployed @ app.dentaldiamondhn.com ✓) — MOVE/RESIZE optimistic + clamped, dentist-overlap blocked (adjacency + cancelled-exemption allowed), realtime invitee refresh ~2s. Desktop DnD primary; touch via `react-dnd-touch-backend` (200 ms long-press grace); mobile precise edits via drawer (documented platform constraint). **invitee visibility:** `GET /api/events` now returns **owned OR invited** events (matches RLS + the `event_invitees` realtime binding) so invited calendars populate; non-owners are DnD-blocked with a toast (`No puedes mover una cita que no es tuya`); `PUT /api/events` best-effort-bumps `event_invitees.updated_at` (**migration `20260909e` — applied + LEDGER ✓ 2026-09-09**) so invited calendars live-refresh moves/resizes. Gate green: tsc 0 / ESLint 0 errors, `next build` ✓. |
| **5 – Notifications & Push Pipeline** | ✅ | `████████████████████ 100%` | Bell + `notifications` table + `useNotificationListener` (→ `/calendario`); calendar never touched chat web-push; `CalendarNotificationCounter` dead UI | **✅ COMPLETE — user live QA passed 2026-09-13:** single `event_reminders` schedule; webhook `/api/push/calendar-webhook` (secret-gated, same VAPID/`push_subscriptions`/`public/sw.js` pipeline as chat); SW aggregated per-event tray cards (`tag:'calendar-<eventId>'`, renotify); `notificationclick` → `/calendario?view=day&date=&eventId=`; bell+push parity; role-aware recipients; reminder_time anchored to event start + cron dispatcher + 5-min lean; 409 invitee double-book ✅ live; personal `reminders` + recur `tasks` (20260911a) + TaskPanel inputs. **+2026-09-13:** RLS owner-scoping `20260913b`+`20260913c` applied live (anon probe: SELECT 0 rows, INSERT RLS-blocked); bell mark-as-read / mark-all / remove + SW `markBellRead` via `data.bellId` + `markChatConversationRead` + `notificationclose` sweep (`30aa63a`, `a2a5312` — deployed, verified on prod `/sw.js`); bell realtime channel replaced by tab-refocus + 30 s visible-only poll. |
| **6 – Android/PWA Standalone App** | ◻ | `░░░░░░░░░░░░░░░░░░░░ 0%` | `diamond-calendar` (sibling repo) holds the OLD calendar iteration — Capacitor + FCM-native push + its own remote — nowhere near parity with the current web calendar (RBC, modal/drawer, realtime, RLS-scoped notifications, Clerk `/sign-in`) | **Plan cooked 2026-09-13, execution pending:** ① baseline drift diff `diamond-calendar` HEAD vs current web; ② port the shipping `src/calendario/**` (+ `app/api/events*`, `lib/calendarAuth`, timezone) as the single source of truth — no standalone-only features; ③ keep + unify Capacitor/FCM with the web-push pipeline (Honduras UTC-6); ④ Clerk on the standalone origin → custom `/sign-in` (never Clerk-hosted) + cold-boot notification deep-link; ⑤ PWA hosting + `cap sync android` → debug APK; ⑥ on-device parity pass (create/move/resize/invite/reminder/push/realtime/offline-shell). See Phase 6 section. |
| **7 – Theming & i18n (es-HN)** | ◻ | `░░░░░░░░░░░░░░░░░░░░ 0%` | `--fd-*` tokens chat-scoped; calendar hardcodes `teal-*`/`gray-*` + `dark:`; locale mixing `en-US`/`es-HN`/`es-ES` | **`app/styles/rbc-theme.css`**: map `.rbc-calendar/.rbc-header/.rbc-time-content/.rbc-event/.rbc-today` to `--fd-*` tokens, full dark-mode; typed i18n layer (`src/calendario/i18n/…`, `CalendarTranslationKey`, es-first server default, reusing chat's `DocumentLang` for `<html lang>`); **`date-fns/locale/es`** localizer + Monday `startOfWeek(date,{weekStartsOn:1})`; central es-HN `America/Tegucigalpa` formatter (Android WebView-safe `safeLocaleDate` fallback); weekday/month labels es. |
| **8 – Accessibility & Keyboard Nav** | ◻ | `░░░░░░░░░░░░░░░░░░░░ 0%` | Loading + error + "No autorizado" states; no `useFocusTrap`; no `aria-live` toasts; no keyboard nav; no reduced-motion handling | **`useFocusTrap`** on `EventModal`/detail drawer/menus; **`aria-live="polite"`** for save/send/reschedule ("Cita cambiada a las 10:00 AM") + toast/reminder announcements; ARIA labels on all icon-only buttons; RBC keyboard pass (toolbar buttons, event focus/Enter, `role="grid"` semantics where RBC exposes them); skip-link → `#calendario-content`; focus restore; `prefers-reduced-motion` guards on framer-motion + RBC transitions; AA contrast bumps on muted grays; `role="main"` landmark. |
| **9 – Performance & Dynamic Bundling** | ◔ | `████████████░░░░░░░░ 40%` | RBC shell + `CalendarSkeleton` lazy via `next/dynamic` (Phase 1); participants batched + stale `7200` removed (Phase 2); `EventModal`/drawer still in route bundle; no `@next/bundle-analyzer` report; no `optimizePackageImports`; react-window unused | `next/dynamic` RBC: `const BigCalendar = dynamic(() => import('react-big-calendar').then(m => m.Calendar), { ssr:false, loading: () => <CalendarSkeleton/> })`; lazy `ssr:false` chunks for `EventModal`/drawer/invitee search/reminder editor; `@next/bundle-analyzer` report (RBC + date-fns locale gzip impact recorded); react-window agenda virtualization on long days; batched participant/patient queries (no N+1); First Load JS before/after; remove stale public caching. |
| **10 – Final QA, Migration & Roll-out** | ◻ | `█░░░░░░░░░░░░░░░░░░░ 5%` | No matrix/rollback/changelog; `CALENDAR_SYSTEM_DOCUMENTATION.md` stale; data-migration ledger maintained (`LEDGER.md`); auth + timezone holes closed (Phase 0) | Execute **QA matrix C01–C36** (covers RBC DnD drag/resize, URL view sync, timezone 18:30-no-shift, role gating + forged `x-user-id`, offline create/reschedule queue, web push closed-app, reduce-motion/aria-live) across DC/DF/MC/CB/iOS/MW; timezone regression suite; versioned migration ledger; **rollback plan** (Tier 0 flag revert / Tier 1 migration reversibility / Tier 2 disable push); **changelog**; refresh docs to reality; live axe/Lighthouse + NVDA/VoiceOver pass; gate = `tsc` + ESLint. |

---

### Phase 6 — Android/PWA Standalone App (re-scoped 2026-09-13 — plan cooked, NOT executed)

> **Why the re-scope:** the old "PWA & Offline" phase (precache `/calendario`, IndexedDB query
> persister, offline create/reschedule queue inside the monolith's service worker) was
> **scrapped as-is on 2026-09-13**. The installable surface is now a **dedicated standalone
> app**, seeded by the old calendar iteration in the sibling repo
> `/home/dentaldiamondhn/diamond-calendar` (own git remote; `diamond-calendar` also ships
> Capacitor + FCM native push — a mobile story the web PWA can't fully match). The standalone
> must be **updated to match the current `/calendario` masterpiece** — the exact opposite of the
> old phase: the web app is the source of truth, the standalone catches up.

**Objective:** ship an installable **Android/PWA** calendar app (Capacitor `npx cap sync android`
→ debug APK **and** a PWA build) whose calendar is behaviorally identical to the deployed web
calendar today.

**Plan (execution NOT started):**
1. **Baseline drift inventory** — diff `diamond-calendar` HEAD vs the current `diamond-link`
   `/calendario`: RBC views (`MONTH/WEEK/WORK_WEEK/DAY/AGENDA` + URL sync), slot-create +
   multi-step Zod/RHF modal + event detail drawer, invitees/reminders, dentist-overlap DnD
   (touch + HTML5), realtime SSE `/api/events/realtime`, batched participants, bell + push +
   notification RLS (mark-read/remove), Clerk custom `/sign-in` cycle, `--fd-*`/es-HN formatters.
2. **Port-in as single source of truth** — copy the shipping `src/calendario/**` (+ required
   `app/api/events*`, `lib/calendarAuth`, timezone) into the standalone repo; the monolith is
   untouched. Parity only — no standalone-only features.
3. **Android native glue** — keep Capacitor + `google-services.json` FCM; unify with the web-push
   pipeline exactly as the monolith does (webhook → `push_subscriptions`), Honduras `UTC-6`
   preserved.
4. **Auth** — Clerk on the standalone origin; signed-out **always** → custom `/sign-in` (never the
   Clerk-hosted page); cold-boot deep-link from a notification returns to the event.
5. **Build/deploy** — standalone PWA via its own hosting + `cap sync android` → debug APK;
   icons/splash/manifest sourced from the monolith's PWA set.
6. **Acceptance** — device parity pass on the installed app: every web-calendar interaction
   (create/move/resize/invite/reminder) + closed-app push + realtime refresh + offline shell +
   deep-link cold boot.

**Effort:** ≈ 3 person-days (repo + native glue already exist; the port is mechanical).
**Risk:** Medium (the standalone repo may carry dead old dependencies — expect `npm i` / a Next
version bump before the port). **Gate:** `tsc --noEmit` + scoped ESLint + on-device parity pass.

---

### Phase 10 — QA test matrix (RBC-adapted, draft — planned 2026-09-xx)

Live env + `NEXT_PUBLIC_USE_NEW_CALENDARIO=true`. Platform key: DC = desktop Chrome ·
DF = Firefox · DS = Safari(mac) · DE = Edge · MC = mobile Chrome/Android ·
CB = Chromebook (PWA) · iOS = Safari/Home-Screen PWA · MW = WebView.

| ID | Area | Test case | Platform | Expected result |
|----|------|-----------|----------|-----------------|
| C01 | Auth | Login → `/calendario` for `admin`/`doctor`/`assistant`; denied for others (server-level, not client hook) | DC, MC | Role gating enforced server-side |
| C02 | Auth | Forged/absent `x-user-id` rejected — identity from Clerk session | DC | 401 on mismatch |
| C03 | Auth | Cold-boot notification tap → `/calendario?view=day&date=&eventId=` (no sign-in bounce) | CB, MC | Opens event/day; no `/sign-in` redirect |
| C04 | Layout | RBC month view renders, today highlight, adjacent-month dim, view switcher | DC | Grid + toolbar correct |
| C05 | Layout | RBC week view: 7-day hour grid, prev/today/next, current-day highlight, overlapping events stack | DC, MC | Time-block alignment |
| C06 | Layout | RBC day view: timeline, sorted events, status/priority chips visible | DC | Order + chips correct |
| C07 | Layout | RBC agenda view: WhatsApp-style rows (patient, procedure badge, dentist dot, status chip) | DC | Custom `agenda.event` renders |
| C08 | Layout | URL sync: `?view=&date=` drives calendar; back/forward + refresh preserve view/date (SSR-safe `useSearchParams` guard) | DC | State restorable |
| C09 | Layout | Responsive: `< lg` grid usable; touch targets ≥ 44 px; day panel stacks | MC, CB | No horizontal scroll |
| C10 | DnD | **Drag** event to another slot → optimistic update, server save, realtime peers consistent | DC | Moved once, everywhere |
| C11 | DnD | **Resize** event end → optimistic update; duration recomputes (start preserved) | DC | Correct new end |
| C12 | DnD | Chair/cubicle overlap check: colliding same-dentist booking flagged/blocked with message | DC | Clear conflict UX |
| C13 | Data | Realtime: create in tab A → tab B instantly (react-query invalidated), deduped | DC ×2 | Live insert/update/delete |
| C14 | Data | Realtime delete: cancelled event disappears everywhere (REPLICA IDENTITY FULL) | DC ×2 | No resurrection |
| C15 | Data | Realtime invitee: adding an invitee triggers notification + event in invitee's session | DC ×2 | Bell + (granted) tray |
| C16 | Data | react-query: month/week navigation from cache, no full refetch; invalidation on action only | DC | No loading flash |
| C17 | Create | `onSelectSlot` blank slot → `EventModal` pre-filled (date + start/end) | DC, MC | Modal opens prefilled |
| C18 | Create | `onSelectEvent` → detail drawer (not modal) with edit + delete | DC | Drawer opens `resource` |
| C19 | Create | Zod/RHF inline validation (empty title, end < start, bad time) | DC | Messages under fields |
| C20 | Create | Multi-step Details → Timing → Invitees & Reminders; draft restored on reopen | DC | Steps persist |
| C21 | Create | Custom defaults preserved: procedure `PROCEDURES`, dentist `DENTISTS`, `EVENT_COLORS` swatch | DC, MC | All present & applied |
| C22 | Tasks | Add/toggle/delete task; overdue/upcoming groups correct | DC, MC | Priority sort + date grouping |
| C23 | Timezone | Create event 18:30 Honduras → displays 18:30 (RBC localizer, no UTC off-by-one); reload persists | DC, MC | No ±6 h shift |
| C24 | Timezone | Android WebView ICU fallback renders `es-HN` format (no RangeError) | MW | Sensible format |
| C25 | Patient | Event with `patient_id` → `/patient-preview/[id]` (the canonical patient detail route — `/pacientes/[id]` does not exist); without → patient search modal | DC, MC | Correct destination |
| C26 | Push | Reminder fires tray (app closed) via web-push (calendar payload) | CB, MC | Visible; payload-correct |
| C27 | Push | Invitee notifications aggregate per event (like chat per-thread) + `renotify` | MC, CB | One card per event |
| C28 | Push | Body tap deep-links `/calendario?view=day&date=&eventId=` and selects event (no React #185) | CB, MC | Event/day opens |
| C29 | Notifications | Bell + push parity: mark-read in one clears the other | DC | Counts consistent |
| C30 | Standalone | Installed standalone app (Android/PWA) boots an offline shell with last-known calendar + banner | CB, MW | No white-screen; banner |
| C31 | Standalone | Create/reschedule offline in the standalone app → amber pill + queued; flush in order on reconnect | CB, MW | Lands once, ordered |
| C32 | i18n | es/en flips labels, months, weekdays, RBC toolbar, dates; week starts Monday | DC | No `en-US` leaks |
| C33 | Theming | Dark mode on month/week/day/agenda + modal: `--fd-*` tokens only (no hardcoded teal) | DC, MC | Consistent tokens |
| C34 | A11y | Keyboard-only: Tab through modal, Esc close, focus trap + restore; RBC toolbar/events focusable | DC | No dead-ends |
| C35 | A11y | NVDA + VoiceOver: `aria-live` announces new event/save/reschedule; skip link; `prefers-reduced-motion` disables RBC/framer transitions | DC (Win), iOS | Screen reader confirms; no motion |
| C36 | Rollout | Flag off → current `Dashboard` renders; legacy `/api/calendar/*` 404s; no dead imports; docs + migration ledger current; gate `tsc`+ESLint green | DC | Clean fallback + green build |

**Regression pair (two-user smoke, 10 min):** A invites B → C01, C03, C08, C13–C15, C23,
C26–C28 (A cold-boots, B schedules with patient+invitee+reminder; verify aggregation,
deep-link, offline queue).

---

### Phase 4 QA — detailed walkthrough (pinned 2026-09-09)

Environment: `NEXT_PUBLIC_USE_NEW_CALENDARIO=true`, dev server, **two** authenticated tabs/windows
(browser A = owner, browser B = invitee) so realtime peers are observable. Pre-create three events:
**A** today 09:00–09:30 dentist "Dr. Lee", **B** today 11:00–11:30 dentist "Dr. Lee",
**C** today 09:00–09:30 dentist "Dr. Patel". Persistence rule: changes must reach **Supabase
via PUT /api/events** (no localStorage anywhere in the DnD path; react-query optimism is in-memory
only, invalidate-on-success resets to server truth).

**C10 — Drag (move).** ① Week view: press+hold event B, drag to 14:00–14:30, release → snaps
instantly (no spinner/reload, "Cita movida" toast). ② Hard-refresh: still at 14:00 (persisted).
③ Tab B, no manual refresh: event moves within seconds (SSE invalidation). ④ Month view: drag
event A to another day → **date changes only, 09:30–10:00 stays** (month drops have no time
granularity). ⑤ Agenda: no grab cursor / no drag (expected — no DnD in agenda).

**C11 — Resize.** ① Week/day view, hover event edge → addon resize handle. ② Drag outward
09:30 → 10:30 → optimistic + "Cita actualizada", persists after reload. ③ **Clamp ≥ +30 min:**
drag handle *before* start → end clamps to start + 30 min (no negative/backwards). ④ **Clamp
same-day:** drag past midnight/into tomorrow → end clamps to **23:59** of the event's own day,
date unchanged. ⑤ Month view has no resize handle (expected).

**C12 — Dentist overlap block.** ① Drag event B (Dr. Lee) onto event A's 09:00–09:30 window →
**move blocked**, toast `Conflicto de agenda: Dr. Lee ya tiene una cita con <paciente> a esa hora
(09:00)`, event stays, reload still shows 11:00. ② Back-to-back (09:30–10:00) → **allowed**
(adjacency ≠ overlap). ③ **Cancelled never blocks:** edit event A → status "Cancelada" → drag B
onto its slot → allowed. ④ Different dentist (event C onto Dr. Lee event) → allowed. ⑤ Known
window: overlap check only sees events in the currently-loaded range; dragging far outside the
visible window won't refs detectable collisions — documented, acceptable.

**Custom-rendering pass.** Month pills = colored event pill (`EVENT_COLORS`) + dentist dot +
patient name, procedure badge on wide cells, hover tooltip `nombre · HH:MM–HH:MM · Dr.`. Week/day
pills = dot + truncated name only. Agenda rows = WhatsApp-style: circle w/ patient initial, bold
name, `procedimiento · HH:MM – HH:MM · Odontólogo`, right-aligned status chip
(Programada/Confirmada/Cancelada/Completada). Toolbar es: `Hoy`, `‹`/`›`, `Mes | Semana | Semana
laboral | Día | Agenda` (active = teal), `?view=&date=` URL sync. Headers: es weekday short + day
number, Monday-first; month cells have today's teal circle. Dark-mode spot-check (Phase 7 will
re-tokenize to `--fd-*`).

**Mobile wrap.** `< lg`: layout stacks, DayDetail below calendar; **drag/move/resize works on
touch** via `react-dnd-touch-backend` (coarse-pointer devices, 200 ms long-press grace so
scroll/swipe stays scroll; desktop keeps HTML5). Tap event → drawer → Editar remains the
precise-edit path; short taps never start a drag.

---

### Phase 10 — rollback plan (draft)

**Tier 0 — instant (feature flag).** `NEXT_PUBLIC_USE_NEW_CALENDARIO=false` redeploy →
current `Dashboard` (baseline) renders; data impact none (overhaul writes the same live
tables). Verify a full login → month → create flow before declaring rollback complete.

**Tier 1 — migration reversibility.** Only canonical-model migrations in scope (once
versioned `202XXXX_…`). RLS/auth hardening reverted by restoring prior policies (saved
in the migration files). RBC itself is a front-end dep — pin the `react-big-calendar` /
`date-fns` versions so a bad upgrade can be reverted by redeploy alone.

**Tier 2 — disable notifications (isolated).** Disable the calendar push trigger /
`send-to-user` path; optionally purge calendar push IDs; SW stays (harmless idle).

---

### Changelog (to be drafted at Phase 10 — initial public release)

Placeholder — newest-first at rollout, mirroring the chat changelog, including:
**RBC view engine** (month/week/work-week/day/agenda, URL sync, drag/resize),
security hardening (server auth + RLS), single reminder schedule + push route-through,
react-query realtime on live tables, es-HN i18n + `--fd-*` RBC theme, a11y pass,
`next/dynamic` RBC bundle, standalone Android/PWA app reaching web-calendar parity (`diamond-calendar` sync), timezone fix, docs refresh.

---

### Priority (biggest remaining wins, execution order)

1. **Phase 0 – Foundation & Security** — live auth/RLS holes + two-model ambiguity are
   exploitable today and block everything else; unblocks timezone correctness.
2. **Phase 2 – Data & RBC Bridge + Realtime** — react-query + `rbcAdapter` + realtime on
   live tables kills refetch churn, N+1, and enables phase 1/4 interactivity.
3. **Phase 5 – Notifications & Push** — reuse the chat web-push pipeline so closed-app
   scheduling/reminders work (the current 3-store reminder system is unreliable).
4. **Phase 1 – RBC view engine** — Month/Week/Day/Agenda + URL sync (biggest visible win,
   low effort thanks to RBC).
5. **Phase 3/4 – Modal UX + custom rendering/DnD** — slot-driven create/edit, dental cards,
   drag/resize with overlap check.
6. **Phase 7/8 – Theming/i18n/A11y** — es-first parity, tokens, keyboard/screen-reader.
7. **Phase 9 – Performance** — `next/dynamic` RBC + bundle report.
8. **Phase 6 – Android/PWA Standalone App** — additive and separate (never blocks web phases): update the old `diamond-calendar` iteration to mirror the current web calendar.
9. **Phase 10 – QA/Rollout** — executed last, as with chat.

### Deliberate decisions / divergences (draft)

- **View engine = RBC, not a bespoke grid.** This is the headline divergence from the
  original bespoke plan; all dental-domain logic stays custom and rides in
  `resource`/`components.*`. Phases 1 + 4 shrink accordingly. Any gap RBC can't express
  (e.g. custom cell affordances) is handled via `components.*` overrides, not forks.
- **Canonical model = the live `events` family.** Extension over revival — the UUID
  layer is deleted (realtime + invitee + reminder logic ports over).
- **Custom options preserved:** `PROCEDURES`, `DENTISTS`, `EVENT_COLORS`, patient +
  invitee search, multi-reminders, status/priority chips, delete flow, es-HN formatting —
  all survive the RBC swap unchanged (they live in the domain/data layers RBC renders).
- **Timezone = clinic-local, explicit** (`America/Tegucigalpa`), single formatter, no
  per-device ±6 h math; RBC localizer configured to the same clinic zone.
- **Drag/move works on both pointer types.** HTML5 backend on mouse; `react-dnd-touch-backend`
  on coarse-pointer devices with a 200 ms grace so native scroll wins on swipe and long-press
  starts a drag. Tap → drawer remains the precise-edit path on mobile.
- **Push via the existing chat web-push pipeline**, not a parallel one.
- **Standalone app is a separate surface, not a monolith feature.** The old `diamond-calendar`
  copy (sibling repo, Capacitor + FCM history) is the seed; it must be brought up to **mirror the
  current web calendar exactly** — never fork new features into it. Capacitor/FCM native glue
  lives only in the standalone; the monolith stays PWA-only.
- **No Storybook** (same decision as chat — accepted).
- **React 19 peer-dep pin:** if RBC emits React 19 peer warnings, add an
  `overrides`/`resolution` pin and validate DnD on the deployed build (C10–C12).

---

## Analysis — Building a modern calendario (RBC)

Goal: keep the live Supabase scheduling data and **all calendar custom options**, modernize
the view layer with RBC, close security holes, and reach chat-grade parity (push, i18n,
theming, a11y, perf). Auth stays Clerk.

### 1. Current calendario — strengths & gaps

| Aspect | Works well | Missing / improvable |
|--------|------------|----------------------|
| **Auth** | Clerk `useUser` gate present | Role gating bypassed; `x-user-id` header trust; `/api/(.*)` public |
| **Data layer** | `events`/`tasks`/`reminders` CRUD routes | Two models; no repository; refetch-everything |
| **UI** | Month grid + day panel + tasks/reminders + rich modal (custom options) | Month-only; no week/day/agenda; no drag; monolith modal |
| **Realtime** | Service exists (orphaned tables) | Not on live data; no REPLICA IDENTITY; publication drift |
| **Notifications** | Bell + `notifications` table; deep-link listener | Unauthenticated `send-to-user`; no web-push; 3 reminder stores |
| **Standalone (Android/PWA)** | Old `diamond-calendar` iteration exists (Capacitor + FCM) | Drifted months behind the web calendar; must be re-synced to parity |
| **Performance** | Route works | Monolith + future RBC must be lazy; N+1 participants |
| **A11y** | Loading/error/unauthorized states | No focus trap, `aria-live`, keyboard nav, reduced-motion |
| **i18n / Theme** | Dark mode via ThemeContext | No i18n layer; mixed locales; tokens chat-scoped |
| **Extensibility** | `components/calendar-new` self-contained | Duplicate Toast; dead components; services target dead tables |

### 2. What RBC + the target give us

| Capability | Relevance | Notes |
|------------|-----------|-------|
| **RBC views + math** | Month/Week/Day/Agenda, overlaps, multi-day, view-switch | Off-the-shelf; localizer = `date-fns` |
| **RBC selection + DnD** | `onSelectSlot`/`onSelectEvent`, drag/resize | Addon + `react-dnd` peers (desktop) |
| **Custom `components.*`** | Dental event pills, agenda rows, es toolbar | `resource` carries the full `ClinicEvent` |
| **Chat-grade infra** | react-query, web-push, `--fd-*`, i18n, a11y, bundle | Port from the chat suite (reuse proven code) |

### 3. Effort estimation (relative)

| Phase | Rough effort (person-days) | Risk |
|-------|---------------------------|------|
| 0 – Foundation, Data Model & Security | 4 | High (auth/RLS + schema consolidation) |
| 1 – RBC Layout & Navigation Engine | 2 | Medium (RBC integration + React 19 peers) |
| 2 – Data Layer, RBC Bridge & Realtime | 3 | Medium (publication/REPLICA IDENTITY) |
| 3 – Slot Selection & Event Modal UX | 3 | Medium (modal split) |
| 4 – Custom RBC Rendering & DnD | 3 | Medium (DnD + overlap) |
| 5 – Notifications & Push Pipeline | 3 | Medium (webhook + SW calendar path) |
| 6 – Android/PWA Standalone App (`diamond-calendar` sync) | 3 | Medium |
| 7 – Theming & i18n (es-HN) | 2 | Low (RBC CSS overlay) |
| 8 – Accessibility & Keyboard Nav | 2 | Low |
| 9 – Performance & Dynamic Bundling | 2 | Low |
| 10 – Final QA, Migration & Roll-out | 3 | Low-Medium |
| **Total** | **≈ 24–26 person-days** (≈ 5 weeks for 1 dev) | |

> Note: the bespoke-grid alternative was ≈ 32 person-days; RBC trades ~6–8 days for a
> dependency + CSS-overlay commitment. Effort is spent on the dental domain and the
> chat-parity layers (data, realtime, push, i18n, a11y), not on calendar engine work.

### 4. Feature/Function comparison (current vs target)

| Feature | Current Calendario (C) | Target (RBC) | Notes |
|---------|------------------------|--------------|-------|
| **Views** | Month only | Month / Week / Work-Week / Day / Agenda | URL-synced toolbar |
| **Scheduling** | Modal create/edit | Slot-driven quick-add + multi-step Zod/RHF + drawer | Prefill from `start/end` |
| **Drag & drop** | None | Drag + resize (desktop) w/ overlap check | Optimistic via react-query |
| **Realtime** | None on live data | Live tables + REPLICA IDENTITY FULL | Invitee publication fixed |
| **Reminders** | 3 stores, unreliable | 1 schedule, server-fired + web-push | Consolidation |
| **Invitees / RSVP** | API exists | Realtime invite + status in drawer | Port from live API |
| **Patient linkage** | `patient_id`/`patient_name` | Event ↔ `/pacientes` + `/patient-form` | Deep links |
| **Custom options** | Rich modal (procedures/dentists/colors) | Preserved via `components.*` + `resource` | Data layer unchanged |
| **Notifications** | Bell + browser only | Bell + web-push + SW calendar cards | Closed-app delivery |
| **Standalone app** | None | Installable Android/PWA mirroring the web calendar (RBC + push) | `diamond-calendar` sync (parity, not new features) |
| **i18n / Theme** | Mixed locales; hardcoded colors | Typed es/en; `--fd-*` RBC theme | Es-first, Monday start |
| **A11y** | Loading/error states | Focus traps, aria-live, keyboard pass | Chat Phase 8 parity |
| **Security** | `x-user-id` header trust | Clerk-session identity + RLS | Close the hole |
| **Perf / bundle** | Monolith in route | Lazy RBC + modals; virtualized agenda | Chat Phase 9 parity |

---

## Work State

**Completed**
- **Baseline (pre-plan, on disk):** functional `/calendario` — custom month
  `CalendarGrid` + `DayDetail` + `TaskPanel` + `ReminderPanel` + `EventModal`
  (`components/calendar-new/`); event/task/reminder CRUD routes; `event_invitees`;
  dashboard "Próximos Eventos" with Clerk-API avatars (`66eb4ac`/`f2714b6`); bell
  notifications + deep-link listener; src/ refactor (`90982ce`), async params
  (`5420017`), anon-key client (`3ce012c`).
- **Audit (2026-09-07/08):** full inventory (two models, auth/RLS holes, timezone shims,
  realtime drift, 3 reminder stores, dead code, unversioned SQL).
- **Plan adaptation (2026-09-08):** plan re-based onto **`react-big-calendar` +
  `date-fns`** as the view engine — Phases 1/4 reduced, Phase 3 slot/drawer UX,
  Phase 9 lazy RBC, `rbcAdapter` bridge — while preserving all dental custom options
  and the chat-parity phases (0/2/5/6/7/8/10).
- **Phase 0 (2026-09-08, ✅):** canonical `events` family + RLS ownership predicates
  (anon fully locked out, `42501` verified live), UUID layer + RPCs deleted, Clerk-session
  authz everywhere, timezone policy, versioned migrations + ledger, feature flag. Commits
  `d4af0c2`/`5155588`/`90bb1b0`; migrations `20260908…a`/`…b` applied + live-verified.
- **Phase 1 (2026-09-08, ✅):** RBC `MONTH/WEEK/WORK_WEEK/DAY/AGENDA` shell behind the
  flag (`40b31a1`): `RbcCalendar` (es localizer, Monday start), `rbcAdapter`,
  `CalendarShell` with URL `?view=&date=` sync, `next/dynamic` + `CalendarSkeleton` +
  `CalendarSkeleton`-gated route refetch. `next build` green.
- **Phase 2 (2026-09-08, ✅):** `calendarRepository` + `viewToRange` + react-query hooks
  (`useCalendarEvents(range)` per-range cache, `useCalendarMutations` optimistic toggle);
  **Clerk-gated service-role SSE** `/api/events/realtime` + `useCalendarRealtime`
  (10s debounce dedupe + tombstone guard + backoff reconnect); events GET `date_from/to`,
  batched `/api/events/participants?ids=`; shell refactored onto hooks + URL
  `?view=&date=&from=&to=`; middleware `no-store` on user-scoped calendar APIs;
  migration `20260908c` (realtime publication + REPLICA IDENTITY FULL) **applied +
  verified live (2026-09-08)** — pub membership 5/5, `relreplident=f` 5/5, app-pattern
  realtime probe green ×2 (see LEDGER); `events` `procedure`/`dentist` drift fixed by
  `20260908d` (applied + verified).

`20260908d` (applied + verified).
- **Phase 3 (2026-09-08/09, ✅):** slot→modal prefill + detail drawer, Zod/RHF modal split,
  drafts, invitee/reminder repo sync, `/calendario` authz opened to any authenticated role,
  month-layout `height:600px` fix (`764f97b`). **QA C17–C21 + C25 passed in-browser
  (2026-09-09).**
- **Phase 4 code + tail (2026-09-09/10, committed `c19de75`):** custom RBC rendering
  (`calendarComponents.tsx`: event pill, WhatsApp-style agenda rows + status chips, es
  toolbar + headers), `withDragAndDrop` + `DndProvider` (`calendarDnD.ts`: optimistic
  move/resize with snapshot rollback, `findDentistOverlap` chair/cubicle block, month
  date-only rebase, resize clamps), invitee visibility (owner OR invited), non-owner
  DnD/delete hardening, **migration `20260909e` applied + LEDGER ✓**, and the **perf
  pass** (fire-and-forget `onSettled` invalidations, `keepPreviousData`, cold-boot spinner
  gate, `clinicDateKey` off-by-one fix).
- **Phase 4 browser QA PASSED + 4 follow-up fixes (2026-09-10, committed `59b3b02`,
  deployed @ app.dentaldiamondhn.com ✓):** realtime debounce → 1.5s (invitee peek ~2s);
  touch DnD (`react-dnd-touch-backend`, coarse-pointer, 200ms grace); conflict check
  no-dentist fallback (any-occupied-slot block, `conflictMessage` toast); `PROCEDURES` es.
Preceding UI passes also shipped in the same commit: "Próximos esta semana" preview
   (today→Sunday, Libre/Agendar, Cancelada chips), GoTrueClient singleton fix, es-HN side
   cards with the Recordatorios card merged event reminders and reordered above Tareas.
- **Server-side dentist conflict enforcement (2026-09-10, committed `4cd7993` + `e7af050`,
  pushed to `origin/master`):** clinic-wide availability check that catches the dentist's
  own private bookings (unseeable to the creator) — POST create + PUT move/resize return
  `409 DENTIST_CONFLICT` (Spanish message + conflicting rows) unless `force_conflict` is set;
  both Save and drag/resize paths block with a toast → `ConflictOverrideDialog` ("Guardar de
  todos modos") → resubmit with `force_conflict: true`. Same round: realtime debounce → 1.5s,
  touch DnD backup, no-dentist conflict fallback, `PROCEDURES` es. **Live verification
  deferred to Phase 5** (notifications make the block/double-booked demo and cross-user
  confirm practical to observe).
- **Post-plan Phase-5-adjacent shipping (2026-09-11→13, committed on `master`; deployed locally via `vercel --prod`):** event phone autopopulate + WhatsApp link (`1286423`+`7d6c04b`); default smart reminder schedule + country-code phone (`1286423`); event-start notifications + compact icon (`28b6c6c` "Phase 5 100%"); reliable 1-min dispatch + pgcron robustness (`4ae3b49`, `2a5b272`, `bc932d6`); fired-reminder visibility (`1b3a03c`); SW cache v12 + `updateViaCache: none` (`02d3c63`); Clerk-based participant identities (`d3fe339`) + dashboard avatar fix (`b65804d`); Próximos Eventos owned-OR-invited (`f48b96a`); notification RLS owner-scoping (`20260913b` insert + `20260913c` select/update/delete — both applied live) + bell mark-read/re-popup/SW-swipe fixes (`30aa63a`, `a2a5312`).

**Active**
- **Phase 5 (Notifications & Push Pipeline): code complete + committed — remaining = deploy + QA.**
  - **5a calendar push — ✅ DELIVERED (`ecaa248`):** `/api/push/calendar-webhook` (shared
    `PUSH_WEBHOOK_SECRET` gate; events branch → invitees via `event_invitees`, skips owner +
    cancelled/completed; invites branch → the new invitee; every delivery = push tray + `notifications`
    bell via `deliverCalendarToUser`); `public/sw.js` `showCalendarNotification()` (aggregated tray card
    per `calendar-<eventId>`, "(N)" counter, `notificationclick` deep-link);
    `CalendarShell` `?eventId=` → opens detail drawer + day view, drops the param.
    **Migration `20260910a_calendario_push_webhook.sql` applied + LEDGER ✓ (2026-09-10).**
  - **Invitee double-booking gate — ✅ verified live (`e33a48b`):** `findInviteeConflicts()` in
    `src/lib/dentistAvailability.ts`; PUT (events) + invitees POST → `409 INVITEE_CONFLICT`; same
    `ConflictOverrideDialog` path (A drops onto B's existing event → block → "Guardar de todos modos").
  - **5b reminder schedule + bell/push parity — ✅ built (`7af6bd6`):** `reminders` POST/PUT anchored to
    `event start − minutes_before` (clinic tz via `clinicWallClockTimestamp`); cron dispatcher
    `/api/cron/reminders` (CRON_SECRET-gated, owner + invitees recipients, flips `sent` after delivery);
    `event_reminders.sent` already existed → **no migration needed**; every calendar delivery writes both
    tray + bell (`src/services/calendarNotifications.ts`).
  - **Scheduler — ✅ GitHub Actions (`020d053`):** `vercel.json` crons removed (Hobby = 1 run/day cap;
    Pro $20/user/mo) → `.github/workflows/calendario-reminders.yml` ticks every 5 min
    (`*/5 * * * *`, `x-cron-secret` header, `concurrency: cancel-in-progress`, manual `workflow_dispatch`).
  - **5-min lean — ✅ (`cdb0f9a`):** dispatcher fires reminders `REMINDER_LEAN_MINUTES` (default 5, min 0)
    early (`dueAt = now + lean`); stored `reminder_time` + UI unchanged.
  - **Deploy + scheduler — ✅ live (2026-09-11):** `vercel --prod` shipped `cdb0f9a`; deployed
    `/api/cron/reminders` returns `401` without the secret (gate live). Commits pushed to
    `origin/master`; because the repo **default branch was `main`** (unrelated history to `master`),
    the self-contained workflow was also committed to `main` (`bac82db`) — Actions registered it
    (`active`), a manual `workflow_dispatch` run succeeded end-to-end
    (`{"ok":true,"processed":0}`), and the `*/5` schedule became live.
  - **⚠ Branch-layout incident + fix (2026-09-11):** the `bac82db` push to `main` triggered Vercel's
    git integration (project `link.productionBranch = "main"`) to **auto-deploy the unrelated `main`
    codebase to production**, 404-ing every calendar/chat API route until production was redeployed
    from `master`. **Fix:** removed the repo's `main` default branch → `master` (Actions schedules now
    read `master`'s workflow, verified by a green `workflow_dispatch` on `master`); `main` is orphaned
    and must NOT be pushed (Vercel `productionBranch` stays `main` but nothing pushes it). Deploy
    method = manual `vercel --prod` from `master` (custom-credential git link has no Production Branch
    UI setting).
  - **⚠ Push state (2026-09-13):** `origin/master` is **13 commits behind local `master`**
    (`4ae3b49`…`a2a5312` — pgcron robustness, event-start notifications, SW cache v12, Clerk
    identities/avatars, Próximos invitations, notification RLS + mark-read/re-popup fixes). The local
    `vercel --prod` deploy flow works without pushing, but the remote is stale — push `master` if a
    remote mirror is wanted (never touch orphaned `main`).
  - **🆕 Phase 5b extension — personal reminders + recur-until-completed tasks (2026-09-11, committed `f15fe4a` — pushed `origin/master` + deployed):**
    the cron dispatcher now covers `reminders` (ReminderPanel personal notes → owner, one-shot, marks
    `dismissed` after delivery) and `tasks` (recur-until-completed — owner push, `remind_at` advances by
    `repeat_every_days` until completed; completed tasks never fire; one-shot ones clear `remind_at`).
    Migration `20260911a_tasks_reminder_schedule.sql` (adds `tasks.remind_at` + `tasks.repeat_every_days`
    + partial index) **applied by user + smoke-tested live** (recurrent +2d / one-shot cleared / completed
    untouched; `sources.tasks` in dispatcher response). TaskPanel gains optional datetime + "Cada N días"
    inputs + reminder/repeat badges (`formatTaskTime`); repo/hook/`CalendarShell.addTask` accept the new
    fields. Dispatcher is per-source isolated (one schema-drift failure can't take down the others).
  - **Fix — fired event reminders stay visible (`1b3a03c`, deployed 2026-09-11):** the Recordatorios
    card dropped reminders of citas that had already ended, so a reminder created after the event's
    window passed vanished with no trace (e.g. event created for a past slot → dispatcher fires it within
    minutes → card silently hides it). The card now keeps ended/fired citas' reminders listed as overdue
    (rose) with an **Enviado** tag (`event_reminders.sent` now returned by `/api/events/reminders`
    batch + `EventReminder.sent` type) and a per-device dismiss (localStorage); X still deletes the
    reminder server-side.
  - **Remaining:** user live QA — personal ReminderPanel note + recurring task with past `remind_at` → ≤5 min tray card + bell; complete the task → it stops firing. See Next Move.

**Blocked**
- ~~Phase 2 realtime was gated on applying `20260908c`~~ — applied + **verified live** (2026-09-08);
  note: hosted realtime needed a project restart to re-read the publication (per-table-channel joins
  remain intermittently flaky — route uses one join, mitigated), and RLS keeps `payload.old` minimal
  (invalidate-only guard is unaffected).
- ~~Invitee realtime move/resize refresh gated on `20260909e`~~ — **applied 2026-09-09, LEDGER ✓**;
  verify live refresh during Phase 4 QA (C10 part ③).

### Next Move
1. ~~Push commits to `origin/master`~~ ✅ (2026-09-11) + workflow also pushed to `main` (`bac82db`) — Actions
   registered, manual `workflow_dispatch` succeeded (`{"ok":true,"processed":0}`).
2. ~~Fix Vercel CLI auth + deploy~~ ✅ — `vercel --prod` shipped `cdb0f9a`; `/api/cron/reminders`
   returns `401` without secret (gate live); `CRON_SECRET`/`VAPID_*`/`PUSH_WEBHOOK_SECRET` confirmed.
3. **Live QA (user)** — in-browser:
   - Create a cita + reminder (minutos antes) → wait ≤5 min (or run manual `workflow_dispatch`) →
     tray card arrives + bell row appears; confirm "última entrega" timestamp moves.
   - Drag onto invitee's busy slot → 409 `INVITEE_CONFLICT` → "Guardar de todos modos" → force saves →
     invitee B gets "Nueva cita" push + bell.
   - Tap notification → deep-link opens `/calendario?view=day&date=…&eventId=…` detail drawer.
4. **Phase 5b extension:** ~~commit dispatcher rewrite + UI/types/repo changes~~ ✅ (`f15fe4a`, pushed
   `origin/master`) → ~~`vercel --prod`~~ ✅ (deployed + probed: cron 401 w/o secret / 200 `sources`
   with secret / vapid 200 / events-POST 401) + ~~local smoke~~ ✅ (personal reminder → `dismissed`+bell;
   task recur +2d / one-shot cleared / completed untouched) → **user Live QA:** schedule a personal
   ReminderPanel note + a recurring task with `remind_at` in the past → ≤5 min later both arrive (push + bell);
   complete the task → it stops firing.
5. **Post-QA:** ~~mark Phase 5 + 5b rows → ✅ in the status table~~ ✅ (done 2026-09-13);
   ~~scope Phase 6 (PWA/offline)~~ → **Phase 6 re-scoped to the Android/PWA Standalone App
   (`diamond-calendar` sync) — plan cooked 2026-09-13, execution pending (user to kick off)**;
   next actionable: Phase 10 (final QA matrix C01–C36 + rollback + changelog) or Phases 7–9 tail.

### Verification Gate
```bash
npx tsc --noEmit
NODE_OPTIONS="--max-old-space-size=4096" npx eslint src/calendario components/calendar-new app/\(auth\)/calendario app/api/events app/api/tasks app/api/reminders --cache --format stylish
```

### Relevant Files (baseline + RBC additions)
- `app/(auth)/calendario/page.tsx` — page + Clerk gate (`ToastProvider` + `Dashboard`) →
  future flag-gated RBC loader.
- `components/calendar-new/` — `Dashboard.tsx`, `CalendarGrid.tsx` (to be superseded by
  RBC `Calendar`), `DayDetail.tsx` (→ RBC DAY), `EventModal.tsx` (to be split, Phase 3),
  `TaskPanel.tsx`, `ReminderPanel.tsx`, `UpcomingEvents.tsx` (orphaned), `Toast.tsx`.
- **RBC additions (delivered):** `package.json` → `react-big-calendar@1.20.0`,
  `date-fns@4`; `src/calendario/rbcAdapter.ts` (`ClinicEvent` ↔ `RBCEvent`),
  `src/calendario/RbcCalendar.tsx` (RBC + es localizer), `src/calendario/CalendarShell.tsx`
  (URL `?view=&date=&from=&to=`), `src/calendario/CalendarSkeleton.tsx`;
  **Phase 2 data layer:** `src/calendario/calendarRepository.ts` (repo + `EventInput`),
  `src/calendario/range.ts` (`viewToRange`), `src/calendario/hooks/useCalendarData.ts`
  (react-query: events/tasks/reminders + optimistic `useCalendarMutations`),
  `src/calendario/hooks/useCalendarRealtime.ts` (SSE client), `app/api/events/realtime/route.ts`
  (Clerk-gated service-role SSE), `app/api/events/participants/route.ts` (batched `?ids=`),
  `database/migrations/20260908c_calendario_phase2_realtime.sql` (pub + REPLICA IDENTITY).
  Deferred to later phases: `react-dnd` peers (Phase 4), i18n (`src/calendario/i18n/…`),
  `app/styles/rbc-theme.css` (Phase 7).
- `app/api/events/route.ts` + `app/api/events/upcoming/route.ts` +
  `app/api/events/[id]/{invitees,participants,reminders}/route.ts` ·
  `app/api/tasks/route.ts` · `app/api/reminders/route.ts` — live CRUD (auth to harden).
- `src/lib/types-calendar.ts` — live model + **custom options** (`PROCEDURES`, `DENTISTS`,
  `EVENT_COLORS`), `date`/`start_time` strings (timezone policy in Phase 0).
- `database/migrations/create_new_calendar_tables.sql` +
  `extend_new_calendar_with_invitees.sql` — live tables.
- `src/services/calendar{Service,TaskService,ReminderService,InviteesService,RealtimeService}.ts`
  + `src/services/inviteeNotificationService.ts` — **orphaned UUID layer** to port/delete
  (+ RPCs `supabase/functions/get_user_*events*.sql`, `app/api/calendar/*`).
- `src/types/calendar.ts` / `calendarTasks.ts` / `calendarInvitees.ts` — UUID types to retire.
- `contexts/BellNotificationContext.tsx`, `app/api/notifications/send-to-user/route.ts`,
  `hooks/useNotificationListener.ts`, `components/ui/CalendarNotificationCounter.tsx` —
  notification surface (push route-through in Phase 5).
- `public/sw.js`, `scripts/build-sw-precache.mjs`, `src/lib/push/pushService.ts`,
  `app/api/push/*` — chat web-push pipeline to extend for calendar.
- `middleware.ts` — role map + TEMPORARY bypass + public `/api/(.*)` (Phase 0).
- `CALENDAR_SYSTEM_DOCUMENTATION.md` — stale UUID doc to refresh at Phase 10.
- `diamond-calendar-app/` — compiled-only Vite experiment (DentaCal), zero references —
  candidate for deletion.

---

*Mirrors `CHAT_OVERHAUL_PLAN.md` structure and conventions (conventional commits,
feature flag, verified-gate, versioned migrations). RBC adaptation 2026-09-08 — dental
custom options preserved.*