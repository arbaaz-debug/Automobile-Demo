/**
 * Thin fetch wrapper for the IOsense connector API.
 *
 * Uses fetch rather than axios so the same client works in a Server Component,
 * a Route Handler and the browser without bundling two HTTP stacks.
 */

import { IOSENSE_CONFIG } from "./config";
import type { IosenseError } from "./types";

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  /** Bearer token. When omitted, the stored token is used (browser only). */
  token?: string | null;
  organisation?: string;
  signal?: AbortSignal;
}

function buildHeaders(opts: RequestOptions): HeadersInit {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "ngsw-bypass": "true",
    organisation: opts.organisation ?? IOSENSE_CONFIG.organisation,
  };

  if (opts.token) {
    headers.Authorization = opts.token.startsWith("Bearer ")
      ? opts.token
      : `Bearer ${opts.token}`;
  }

  return headers;
}

function makeError(message: string, status?: number, endpoint?: string): IosenseError {
  const err = new Error(message) as IosenseError;
  err.name = "IosenseError";
  err.status = status;
  err.endpoint = endpoint;
  return err;
}

/**
 * Performs a request against the IOsense connector.
 * Throws an IosenseError on non-2xx responses, timeouts and transport failures —
 * callers are expected to try/catch and surface a degraded state rather than
 * crash the page.
 */
export async function iosenseRequest<T>(
  endpoint: string,
  options: RequestOptions = {},
): Promise<T> {
  const url = `${IOSENSE_CONFIG.baseUrl}${endpoint}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), IOSENSE_CONFIG.timeoutMs);

  // Allow an external signal to also cancel the request.
  if (options.signal) {
    if (options.signal.aborted) controller.abort();
    else options.signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  try {
    const response = await fetch(url, {
      method: options.method ?? "GET",
      headers: buildHeaders(options),
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      let detail = response.statusText;
      try {
        const text = await response.text();
        if (text) detail = text.slice(0, 400);
      } catch {
        // Body already consumed or unreadable — status text is enough.
      }
      throw makeError(
        `IOsense ${response.status} on ${endpoint}: ${detail}`,
        response.status,
        endpoint,
      );
    }

    const text = await response.text();
    if (!text) return {} as T;
    return JSON.parse(text) as T;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw makeError(`IOsense request to ${endpoint} timed out`, 408, endpoint);
    }
    if ((error as IosenseError).name === "IosenseError") throw error;
    throw makeError(
      `IOsense request to ${endpoint} failed: ${(error as Error).message}`,
      undefined,
      endpoint,
    );
  } finally {
    clearTimeout(timeout);
  }
}
