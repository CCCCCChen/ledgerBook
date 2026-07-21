import { useState, useEffect, useCallback, useRef, type DependencyList } from 'react';

export interface FinancialDataState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  retryCount: number;
}

export interface UseFinancialDataOptions {
  /** 最大重试次数，默认 2 */
  maxRetries?: number;
  /** 重试间隔（毫秒），默认 1000 */
  retryDelay?: number;
}

export interface UseFinancialDataReturn<T> extends FinancialDataState<T> {
  /** 手动触发重新加载 */
  refresh: () => Promise<void>;
  /** 手动重试（不增加计数） */
  retry: () => Promise<void>;
}

/**
 * 封装数据加载状态（loading / error / data），
 * 支持自动重试、依赖数组触发重新加载、手动刷新。
 *
 * 可供 TransactionPage / BudgetsPage / DashboardPage 渐进采用。
 */
export function useFinancialData<T>(
  fetcher: () => Promise<T>,
  deps: DependencyList = [],
  options: UseFinancialDataOptions = {},
): UseFinancialDataReturn<T> {
  const { maxRetries = 2, retryDelay = 1000 } = options;

  const [state, setState] = useState<FinancialDataState<T>>({
    data: null,
    loading: true,
    error: null,
    retryCount: 0,
  });

  const mountedRef = useRef(true);
  const depsKey = useRef(JSON.stringify(deps));

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const doFetch = useCallback(
    async (isRetry = false) => {
      if (!mountedRef.current) return;

      setState((prev) => ({
        ...prev,
        loading: true,
        error: null,
        retryCount: isRetry ? prev.retryCount + 1 : prev.retryCount,
      }));

      const attemptFetch = async (attempt: number): Promise<void> => {
        try {
          const data = await fetcher();
          if (!mountedRef.current) return;
          setState({ data, loading: false, error: null, retryCount: 0 });
        } catch (err) {
          if (!mountedRef.current) return;
          const errorMsg = err instanceof Error ? err.message : String(err);

          if (attempt < maxRetries) {
            await new Promise((resolve) => setTimeout(resolve, retryDelay));
            return attemptFetch(attempt + 1);
          }

          setState((prev) => ({
            ...prev,
            loading: false,
            error: errorMsg || '数据加载失败',
          }));
        }
      };

      await attemptFetch(0);
    },
    [fetcher, maxRetries, retryDelay],
  );

  // 依赖变化时重新加载
  useEffect(() => {
    const currentKey = JSON.stringify(deps);
    if (currentKey !== depsKey.current) {
      depsKey.current = currentKey;
    }
    doFetch(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depsKey.current]);

  const refresh = useCallback(async () => {
    depsKey.current = JSON.stringify(deps);
    await doFetch(false);
  }, [doFetch, deps]);

  const retry = useCallback(async () => {
    await doFetch(true);
  }, [doFetch]);

  return {
    ...state,
    refresh,
    retry,
  };
}
