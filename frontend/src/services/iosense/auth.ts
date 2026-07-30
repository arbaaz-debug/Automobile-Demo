/**
 * IOsense authentication.
 *
 * Three entry paths, tried in the order a real deployment would use them:
 *   1. SSO token in the URL  (?token=...)  — the IOsense portal hand-off
 *   2. Username / password   — credentials supplied via .env, never hardcoded
 *   3. Direct bearer token   — for local development against a known JWT
 *
 * The resulting JWT is kept in localStorage with an explicit expiry, so a stale
 * token drops cleanly back to the viewer session and the press-shop model
 * rather than producing a wall of 401s.
 */

import { iosenseRequest } from "./apiClient";
import { ENDPOINTS, IOSENSE_CONFIG, STORAGE_KEYS } from "./config";
import type { LoginResponse, SsoTokenResponse } from "./types";

const DEFAULT_EXPIRY_HOURS = 12;

/**
 * Sentinel token for the local viewer session (no IOsense tenant).
 * Non-empty so the session survives a full page load, but recognisable so the
 * data provider never tries to authenticate a live request with it.
 */
export const VIEWER_TOKEN = "local-viewer";

/** True when the session is the local viewer rather than a real IOsense login. */
export function isViewerSession(session: Session | null): boolean {
  return session?.token === VIEWER_TOKEN;
}

export interface Session {
  token: string;
  organisation: string;
  userId: string;
  displayName: string;
}

// ---------------------------------------------------------------------------
// Login paths
// ---------------------------------------------------------------------------

/**
 * Exchanges a one-time SSO token from the IOsense portal for a Bearer JWT.
 * SSO tokens are single-use and expire 60 seconds after issue.
 */
export async function validateSsoToken(ssoToken: string): Promise<Session> {
  const data = await iosenseRequest<SsoTokenResponse>(ENDPOINTS.validateSsoToken(ssoToken), {
    method: "GET",
  });

  if (!data.success || !data.token) {
    throw new Error(data.errors?.join(", ") || "SSO token validation failed");
  }

  return {
    token: data.token,
    organisation: data.organisation ?? IOSENSE_CONFIG.organisation,
    userId: data.userId,
    displayName: data.userId,
  };
}

/** Username / password login against the connector. */
export async function loginWithPassword(
  username: string,
  password: string,
): Promise<Session> {
  const data = await iosenseRequest<LoginResponse>(ENDPOINTS.login(), {
    method: "POST",
    body: { username, email: username, password },
  });

  const token = data.authorization ?? data.token;
  if (!token) {
    const message =
      typeof data.error === "string" ? data.error : data.error?.message;
    throw new Error(message || "Login failed — check your IOsense credentials");
  }

  return {
    token,
    organisation: data.organisation ?? IOSENSE_CONFIG.organisation,
    userId: data.user?._id ?? username,
    displayName: data.user?.name ?? data.user?.email ?? username,
  };
}

/** Accepts a JWT pasted directly — used for development and diagnostics. */
export function sessionFromBearer(bearer: string): Session {
  const token = bearer.trim();
  if (!token) throw new Error("Token is empty");
  return {
    token: token.startsWith("Bearer ") ? token : `Bearer ${token}`,
    organisation: IOSENSE_CONFIG.organisation,
    userId: "direct-token",
    displayName: "Direct token",
  };
}

// ---------------------------------------------------------------------------
// Session storage
// ---------------------------------------------------------------------------

export function storeSession(session: Session, expiryHours = DEFAULT_EXPIRY_HOURS): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEYS.token, session.token);
  localStorage.setItem(STORAGE_KEYS.organisation, session.organisation);
  localStorage.setItem(STORAGE_KEYS.userId, session.userId);
  localStorage.setItem(STORAGE_KEYS.displayName, session.displayName);
  localStorage.setItem(
    STORAGE_KEYS.expiry,
    String(Date.now() + expiryHours * 3_600_000),
  );
}

export function getSession(): Session | null {
  if (typeof window === "undefined") return null;

  const expiry = localStorage.getItem(STORAGE_KEYS.expiry);
  if (expiry && Date.now() > Number(expiry)) {
    clearSession();
    return null;
  }

  const token = localStorage.getItem(STORAGE_KEYS.token);
  if (!token) return null;

  return {
    token,
    organisation: localStorage.getItem(STORAGE_KEYS.organisation) ?? IOSENSE_CONFIG.organisation,
    userId: localStorage.getItem(STORAGE_KEYS.userId) ?? "",
    displayName: localStorage.getItem(STORAGE_KEYS.displayName) ?? "Operator",
  };
}

export function clearSession(): void {
  if (typeof window === "undefined") return;
  for (const key of Object.values(STORAGE_KEYS)) localStorage.removeItem(key);
}

export function getAuthToken(): string | null {
  return getSession()?.token ?? null;
}
