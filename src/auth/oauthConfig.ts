import { WORKSPACE_MCP_BASE_URI, WORKSPACE_MCP_PORT } from '../core/config.js';

export class OAuthConfig {
  readonly baseUri: string;
  readonly port: number;
  readonly baseUrl: string;
  readonly externalUrl?: string;
  readonly clientId?: string;
  readonly clientSecret?: string;
  readonly oauth21Enabled: boolean;
  readonly statelessMode: boolean;
  readonly redirectUri: string;

  private transportMode = 'stdio';

  constructor() {
    this.baseUri = WORKSPACE_MCP_BASE_URI;
    this.port = WORKSPACE_MCP_PORT;
    this.baseUrl = `${this.baseUri}:${this.port}`;
    this.externalUrl = process.env.WORKSPACE_EXTERNAL_URL || undefined;
    this.clientId = process.env.GOOGLE_OAUTH_CLIENT_ID || undefined;
    this.clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET || undefined;
    this.oauth21Enabled = (process.env.MCP_ENABLE_OAUTH21 || 'false').toLowerCase() === 'true';
    this.statelessMode = (process.env.WORKSPACE_MCP_STATELESS_MODE || 'false').toLowerCase() === 'true';
    this.redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI || `${this.baseUrl}/oauth2callback`;
  }

  getOauthBaseUrl(): string {
    return this.externalUrl || this.baseUrl;
  }

  isConfigured(): boolean {
    return Boolean(this.clientId && this.clientSecret);
  }

  setTransportMode(mode: string) {
    this.transportMode = mode;
  }

  getTransportMode(): string {
    return this.transportMode;
  }
}

let config: OAuthConfig | null = null;

export function getOAuthConfig(): OAuthConfig {
  if (!config) {
    config = new OAuthConfig();
  }
  return config;
}

export function reloadOAuthConfig(): OAuthConfig {
  config = new OAuthConfig();
  return config;
}
