import { z } from 'zod';
import { registerTool } from '../core/toolRegistry.js';
import { textResponse, safeJsonStringify } from '../core/utils.js';
import { getAuthenticatedGoogleService } from '../auth/googleAuth.js';
import { CHAT_READONLY_SCOPE, CHAT_WRITE_SCOPE, CHAT_SPACES_SCOPE } from '../auth/scopes.js';

export function registerChatTools(server: any) {
  registerTool(server, {
    name: 'list_spaces',
    description: 'List Google Chat spaces.',
    inputSchema: z.object({ user_google_email: z.string() }),
    handler: async (input, context) => {
      const { service } = await getAuthenticatedGoogleService<any>({
        serviceName: 'chat',
        version: 'v1',
        userGoogleEmail: input.user_google_email,
        requiredScopes: [CHAT_SPACES_SCOPE],
        sessionId: context?.sessionId,
      });
      const response = await service.spaces.list();
      return textResponse(safeJsonStringify(response.data.spaces ?? []));
    },
  });

  registerTool(server, {
    name: 'get_messages',
    description: 'List messages in a Chat space.',
    inputSchema: z.object({ user_google_email: z.string(), space: z.string(), page_size: z.number().int().min(1).max(100).optional() }),
    handler: async (input, context) => {
      const { service } = await getAuthenticatedGoogleService<any>({
        serviceName: 'chat',
        version: 'v1',
        userGoogleEmail: input.user_google_email,
        requiredScopes: [CHAT_READONLY_SCOPE],
        sessionId: context?.sessionId,
      });
      const response = await service.spaces.messages.list({ parent: input.space, pageSize: input.page_size ?? 20 });
      return textResponse(safeJsonStringify(response.data.messages ?? []));
    },
  });

  registerTool(server, {
    name: 'send_message',
    description: 'Send a message to a Chat space.',
    inputSchema: z.object({ user_google_email: z.string(), space: z.string(), text: z.string() }),
    handler: async (input, context) => {
      const { service } = await getAuthenticatedGoogleService<any>({
        serviceName: 'chat',
        version: 'v1',
        userGoogleEmail: input.user_google_email,
        requiredScopes: [CHAT_WRITE_SCOPE],
        sessionId: context?.sessionId,
      });
      const response = await service.spaces.messages.create({ parent: input.space, requestBody: { text: input.text } });
      return textResponse(`Message sent: ${response.data.name ?? 'ok'}`);
    },
  });

  registerTool(server, {
    name: 'search_messages',
    description: 'Search messages across Chat spaces.',
    inputSchema: z.object({ user_google_email: z.string(), query: z.string() }),
    handler: async (input, context) => {
      const { service } = await getAuthenticatedGoogleService<any>({
        serviceName: 'chat',
        version: 'v1',
        userGoogleEmail: input.user_google_email,
        requiredScopes: [CHAT_READONLY_SCOPE],
        sessionId: context?.sessionId,
      });
      const response = await service.spaces.messages.search({ query: input.query });
      return textResponse(safeJsonStringify(response.data.messages ?? []));
    },
  });
}
