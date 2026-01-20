import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { getOAuthConfig } from './oauthConfig.js';
import { getCurrentScopes } from './scopes.js';
import { getCredentialStore, StoredCredentials } from './credentialStore.js';
import { getSessionStore } from './sessionStore.js';
import { generateState } from '../core/utils.js';
import { logger } from '../core/logger.js';
import { existsSync } from 'node:fs';

export class GoogleAuthenticationError extends Error {}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_CLIENT_SECRET_PATH = resolveClientSecretPath();

function resolveClientSecretPath(): string {
  const cwdClientSecretPath = path.resolve(process.cwd(), 'client_secret.json');
  const moduleClientSecretPath = path.resolve(__dirname, '..', '..', 'client_secret.json');
  return existsSync(cwdClientSecretPath) ? cwdClientSecretPath : moduleClientSecretPath;
}

async function loadClientSecrets(): Promise<{ clientId: string; clientSecret: string } | null> {
  const envClientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const envClientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (envClientId && envClientSecret) {
    return { clientId: envClientId, clientSecret: envClientSecret };
  }

  const secretPath =
    process.env.GOOGLE_CLIENT_SECRET_PATH ||
    process.env.GOOGLE_CLIENT_SECRETS ||
    DEFAULT_CLIENT_SECRET_PATH;
  try {
    const raw = await fs.readFile(secretPath, 'utf8');
    const parsed = JSON.parse(raw) as { installed?: { client_id: string; client_secret: string }; web?: { client_id: string; client_secret: string } };
    const config = parsed.web ?? parsed.installed;
    if (!config) return null;
    return { clientId: config.client_id, clientSecret: config.client_secret };
  } catch (error) {
    return null;
  }
}

async function buildOAuthClient(redirectUri: string, credentials?: StoredCredentials): Promise<OAuth2Client> {
  const config = await loadClientSecrets();
  if (!config) {
    throw new GoogleAuthenticationError(
      `OAuth client credentials not found. Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET or provide client_secret.json at ${DEFAULT_CLIENT_SECRET_PATH}.`,
    );
  }
  const client = new OAuth2Client({ clientId: config.clientId, clientSecret: config.clientSecret, redirectUri });
  if (credentials) {
    client.setCredentials(credentials);
  }
  return client;
}

export async function startAuthFlow(userGoogleEmail: string | undefined, serviceName: string, redirectUri: string, sessionId?: string): Promise<string> {
  const scopes = getCurrentScopes();
  const state = generateState();
  const store = getSessionStore();
  store.storeOAuthState(state, sessionId);

  const oauthClient = await buildOAuthClient(redirectUri);
  const authUrl = oauthClient.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    state,
    prompt: 'consent',
  });

  const displayName = userGoogleEmail ? `${serviceName} for '${userGoogleEmail}'` : serviceName;
  return [
    `**ACTION REQUIRED: Google Authentication Needed for ${displayName}**`,
    `Authorization URL: ${authUrl}`,
    `Markdown for hyperlink: [Click here to authorize ${serviceName}](${authUrl})`,
    'After completing the flow, retry the original command.',
  ].join('\n');
}

export async function handleAuthCallback(
  authorizationResponseUrl: string,
  redirectUri: string,
  sessionId?: string,
): Promise<{ userEmail: string; credentials: StoredCredentials }> {
  const url = new URL(authorizationResponseUrl);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code) {
    throw new GoogleAuthenticationError('No authorization code found in callback.');
  }
  const store = getSessionStore();
  if (!store.consumeOAuthState(state ?? undefined, sessionId)) {
    throw new GoogleAuthenticationError('Invalid OAuth state. Please restart authentication.');
  }

  const oauthClient = await buildOAuthClient(redirectUri);
  const { tokens } = await oauthClient.getToken(code);
  oauthClient.setCredentials(tokens);

  const oauth2 = google.oauth2({ version: 'v2', auth: oauthClient });
  const userInfo = await oauth2.userinfo.get();
  const userEmail = userInfo.data.email;
  if (!userEmail) {
    throw new GoogleAuthenticationError('Unable to determine authenticated user email.');
  }

  const credentials: StoredCredentials = {
    ...tokens,
    scopes: tokens.scope?.split(' '),
  };

  await getCredentialStore().storeCredential(userEmail, credentials);
  store.storeSession(userEmail, credentials, sessionId);
  logger.info(`OAuth credentials stored for ${userEmail}`);

  return { userEmail, credentials };
}

async function refreshCredentialsIfNeeded(
  oauthClient: OAuth2Client,
  userEmail: string,
  sessionId?: string,
): Promise<StoredCredentials> {
  const creds = oauthClient.credentials as StoredCredentials;
  if (creds.expiry_date && creds.expiry_date > Date.now()) {
    return creds;
  }

  if (!creds.refresh_token) {
    return creds;
  }

  const response = await oauthClient.refreshAccessToken();
  const updated = response.credentials as StoredCredentials;
  oauthClient.setCredentials(updated);
  await getCredentialStore().storeCredential(userEmail, updated);
  getSessionStore().storeSession(userEmail, updated, sessionId);
  return updated;
}

export async function getCredentials(
  userGoogleEmail: string,
  sessionId?: string,
): Promise<StoredCredentials | null> {
  const store = getSessionStore();
  const sessionCreds = store.getCredentialsBySession(sessionId);
  if (sessionCreds) {
    return sessionCreds;
  }
  const fileCreds = await getCredentialStore().getCredential(userGoogleEmail);
  if (fileCreds && sessionId) {
    store.storeSession(userGoogleEmail, fileCreds, sessionId);
  }
  return fileCreds;
}

function scopesSatisfied(requiredScopes: string[], credentials: StoredCredentials): boolean {
  const scopes = new Set(
    credentials.scopes ??
      (credentials.scope ? credentials.scope.split(' ') : []),
  );
  return requiredScopes.every((scope) => scopes.has(scope));
}

export async function getAuthenticatedGoogleService<TService>(options: {
  serviceName: string;
  version: string;
  userGoogleEmail: string;
  requiredScopes: string[];
  sessionId?: string;
}): Promise<{ service: TService; userEmail: string; authClient: OAuth2Client }> {
  const { serviceName, version, userGoogleEmail, requiredScopes, sessionId } = options;
  if (!userGoogleEmail || !userGoogleEmail.includes('@')) {
    throw new GoogleAuthenticationError('user_google_email is required for Google authentication.');
  }

  const config = getOAuthConfig();
  const credentials = await getCredentials(userGoogleEmail, sessionId);

  if (!credentials || !scopesSatisfied(requiredScopes, credentials)) {
    const authMessage = await startAuthFlow(userGoogleEmail, `Google ${serviceName}`, config.redirectUri, sessionId);
    throw new GoogleAuthenticationError(authMessage);
  }

  const oauthClient = await buildOAuthClient(config.redirectUri, credentials);
  await refreshCredentialsIfNeeded(oauthClient, userGoogleEmail, sessionId);

  const serviceFactory = (google as any)[serviceName];
  const service = serviceFactory({
    version,
    auth: oauthClient,
  }) as TService;

  return { service, userEmail: userGoogleEmail, authClient: oauthClient };
}
