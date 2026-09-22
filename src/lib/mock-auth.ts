// Real auth client that talks to the Express backend.
//
// The backend stores users in MongoDB with bcrypt-hashed passwords and
// issues JWT tokens on login/register. We hold the token in localStorage
// and attach it as `Authorization: Bearer <token>` on every API request
// (see src/lib/db.ts's apiFetch helper, which reads getAuthToken()).

import { useQuery } from "@tanstack/react-query";

export type AccessRole = "super_admin" | "admin" | "developer" | "salesman";

export type MockUser = {
  id: string;
  email: string;
  access_role: AccessRole;
  active: boolean;
  user_metadata: { full_name: string | undefined };
};

const TOKEN_KEY = "gth-crm-token-v1";
const SESSION_KEY = "gth-crm-session-v1";

export const DEMO_EMAIL = "demo@globaltech.io";
export const DEMO_PASSWORD = "demo1234";

export const API_URL = (import.meta.env["VITE_API_URL"] ?? "http://localhost:5052/api").replace(
  /\/$/,
  "",
);

export function getAuthToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function setAuthToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore
  }
}

function readSession(): MockUser | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as MockUser) : null;
  } catch {
    return null;
  }
}

function writeSession(user: MockUser | null) {
  try {
    if (user) localStorage.setItem(SESSION_KEY, JSON.stringify(user));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
}

type AuthResult = { error: { message: string } | null };

async function apiAuthFetch(
  path: string,
  init?: RequestInit,
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const body = (await res.json().catch(() => ({}))) as {
    error?: string;
    user?: unknown;
    token?: unknown;
  };
  return { ok: res.ok, status: res.status, body };
}

export const auth = {
  async getSession() {
    const cached = readSession();
    const token = getAuthToken();
    if (cached && token) return { data: { session: { user: cached } } };

    if (token) {
      try {
        const res = await apiAuthFetch("/auth/me", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok && res.body && typeof res.body === "object" && "user" in res.body) {
          const user = (res.body as { user: MockUser }).user;
          writeSession(user);
          return { data: { session: { user } } };
        }
      } catch {
        // fall through and clear
      }
      setAuthToken(null);
      writeSession(null);
    }
    return { data: { session: null } };
  },

  async getUser() {
    const { data } = await this.getSession();
    const user = data.session?.user ?? null;
    return { data: { user }, error: user ? null : new Error("Not signed in") };
  },

  async signInWithPassword({
    email,
    password,
  }: {
    email: string;
    password: string;
  }): Promise<AuthResult> {
    const res = await apiAuthFetch("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    const body = res.body as { user?: MockUser; token?: string; error?: string };
    if (!res.ok || !body.user || !body.token) {
      return { error: { message: body.error || "Invalid email or password." } };
    }
    setAuthToken(body.token);
    writeSession(body.user);
    return { error: null };
  },

  /** Admin/Super Admin only — creates a login account for someone else. Does
   * not sign the caller out of their own session (unlike the old public
   * self-signup flow this replaces). */
  async createAccount({
    email,
    password,
    full_name,
    access_role,
  }: {
    email: string;
    password: string;
    full_name?: string | undefined;
    access_role?: "developer" | "salesman" | "admin" | undefined;
  }): Promise<AuthResult> {
    const token = getAuthToken();
    const res = await fetch(`${API_URL}/auth/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ email, password, full_name, access_role }),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      return { error: { message: body.error || "Could not create the account." } };
    }
    return { error: null };
  },

  async listAccounts(): Promise<{ data: MockUser[]; error: { message: string } | null }> {
    const token = getAuthToken();
    const res = await fetch(`${API_URL}/auth/accounts`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const body = (await res.json().catch(() => ({}))) as MockUser[] | { error?: string };
    if (!res.ok) {
      return {
        data: [],
        error: { message: (body as { error?: string }).error || "Could not load accounts." },
      };
    }
    return { data: body as MockUser[], error: null };
  },

  async updateAccount(
    id: string,
    patch: { access_role?: "developer" | "salesman" | "admin"; active?: boolean },
  ): Promise<AuthResult> {
    const token = getAuthToken();
    const res = await fetch(`${API_URL}/auth/accounts/${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(patch),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      return { error: { message: body.error || "Could not update the account." } };
    }
    return { error: null };
  },

  async signOut() {
    const token = getAuthToken();
    try {
      if (token) {
        await fetch(`${API_URL}/auth/logout`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => {});
      }
    } finally {
      setAuthToken(null);
      writeSession(null);
    }
  },
};

/** Reactive access to the signed-in user (including access_role) for any
 * component — e.g. `const { data: me } = useCurrentUser(); if (me?.access_role === "developer") ...` */
export function useCurrentUser() {
  return useQuery({
    queryKey: ["auth", "me"],
    queryFn: async () => {
      const { data } = await auth.getUser();
      return data.user;
    },
    staleTime: 5 * 60 * 1000,
  });
}
