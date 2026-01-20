import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getOAuthConfig } from './auth/oauthConfig.js';
import { startAuthFlow } from './auth/googleAuth.js';
import { setEnabledTools } from './auth/scopes.js';
import { setTransportMode, TransportMode } from './core/config.js';
import { logger } from './core/logger.js';
import { registerTool, setEnabledToolNames } from './core/toolRegistry.js';
import { resolveToolsFromTier, TierLevel } from './core/toolTierLoader.js';
import { textResponse } from './core/utils.js';
import { registerCalendarTools } from './gcalendar/index.js';
import { registerChatTools } from './gchat/index.js';
import { registerDocsTools } from './gdocs/index.js';
import { registerDriveTools } from './gdrive/index.js';
import { registerFormsTools } from './gforms/index.js';
import { registerGmailTools } from './gmail/index.js';
import { registerSearchTools } from './gsearch/index.js';
import { registerSheetsTools } from './gsheets/index.js';
import { registerSlidesTools } from './gslides/index.js';
import { registerTasksTools } from './gtasks/index.js';

export type ServerOptions = {
  tools?: string[];
  toolTier?: TierLevel;
  transport: TransportMode;
};

export async function createServer(options: ServerOptions): Promise<McpServer> {
  const server = new McpServer({ name: 'google_workspace', version: 'dev' });
  setTransportMode(options.transport);

  let enabledToolNames: Set<string> | null = null;
  let serviceNames: string[] = [
    'gmail',
    'drive',
    'calendar',
    'docs',
    'sheets',
    'slides',
    'forms',
    'tasks',
    'chat',
    'search',
  ];

  if (options.toolTier) {
    const { tools, serviceNames: resolvedServices } = await resolveToolsFromTier(options.toolTier, options.tools);
    enabledToolNames = new Set(tools);
    serviceNames = resolvedServices;
  } else if (options.tools?.length) {
    serviceNames = options.tools;
  }

  setEnabledToolNames(enabledToolNames);
  setEnabledTools(serviceNames);

  registerTool(server, {
    name: 'start_google_auth',
    description: 'Start Google OAuth authentication flow.',
    inputSchema: z.object({
      service_name: z.string(),
      user_google_email: z.string().optional(),
    }),
    handler: async (input, context) => {
      const config = getOAuthConfig();
      const message = await startAuthFlow(input.user_google_email, input.service_name, config.redirectUri, context?.sessionId);
      return textResponse(message);
    },
  });

  const registry: Record<string, (server: McpServer) => void> = {
    gmail: registerGmailTools,
    drive: registerDriveTools,
    calendar: registerCalendarTools,
    docs: registerDocsTools,
    sheets: registerSheetsTools,
    slides: registerSlidesTools,
    forms: registerFormsTools,
    tasks: registerTasksTools,
    chat: registerChatTools,
    search: registerSearchTools,
  };

  for (const serviceName of serviceNames) {
    const register = registry[serviceName];
    if (!register) continue;
    logger.info(`Registering ${serviceName} tools`);
    register(server);
  }

  return server;
}
