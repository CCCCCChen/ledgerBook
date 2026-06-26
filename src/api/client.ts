// src/api/client.ts — API 客户端
// 自动检测运行环境：Electron 下通过 preload 获取后端地址，浏览器下使用相对路径

let _baseUrl: string | null = null;
let _initPromise: Promise<string> | null = null;

/**
 * 获取 API 基础地址
 * Electron 环境：通过 IPC 从主进程获取后端端口
 * 浏览器环境：使用相对路径 /api（需配置代理或同域部署）
 */
export async function getApiBaseUrl(): Promise<string> {
  if (_baseUrl) return _baseUrl;

  if (!_initPromise) {
    _initPromise = (async () => {
      // 检测 Electron 环境
      const electronAPI = (window as unknown as Record<string, unknown>).electronAPI as
        | { getApiBaseUrl?: () => Promise<string> }
        | undefined;

      if (electronAPI?.getApiBaseUrl) {
        try {
          _baseUrl = await electronAPI.getApiBaseUrl();
          return _baseUrl!;
        } catch {
          // Electron IPC 失败，降级到相对路径
        }
      }

      // 浏览器 / 开发模式：使用相对路径
      _baseUrl = '';
      return _baseUrl;
    })();
  }

  return _initPromise;
}

/**
 * 通用 fetch 封装
 */
export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const base = await getApiBaseUrl();
  const url = `${base}${path}`;

  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || body.message || `请求失败 (${res.status})`);
  }

  return res.json();
}

/**
 * 便捷方法
 */
export const api = {
  get: <T>(path: string) => apiFetch<T>(path),

  post: <T>(path: string, data?: unknown) =>
    apiFetch<T>(path, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    }),

  put: <T>(path: string, data?: unknown) =>
    apiFetch<T>(path, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    }),

  delete: <T>(path: string) =>
    apiFetch<T>(path, { method: 'DELETE' }),
};
