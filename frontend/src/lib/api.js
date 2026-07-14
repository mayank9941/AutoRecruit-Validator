const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

class ApiError extends Error {
  constructor(message, status, detail) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

/**
 * Thin fetch wrapper for the FastAPI backend.
 * - Always sends cookies (credentials: "include") -- auth is a signed
 *   session cookie, not a bearer token, so this is required on every call.
 * - Throws ApiError with the backend's own `detail` message on failure,
 *   so callers can show a real error instead of a generic one.
 */
async function request(path, { method = "GET", body, isFormData = false } = {}) {
  const headers = {};
  if (body && !isFormData) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    credentials: "include",
    body: body ? (isFormData ? body : JSON.stringify(body)) : undefined,
  });

  if (!response.ok) {
    let detail = response.statusText;
    try {
      const errorBody = await response.json();
      detail = errorBody.detail || detail;
    } catch {
      // Response wasn't JSON -- keep the plain status text.
    }
    throw new ApiError(detail, response.status, detail);
  }

  if (response.status === 204) return null;

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }
  return response;
}

export const api = {
  get: (path) => request(path),
  post: (path, body, opts = {}) => request(path, { method: "POST", body, ...opts }),
  patch: (path, body) => request(path, { method: "PATCH", body }),
  delete: (path) => request(path, { method: "DELETE" }),
};

export { ApiError, BASE_URL };
