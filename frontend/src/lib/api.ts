const BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:8000';

export class ApiError extends Error {
  status: number;
  detail: string;
  constructor(message: string, status: number, detail: string) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: any;
  isFormData?: boolean;
}

/**
 * Thin fetch wrapper for the FastAPI backend.
 * - Always sends cookies (credentials: "include") -- auth is a signed
 *   session cookie, not a bearer token, so this is required on every call.
 * - Throws ApiError with the backend's own `detail` message on failure,
 *   so callers can show a real error instead of a generic one.
 * - Returns `null` for 204s, parsed JSON for JSON bodies, and the raw
 *   Response for anything else (e.g. the Excel export download).
 */
async function request(path: string, { method = 'GET', body, isFormData = false }: RequestOptions = {}) {
  const headers: Record<string, string> = {};
  if (body && !isFormData) {
    headers['Content-Type'] = 'application/json';
  }

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      credentials: 'include',
      body: body ? (isFormData ? body : JSON.stringify(body)) : undefined,
    });
  } catch {
    // fetch() itself throws (backend unreachable, network down, CORS
    // blocked) -- surface a message instead of letting this bubble as an
    // unhandled TypeError.
    throw new ApiError('Could not reach the server. Check that the backend is running and reachable.', 0, '');
  }

  if (!response.ok) {
    const detail = await extractErrorDetail(response);
    throw new ApiError(detail, response.status, detail);
  }

  if (response.status === 204) return null;

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json();
  }
  return response;
}

/**
 * FastAPI's `detail` field is a plain string for HTTPException(detail=...),
 * but for Pydantic/request validation errors (422s) it's an ARRAY of
 * {loc, msg, type} objects instead. Rendering that array directly in JSX
 * crashes the component ("Objects are not valid as a React child"), so we
 * always reduce it to a single human-readable string here.
 */
async function extractErrorDetail(response: Response): Promise<string> {
  let body: any;
  try {
    body = await response.json();
  } catch {
    return response.statusText || `Request failed (${response.status})`;
  }

  const detail = body?.detail;
  if (typeof detail === 'string') return detail;

  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => {
        if (typeof item === 'string') return item;
        const field = Array.isArray(item?.loc) ? item.loc.filter((p: any) => p !== 'body').join('.') : '';
        return field ? `${field}: ${item?.msg}` : item?.msg;
      })
      .filter(Boolean);
    if (messages.length) return messages.join('; ');
  }

  if (detail && typeof detail === 'object') {
    return JSON.stringify(detail);
  }

  return response.statusText || `Request failed (${response.status})`;
}

export const api = {
  get: (path: string) => request(path),
  post: (path: string, body?: any, opts: Partial<RequestOptions> = {}) =>
    request(path, { method: 'POST', body, ...opts }),
  patch: (path: string, body?: any) => request(path, { method: 'PATCH', body }),
  delete: (path: string) => request(path, { method: 'DELETE' }),
};

export { BASE_URL };
