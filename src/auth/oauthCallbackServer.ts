import http from 'node:http';
import { handleAuthCallback } from './googleAuth.js';
import { getOAuthConfig } from './oauthConfig.js';
import { logger } from '../core/logger.js';

let server: http.Server | null = null;

function buildHtmlMessage(title: string, body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body><h1>${title}</h1><p>${body}</p></body></html>`;
}

export async function ensureOAuthCallbackServer(): Promise<void> {
  if (server) return;
  const config = getOAuthConfig();
  const callbackPath = config.redirectUri.startsWith('http')
    ? new URL(config.redirectUri).pathname
    : config.redirectUri.startsWith('/')
      ? config.redirectUri
      : `/${config.redirectUri}`;
  server = http.createServer(async (req, res) => {
    if (!req.url) return;
    const url = new URL(req.url, `http://localhost:${config.port}`);
    if (url.pathname !== callbackPath) {
      res.writeHead(404);
      res.end();
      return;
    }
    try {
      await handleAuthCallback(url.toString(), config.redirectUri, undefined);
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(buildHtmlMessage('Authentication Complete', 'You can close this window and return to your MCP client.'));
    } catch (error) {
      logger.error('OAuth callback error', error);
      res.writeHead(500, { 'Content-Type': 'text/html' });
      res.end(buildHtmlMessage('Authentication Failed', String(error)));
    }
  });

  await new Promise<void>((resolve) => {
    server?.listen(config.port, () => resolve());
  });
  logger.info(`OAuth callback server listening on ${config.baseUrl}`);
}

export async function shutdownOAuthCallbackServer(): Promise<void> {
  if (!server) return;
  await new Promise<void>((resolve) => server?.close(() => resolve()));
  server = null;
}
