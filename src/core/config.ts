export type TransportMode = 'stdio' | 'streamable-http';

export const WORKSPACE_MCP_PORT = Number(
  process.env.PORT ?? process.env.WORKSPACE_MCP_PORT ?? 8000,
);
export const WORKSPACE_MCP_BASE_URI =
  process.env.WORKSPACE_MCP_BASE_URI ?? 'http://localhost';
export const WORKSPACE_EXTERNAL_URL = process.env.WORKSPACE_EXTERNAL_URL ?? '';
let transportMode: TransportMode = 'stdio';

export function setTransportMode(mode: TransportMode) {
  transportMode = mode;
}

export function getTransportMode(): TransportMode {
  return transportMode;
}

export function getBaseUrl(): string {
  const base = WORKSPACE_EXTERNAL_URL || `${WORKSPACE_MCP_BASE_URI}:${WORKSPACE_MCP_PORT}`;
  return base.replace(/\/$/, '');
}
