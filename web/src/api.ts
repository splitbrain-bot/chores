import { navigate } from './router.ts';

const TOKEN_KEY = 'chores.token';

/** An error response of the API. */
export class ApiError extends Error {
    /** The HTTP status. */
    readonly status: number;

    /**
     * @param status the HTTP status
     * @param message the error text of the API
     */
    constructor(status: number, message: string) {
        super(message);
        this.status = status;
    }
}

/** Returns the stored token. */
export function getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
}

/**
 * Stores the token.
 *
 * @param token the plain token
 */
export function setToken(token: string): void {
    localStorage.setItem(TOKEN_KEY, token);
}

/** Removes the token. */
export function clearToken(): void {
    localStorage.removeItem(TOKEN_KEY);
}

/**
 * Sends a request to the API with the token. A 401 response removes the token and opens the login.
 *
 * @param method the HTTP method
 * @param path the path below /api
 * @param body the JSON body
 * @returns the parsed response
 * @throws ApiError for a status other than 2xx
 */
export async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {};
    const token = getToken();
    if (token) headers.authorization = `Bearer ${token}`;
    if (body !== undefined) headers['content-type'] = 'application/json';
    const res = await fetch(`/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const json = await res.json().catch(() => ({})) as { error?: string };
    if (res.status === 401 && path !== '/auth/login') {
        clearToken();
        navigate('/login');
    }
    if (!res.ok) throw new ApiError(res.status, json.error ?? res.statusText);
    return json as T;
}
