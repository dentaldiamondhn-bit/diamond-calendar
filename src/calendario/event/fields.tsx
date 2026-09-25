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