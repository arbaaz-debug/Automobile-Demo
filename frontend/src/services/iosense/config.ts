/**
 * IOsense platform configuration.
 *
 * Everything here is driven by environment variables — no credentials or
 * endpoints are hardcoded. See `.env.example` for the full list.
 */

export const IOSENSE_CONFIG = {
  baseUrl:
    process.env.NEXT_PUBLIC_IOSENSE_API_BASE ?? "https://connector.iosense.io/api",
  organisation: process.env.NEXT_PUBLIC_IOSENSE_ORGANISATION ?? "https://iosense.io",
  timezone: process.env.NEXT_PUBLIC_TIMEZONE ?? "Asia/Kolkata",
  timeoutMs: Number(process.env.NEXT_PUBLIC_IOSENSE_TIMEOUT_MS ?? 30000),
  /** Poll interval for live tiles, ms. */
  refreshMs: Number(process.env.NEXT_PUBLIC_REFRESH_MS ?? 30000),
} as const;

export const STORAGE_KEYS = {
  token: "iosense.authToken",
  organisation: "iosense.organisation",
  userId: "iosense.userId",
  expiry: "iosense.authExpiry",
  displayName: "iosense.displayName",
} as const;

/**
 * True when the app has been given enough configuration to talk to a real
 * IOsense tenant. When false the portal transparently falls back to the
 * press-shop simulator and labels every page accordingly.
 */
export function isIosenseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_IOSENSE_API_BASE &&
      process.env.NEXT_PUBLIC_IOSENSE_DEVICE_MAP,
  );
}

/** Endpoints, kept in one place so the functionID tracking in iosense.md stays honest. */
export const ENDPOINTS = {
  /** GET  /retrieve-sso-token/{token} */
  validateSsoToken: (token: string) => `/retrieve-sso-token/${token}`,
  /** POST /account/login */
  login: () => `/account/login`,
  /** PUT  /account/devices/{skip}/{limit} */
  findUserDevices: (skip: number, limit: number) => `/account/devices/${skip}/${limit}`,
  /** GET  /metaData/allDevices/{deviceId} */
  deviceMetadata: (deviceId: string) => `/metaData/allDevices/${deviceId}`,
  /** PUT  /account/ioLensWidget/getWidgetData */
  widgetData: () => `/account/ioLensWidget/getWidgetData`,
  /** PUT  /account/getLastDPsofDevicesAndSensorProcessed */
  lastDataPoints: () => `/account/getLastDPsofDevicesAndSensorProcessed`,
  /** PUT  /account/bruce/userInsight/fetch/paginated */
  userInsights: () => `/account/bruce/userInsight/fetch/paginated`,
  /** PUT  /account/eventsData/fetch */
  events: () => `/account/eventsData/fetch`,
} as const;
