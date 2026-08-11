export interface TimeRange {
  start: Date;
  end: Date;
}

export function getDefaultTimeRange(refDate?: Date): TimeRange {
  const now = refDate || new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { start, end };
}

export function shiftTimeRange(current: TimeRange, direction: -1 | 1): TimeRange {
  const newMonth = current.start.getMonth() + direction;
  const ref = new Date(current.start.getFullYear(), newMonth, 1);
  return getDefaultTimeRange(ref);
}

export function getMonthLabel(range: TimeRange): string {
  return `${range.start.getFullYear()}年${range.start.getMonth() + 1}月`;
}
