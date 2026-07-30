"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import {
  getSession,
  storeSession,
  validateSsoToken,
  VIEWER_TOKEN,
  type Session,
} from "@/services/iosense/auth";
import { isIosenseConfigured } from "@/services/iosense/config";

interface AuthState {
  session: Session | null;
  /** False until the client has resolved which session applies. */
  ready: boolean;
  /** True when the tenant is configured for live IOsense data. */
  iosenseConfigured: boolean;
}

const AuthContext = createContext<AuthState | null>(null);

/**
 * Local viewer session.
 *
 * The portal has no sign-in screen — it opens straight onto the shop floor.
 * When no IOsense session has been handed over there is nothing to
 * authenticate, so this session stands in and the data provider serves the
 * press-shop model.
 */
const VIEWER_SESSION: Session = {
  token: VIEWER_TOKEN,
  organisation: "local",
  userId: "viewer",
  displayName: "Press Shop Viewer",
};

/**
 * Resolves the IOsense session, without gating the UI behind a login form.
 *
 * The only interactive path into a real tenant is the IOsense portal's SSO
 * hand-off: the portal appends `?token=` to the URL, which is exchanged here
 * for a Bearer JWT. Everything else falls through to the viewer session.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      const params = new URLSearchParams(window.location.search);
      const ssoToken = params.get("token");

      if (ssoToken) {
        try {
          const s = await validateSsoToken(ssoToken);
          if (cancelled) return;
          storeSession(s);
          setSession(s);
          // SSO tokens are single-use — strip it so a refresh does not retry.
          params.delete("token");
          const qs = params.toString();
          router.replace(window.location.pathname + (qs ? `?${qs}` : ""));
          setReady(true);
          return;
        } catch (error) {
          // A failed hand-off degrades to the viewer session rather than
          // stranding the user on an error screen with nowhere to go.
          console.error("IOsense SSO hand-off failed:", error);
        }
      }

      if (cancelled) return;

      const stored = getSession();
      if (stored) {
        setSession(stored);
      } else {
        storeSession(VIEWER_SESSION);
        setSession(VIEWER_SESSION);
      }
      setReady(true);
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const value = useMemo<AuthState>(
    () => ({ session, ready, iosenseConfigured: isIosenseConfigured() }),
    [session, ready],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
