import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { Credentials } from 'google-auth-library';
import { logger } from '../core/logger.js';

export type StoredCredentials = Credentials & { scopes?: string[] };

export function getDefaultCredentialsDir(): string {
  if (process.env.GOOGLE_MCP_CREDENTIALS_DIR) {
    return process.env.GOOGLE_MCP_CREDENTIALS_DIR;
  }
  const home = os.homedir();
  if (home) {
    return path.join(home, '.google_workspace_mcp', 'credentials');
  }
  return path.join(process.cwd(), '.credentials');
}

export class CredentialStore {
  constructor(private baseDir = getDefaultCredentialsDir()) {}

  private getUserPath(userEmail: string): string {
    return path.join(this.baseDir, `${encodeURIComponent(userEmail)}.json`);
  }

  async storeCredential(userEmail: string, credentials: StoredCredentials): Promise<void> {
    await fs.mkdir(this.baseDir, { recursive: true });
    const payload = {
      ...credentials,
      scopes: credentials.scopes ?? credentials.scope?.split(' ') ?? [],
    };
    await fs.writeFile(this.getUserPath(userEmail), JSON.stringify(payload, null, 2));
    logger.info(`Stored credentials for ${userEmail}`);
  }

  async getCredential(userEmail: string): Promise<StoredCredentials | null> {
    try {
      const raw = await fs.readFile(this.getUserPath(userEmail), 'utf8');
      return JSON.parse(raw) as StoredCredentials;
    } catch (error) {
      return null;
    }
  }

  async deleteCredential(userEmail: string): Promise<void> {
    try {
      await fs.unlink(this.getUserPath(userEmail));
    } catch (error) {
      logger.debug(`Credential delete skipped for ${userEmail}`);
    }
  }

  async listUsers(): Promise<string[]> {
    try {
      const entries = await fs.readdir(this.baseDir);
      return entries
        .filter((entry) => entry.endsWith('.json'))
        .map((entry) => decodeURIComponent(entry.replace(/\.json$/, '')));
    } catch (error) {
      return [];
    }
  }
}

let storeInstance: CredentialStore | null = null;

export function getCredentialStore(): CredentialStore {
  if (!storeInstance) {
    storeInstance = new CredentialStore();
  }
  return storeInstance;
}
