import { useMemo } from 'react';
import { motion } from 'framer-motion';

interface ClinicEvent {
  id: number;
  user_id: string;
  title: string;
  patient_name: string;
  procedure: string;
  dentist: string;
  date: string;
  start_time: string;
  end_time: string;
  color: string;
  notes: string;
  created_at: string;
}

interface Props {
  currentDate: Date;
  events: ClinicEvent[];
  selectedDate: string | null;
  onSelectDate: (dateStr: string) => void;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function CalendarGrid({ currentDate, events, selectedDate, onSelectDate }: Props) {
  const days = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const startWeekday = firstDay.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const cells: { date: Date; isCurrentMonth: boolean }[] = [];
    for (let i = startWeekday - 1; i >= 0; i--) {
      cells.push({ date: new Date(year, month - 1, daysInPrevMonth - i), isCurrentMonth: false });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ date: new Date(year, month, d), isCurrentMonth: true });
    }
    while (cells.length % 7 !== 0 || cells.length < 42) {
      const last = cells[cells.length - 1].date;
      cells.push({ date: new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1), isCurrentMonth: false });
      if (cells.length >= 42) break;
    }
    return cells;
  }, [currentDate]);

  const eventsByDate = useMemo(() => {
    const map: Record<string, ClinicEvent[]> = {};
    events.forEach((e) => {
      if (!map[e.date]) map[e.date] = [];
      map[e.date].push(e);
    });
    return map;
  }, [events]);

  const todayStr = new Date().toISOString().slice(0, 10);
  const fmtDate = (d: Date) => d.toISOString().slice(0, 10);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="grid grid-cols-7 border-b border-gray-100">
        {WEEKDAYS.map((d) => (
          <div key={d} className="text-center py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((cell, i) => {
          const dateStr = fmtDate(cell.date);
          const dayEvents = eventsByDate[dateStr] || [];
          const isToday = dateStr === todayStr;
          const isSelected = dateStr === selectedDate;
          return (
            <motion.button
              key={i}
              whileHover={{ scale: 1.02 }}
              onClick={() => onSelectDate(dateStr)}
              className={`relative min-h-[72px] sm:min-h-[100px] p-1.5 border-b border-r border-gray-50 text-left transition-colors ${
                cell.isCurrentMonth ? 'bg-white' : 'bg-gray-50'
              } ${isSelected ? 'ring-2 ring-teal-400 ring-inset' : ''}`}
            >
              <div className="flex items-center justify-between mb-1">
                 <span className={`text-xs font-medium ${
                   isToday ? 'bg-teal-500 text-white rounded-full w-6 h-6 flex items-center justify-center'
                   : cell.isCurrentMonth ? 'text-gray-700' : 'text-gray-400'
                 }`}>
                  {cell.date.getDate()}
                </span>
                {dayEvents.length > 0 && (
                  <span className="text-[10px] text-gray-400 font-medium">{dayEvents.length}</span>
                )}
              </div>
              <div className="space-y-0.5">
                {dayEvents.slice(0, 3).map((e) => (
                  <div
                    key={e.id}
                    className="text-[10px] sm:text-xs truncate rounded px-1 py-0.5 text-white font-medium"
                    style={{ backgroundColor: e.color }}
                  >
                    {e.start_time} {e.patient_name}
                  </div>
                ))}
                {dayEvents.length > 3 && (
                  <div className="text-[10px] text-gray-400 px-1">+{dayEvents.length - 3} more</div>
                )}
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
