import { StoredCredentials } from './credentialStore.js';

type SessionEntry = {
  userEmail: string;
  credentials: StoredCredentials;
  expiresAt?: number;
};

type OAuthStateEntry = {
  sessionId?: string;
  createdAt: number;
};

class SessionStore {
  private sessions = new Map<string, SessionEntry>();
  private userIndex = new Map<string, string>();
  private oauthStates = new Map<string, OAuthStateEntry>();

  storeSession(userEmail: string, credentials: StoredCredentials, sessionId?: string) {
    if (!sessionId) return;
    this.sessions.set(sessionId, { userEmail, credentials, expiresAt: credentials.expiry_date ?? undefined });
    this.userIndex.set(userEmail, sessionId);
  }

  getCredentialsBySession(sessionId?: string): StoredCredentials | null {
    if (!sessionId) return null;
    const entry = this.sessions.get(sessionId);
    if (!entry) return null;
    if (entry.expiresAt && entry.expiresAt < Date.now()) {
      return null;
    }
    return entry.credentials;
  }

  getUserBySession(sessionId?: string): string | null {
    if (!sessionId) return null;
    return this.sessions.get(sessionId)?.userEmail ?? null;
  }

  storeOAuthState(state: string, sessionId?: string) {
    this.oauthStates.set(state, { sessionId, createdAt: Date.now() });
  }

  consumeOAuthState(state?: string, sessionId?: string): boolean {
    if (!state) return false;
    const entry = this.oauthStates.get(state);
    if (!entry) return false;
    this.oauthStates.delete(state);
    if (!entry.sessionId || !sessionId) {
      return true;
    }
    return entry.sessionId === sessionId;
  }
}

let store: SessionStore | null = null;

export function getSessionStore(): SessionStore {
  if (!store) {
    store = new SessionStore();
  }
  return store;
}
