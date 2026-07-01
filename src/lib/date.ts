export function formatLocalISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function nowLocalISODate(): string {
  return formatLocalISODate(new Date());
}

export function formatLocalISOYearMonth(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function addMonths(dateStr: string, months: number): string {
  const date = new Date(dateStr);
  date.setMonth(date.getMonth() + months);
  return formatLocalISODate(date);
}

export function formatDate(date: Date, pattern: string): string {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  return pattern
    .replace('yyyy', String(y))
    .replace('MM', String(m).padStart(2, '0'))
    .replace('M', String(m))
    .replace('dd', String(d).padStart(2, '0'))
    .replace('d', String(d));
}
