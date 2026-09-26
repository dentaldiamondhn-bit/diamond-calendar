'use client';

import {
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';

const base =
  'w-full px-3 py-2 rounded-lg border text-sm outline-none transition-all ' +
  'bg-white border-slate-200 text-slate-800 placeholder:text-slate-400 ' +
  'focus:border-teal-500/60 focus:ring-2 focus:ring-teal-500/20 ' +
  'dark:bg-slate-900/60 dark:border-slate-700/60 dark:text-slate-100 ' +
  'dark:placeholder:text-slate-500 dark:hover:brightness-125';

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
      <label className="text-sm font-medium text-slate-700 dark:text-slate-200">{label}</label>
      <div className="mt-1">{children}</div>
      {error ? (
        <p className="text-xs text-rose-400 mt-1">{error}</p>
      ) : hint ? (
        <p className="text-xs text-slate-400 mt-1">{hint}</p>
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