import { Loader2 } from 'lucide-react';

export default function CalendarSkeleton() {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-gray-100">
        <div className="h-6 w-40 rounded bg-gray-100 animate-pulse" />
        <div className="flex gap-2">
          <div className="h-9 w-20 rounded-lg bg-gray-100 animate-pulse" />
          <div className="h-9 w-20 rounded-lg bg-gray-100 animate-pulse" />
        </div>
      </div>
      <div className="grid grid-cols-7 border-b border-gray-100">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="h-8 bg-gray-50" />
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px p-4">
        {Array.from({ length: 35 }).map((_, i) => (
          <div key={i} className="h-16 rounded bg-gray-50 animate-pulse" />
        ))}
      </div>
    </div>
  );
}