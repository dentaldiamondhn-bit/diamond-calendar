'use client';

import {
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';

const base =
  'w-full px-3 py-2 rounded-lg border text-sm outline-none transition-colors ' +
  'bg-white border-gray-200 text-gray-800 placeholder:text-gray-400 ' +
  'focus:border-teal-500 focus:ring-2 focus:ring-teal-100 ' +
  'dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100';

const inputCls = (invalid?: boolean) => `${base} ${invalid ? 'border-rose-300 dark:border-rose-700' : ''}`;

export function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="text-sm font-medium text-gray-700 dark:text-gray-200">{label}</label>
      <div className="mt-1">{children}</div>
      {error ? (
        <p className="text-xs text-rose-500 mt-1">{error}</p>
      ) : hint ? (
        <p className="text-xs text-gray-400 mt-1">{hint}</p>
      ) : null}
    </div>
  );
}

export const TextInput = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }
>(({ invalid, className, ...props }, ref) => (
  <input ref={ref} className={`${inputCls(invalid)} ${className ?? ''}`} {...props} />
));
TextInput.displayName = 'TextInput';

export const TextArea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }
>(({ invalid, className, ...props }, ref) => (
  <textarea ref={ref} className={`${inputCls(invalid)} resize-none ${className ?? ''}`} {...props} />
));
TextArea.displayName = 'TextArea';

export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }
>(({ invalid, className, children, ...props }, ref) => (
  <select ref={ref} className={`${inputCls(invalid)} ${className ?? ''}`} {...props}>
    {children}
  </select>
));
Select.displayName = 'Select';

const CLOCK_HOURS = Array.from({ length: 12 }, (_, i) => i + 1);
const CLOCK_MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

/**
 * 12-hour hh:mm AM/PM picker (hour + minute selects, tap-to-toggle period).
 * Emits 24h `HH:MM` so the form schema and DB keep 24h values.
 */
export function TimeInput({
  value,
  onChange,
  invalid,
  id,
  'aria-label': ariaLabel,
}: {
  value?: string;
  onChange: (v: string) => void;
  invalid?: boolean;
  id?: string;
  'aria-label'?: string;
}) {
  const [h = '09', m = '00'] = (value || '09:00').split(':');
  const h24 = Math.min(23, Math.max(0, Number(h) || 0));
  const minute = /^\d{2}$/.test(m) && Number(m) <= 59 ? m : '00';
  const hour12 = ((h24 + 11) % 12) + 1;
  const period = h24 >= 12 ? 'PM' : 'AM';

  const commit = (hh12: number, mm: string, p: 'AM' | 'PM') =>
    onChange(`${String((hh12 % 12) + (p === 'PM' ? 12 : 0)).padStart(2, '0')}:${mm}`);

  return (
    <div
      id={id}
      role="group"
      aria-label={ariaLabel}
      className={`flex ${inputCls(invalid)} p-0 overflow-hidden text-sm`}
    >
      <select
        aria-label="Hora"
        value={hour12}
        onChange={(e) => commit(Number(e.target.value), minute, period)}
        onBlur={() => commit(hour12, minute, period)}
        className="flex-1 min-w-0 bg-transparent border-none outline-none cursor-pointer px-2 py-2 text-gray-800 dark:text-gray-100"
      >
        {CLOCK_HOURS.map((x) => (
          <option key={x} value={x}>
            {String(x).padStart(2, '0')}
          </option>
        ))}
      </select>
      <span className="py-2 text-gray-400 select-none" aria-hidden>
        :
      </span>
      <select
        aria-label="Minuto"
        value={minute}
        onChange={(e) => commit(hour12, e.target.value, period)}
        onBlur={() => commit(hour12, minute, period)}
        className="flex-1 min-w-0 bg-transparent border-none outline-none cursor-pointer px-2 py-2 text-gray-800 dark:text-gray-100"
      >
        {CLOCK_MINUTES.map((x) => (
          <option key={x} value={x}>
            {x}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => commit(hour12, minute, period === 'AM' ? 'PM' : 'AM')}
        className="shrink-0 px-2.5 py-2 text-xs font-semibold text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-900/40 border-l border-gray-200 dark:border-gray-700 hover:bg-teal-100 dark:hover:bg-teal-900/60 transition cursor-pointer"
        aria-label="Cambiar a. m./p. m."
      >
        {period}
      </button>
    </div>
  );
}