import { z } from 'zod';
import { registerTool } from '../core/toolRegistry.js';
import { textResponse, safeJsonStringify } from '../core/utils.js';
import { getAuthenticatedGoogleService } from '../auth/googleAuth.js';
import { CUSTOM_SEARCH_SCOPE } from '../auth/scopes.js';

function getSearchConfig() {
  const apiKey = process.env.GOOGLE_PSE_API_KEY;
  const engineId = process.env.GOOGLE_PSE_ENGINE_ID;
  if (!apiKey || !engineId) {
    throw new Error('GOOGLE_PSE_API_KEY and GOOGLE_PSE_ENGINE_ID must be set.');
  }
  return { apiKey, engineId };
}

export function registerSearchTools(server: any) {
  registerTool(server, {
    name: 'search_custom',
    description: 'Run a Google Custom Search.',
    inputSchema: z.object({
      user_google_email: z.string(),
      q: z.string(),
      num: z.number().int().min(1).max(10).optional(),
      start: z.number().int().min(1).optional(),
      safe: z.enum(['active', 'moderate', 'off']).optional(),
    }),
    handler: async (input, context) => {
      const { service } = await getAuthenticatedGoogleService<any>({
        serviceName: 'customsearch',
        version: 'v1',
        userGoogleEmail: input.user_google_email,
        requiredScopes: [CUSTOM_SEARCH_SCOPE],
        sessionId: context?.sessionId,
      });
      const { apiKey, engineId } = getSearchConfig();
      const response = await service.cse.list({
        q: input.q,
        num: input.num ?? 10,
        start: input.start ?? 1,
        safe: input.safe ?? 'off',
        key: apiKey,
        cx: engineId,
      });
      return textResponse(safeJsonStringify(response.data.items ?? []));
    },
  });

  registerTool(server, {
    name: 'search_custom_siterestrict',
    description: 'Run a site-restricted custom search.',
    inputSchema: z.object({
      user_google_email: z.string(),
      q: z.string(),
      sites: z.array(z.string()).min(1),
      num: z.number().int().min(1).max(10).optional(),
      start: z.number().int().min(1).optional(),
    }),
    handler: async (input, context) => {
      const { service } = await getAuthenticatedGoogleService<any>({
        serviceName: 'customsearch',
        version: 'v1',
        userGoogleEmail: input.user_google_email,
        requiredScopes: [CUSTOM_SEARCH_SCOPE],
        sessionId: context?.sessionId,
      });
      const { apiKey, engineId } = getSearchConfig();
      const query = `${input.q} (${input.sites.map((site: string) => `site:${site}`).join(' OR ')})`;
      const response = await service.cse.list({
        q: query,
        num: input.num ?? 10,
        start: input.start ?? 1,
        key: apiKey,
        cx: engineId,
      });
      return textResponse(safeJsonStringify(response.data.items ?? []));
    },
  });

  registerTool(server, {
    name: 'get_search_engine_info',
    description: 'Get Custom Search Engine metadata.',
    inputSchema: z.object({ user_google_email: z.string() }),
    handler: async (input, context) => {
      const { service } = await getAuthenticatedGoogleService<any>({
        serviceName: 'customsearch',
        version: 'v1',
        userGoogleEmail: input.user_google_email,
        requiredScopes: [CUSTOM_SEARCH_SCOPE],
        sessionId: context?.sessionId,
      });
      const { apiKey, engineId } = getSearchConfig();
      const response = await service.cse.list({ q: 'test', num: 1, key: apiKey, cx: engineId });
      return textResponse(safeJsonStringify(response.data.context ?? {}));
    },
  });
}
