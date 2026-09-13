/** Spanish label for a reminder offset stored as minutes_before. */
export function reminderLabel(min: number): string {
  if (min <= 0) return 'Sin recordatorio';
  if (min < 60) return `${min} min antes`;
  if (min === 60) return '1 hora antes';
  if (min < 1440) return `${min / 60} h antes`;
  return '1 día antes';
}