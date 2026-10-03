import type { ApiErrorBody } from '@/types/api';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// empty in dev since Vite proxies /api. Set VITE_API_URL for a prod build on another origin
const API_BASE_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

export const apiUrl = (path: string) => `${API_BASE_URL}${path}`;

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

export async function apiRequest<T>(path: string, { method = 'GET', body, headers, signal }: RequestOptions = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(apiUrl(path), {
      method,
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the server. Is the backend running?');
  }

  if (response.status === 204) return undefined as T;
  const payload = (await response.json().catch(() => null)) as (T & Partial<ApiErrorBody>) | null;
  if (!response.ok) {
    throw new ApiError(
      response.status,
      payload?.error?.code ?? 'HTTP_ERROR',
      payload?.error?.message ?? `Request failed with status ${response.status}`,
      payload?.error?.details,
    );
  }
  return payload as T;
}

export const errorMessage = (err: unknown, fallback = 'Something went wrong') =>
  err instanceof Error && err.message ? err.message : fallback;
