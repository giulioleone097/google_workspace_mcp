import { z } from 'zod';
import { registerTool } from '../core/toolRegistry.js';
import { textResponse, safeJsonStringify } from '../core/utils.js';
import { getAuthenticatedGoogleService } from '../auth/googleAuth.js';
import { SLIDES_READONLY_SCOPE, SLIDES_SCOPE } from '../auth/scopes.js';
import { registerCommentTools } from '../core/comments.js';

export function registerSlidesTools(server: any) {
  registerTool(server, {
    name: 'create_presentation',
    description: 'Create a Google Slides presentation.',
    inputSchema: z.object({ user_google_email: z.string(), title: z.string() }),
    handler: async (input, context) => {
      const { service } = await getAuthenticatedGoogleService<any>({
        serviceName: 'slides',
        version: 'v1',
        userGoogleEmail: input.user_google_email,
        requiredScopes: [SLIDES_SCOPE],
        sessionId: context?.sessionId,
      });
      const response = await service.presentations.create({ requestBody: { title: input.title } });
      return textResponse(`Presentation created: ${response.data.presentationId}`);
    },
  });

  registerTool(server, {
    name: 'get_presentation',
    description: 'Get presentation details.',
    inputSchema: z.object({ user_google_email: z.string(), presentation_id: z.string() }),
    handler: async (input, context) => {
      const { service } = await getAuthenticatedGoogleService<any>({
        serviceName: 'slides',
        version: 'v1',
        userGoogleEmail: input.user_google_email,
        requiredScopes: [SLIDES_READONLY_SCOPE],
        sessionId: context?.sessionId,
      });
      const response = await service.presentations.get({ presentationId: input.presentation_id });
      return textResponse(safeJsonStringify({ title: response.data.title, slides: response.data.slides?.length }));
    },
  });

  registerTool(server, {
    name: 'batch_update_presentation',
    description: 'Run batchUpdate requests on a presentation.',
    inputSchema: z.object({
      user_google_email: z.string(),
      presentation_id: z.string(),
      requests: z.array(z.record(z.string(), z.any())),
    }),
    handler: async (input, context) => {
      const { service } = await getAuthenticatedGoogleService<any>({
        serviceName: 'slides',
        version: 'v1',
        userGoogleEmail: input.user_google_email,
        requiredScopes: [SLIDES_SCOPE],
        sessionId: context?.sessionId,
      });
      await service.presentations.batchUpdate({ presentationId: input.presentation_id, requestBody: { requests: input.requests } });
      return textResponse('Batch update executed.');
    },
  });

  registerTool(server, {
    name: 'get_page',
    description: 'Get a slide page by ID.',
    inputSchema: z.object({
      user_google_email: z.string(),
      presentation_id: z.string(),
      page_object_id: z.string(),
    }),
    handler: async (input, context) => {
      const { service } = await getAuthenticatedGoogleService<any>({
        serviceName: 'slides',
        version: 'v1',
        userGoogleEmail: input.user_google_email,
        requiredScopes: [SLIDES_READONLY_SCOPE],
        sessionId: context?.sessionId,
      });
      const response = await service.presentations.pages.get({ presentationId: input.presentation_id, pageObjectId: input.page_object_id });
      return textResponse(safeJsonStringify(response.data));
    },
  });

  registerTool(server, {
    name: 'get_page_thumbnail',
    description: 'Get a thumbnail URL for a slide page.',
    inputSchema: z.object({
      user_google_email: z.string(),
      presentation_id: z.string(),
      page_object_id: z.string(),
      thumbnail_size: z.enum(['LARGE', 'MEDIUM', 'SMALL']).optional(),
    }),
    handler: async (input, context) => {
      const { service } = await getAuthenticatedGoogleService<any>({
        serviceName: 'slides',
        version: 'v1',
        userGoogleEmail: input.user_google_email,
        requiredScopes: [SLIDES_READONLY_SCOPE],
        sessionId: context?.sessionId,
      });
      const response = await service.presentations.pages.getThumbnail({
        presentationId: input.presentation_id,
        pageObjectId: input.page_object_id,
        thumbnailProperties_thumbnailSize: input.thumbnail_size ?? 'MEDIUM',
      });
      return textResponse(`Thumbnail URL: ${response.data.contentUrl}`);
    },
  });

  registerCommentTools({ server, appName: 'presentation', fileIdParam: 'presentation_id' });
}
