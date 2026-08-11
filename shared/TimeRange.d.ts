export interface TimeRange {
  start: Date;
  end: Date;
}

export declare function getDefaultTimeRange(refDate?: Date): TimeRange;
export declare function shiftTimeRange(current: TimeRange, direction: -1 | 1): TimeRange;
export declare function getMonthLabel(range: TimeRange): string;
