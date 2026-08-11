import { useEffect } from 'react';
import type { TimeRange } from '@shared/TimeRange';

interface UseKeyboardShortcutsParams {
  onShiftMonth?: (direction: number) => void;
  onSearch?: () => void;
  timeRange?: TimeRange;
}

export function useKeyboardShortcuts({
  onShiftMonth,
  onSearch,
  timeRange,
}: UseKeyboardShortcutsParams) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't trigger when focus is on input/textarea/select
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        onShiftMonth?.(-1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        onShiftMonth?.(1);
      } else if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        onSearch?.();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onShiftMonth, onSearch, timeRange]);
}
