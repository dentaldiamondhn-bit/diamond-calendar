import { addDays, endOfMonth, endOfWeek, startOfMonth, startOfWeek } from 'date-fns';
import type { View } from 'react-big-calendar';
import { dateToDateStr } from '@/calendario/rbcAdapter';
import { clinicDateKey } from '@/calendario/timezone';
import type { EventRange } from '@/calendario/calendarRepository';

/**
 * Compute the fetch window for a given RBC view anchored on `date`.
 * Month/Week pull the surrounding ISO week so cross-month/day padding renders;
 * agenda (the longest view) looks 90 days ahead.
 *
 * Every window is also widened to cover the CURRENT clinic-local week
 * (Monday → Sunday of the week containing today, `America/Tegucigalpa`) so the
 * side-panel "Próximos esta semana" preview is complete on every view — day view
 * alone only fetches a single day otherwise.
 */
function currentWeekRange(): EventRange {
  const today = new Date(`${clinicDateKey()}T00:00:00`);
  return {
    from: dateToDateStr(startOfWeek(today, { weekStartsOn: 1 })),
    to: dateToDateStr(endOfWeek(today, { weekStartsOn: 1 })),
  };
}

function union(a: EventRange, b: EventRange): EventRange {
  return {
    from: a.from < b.from ? a.from : b.from,
    to: a.to > b.to ? a.to : b.to,
  };
}

export function viewToRange(view: View, date: Date): EventRange {
  const preview = currentWeekRange();
  switch (view) {
    case 'month': {
      const from = startOfWeek(startOfMonth(date), { weekStartsOn: 1 });
      const to = endOfWeek(endOfMonth(date), { weekStartsOn: 1 });
      return union(preview, { from: dateToDateStr(from), to: dateToDateStr(to) });
    }
    case 'week':
    case 'work_week': {
      const from = startOfWeek(date, { weekStartsOn: 1 });
      const to = endOfWeek(date, { weekStartsOn: 1 });
      return union(preview, { from: dateToDateStr(from), to: dateToDateStr(to) });
    }
    case 'day':
      return union(preview, { from: dateToDateStr(date), to: dateToDateStr(date) });
    case 'agenda':
    default:
      return union(preview, { from: dateToDateStr(date), to: dateToDateStr(addDays(date, 90)) });
  }
}