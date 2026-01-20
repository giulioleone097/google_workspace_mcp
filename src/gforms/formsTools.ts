import { z } from 'zod';
import { registerTool } from '../core/toolRegistry.js';
import { textResponse, safeJsonStringify } from '../core/utils.js';
import { getAuthenticatedGoogleService } from '../auth/googleAuth.js';
import { FORMS_BODY_SCOPE, FORMS_BODY_READONLY_SCOPE, FORMS_RESPONSES_READONLY_SCOPE } from '../auth/scopes.js';

export function registerFormsTools(server: any) {
  registerTool(server, {
    name: 'create_form',
    description: 'Create a Google Form.',
    inputSchema: z.object({
      user_google_email: z.string(),
      title: z.string(),
      description: z.string().optional(),
      document_title: z.string().optional(),
    }),
    handler: async (input, context) => {
      const { service } = await getAuthenticatedGoogleService<any>({
        serviceName: 'forms',
        version: 'v1',
        userGoogleEmail: input.user_google_email,
        requiredScopes: [FORMS_BODY_SCOPE],
        sessionId: context?.sessionId,
      });
      const response = await service.forms.create({
        requestBody: {
          info: {
            title: input.title,
            description: input.description,
            documentTitle: input.document_title,
          },
        },
      });
      return textResponse(`Form created: ${response.data.formId}`);
    },
  });

  registerTool(server, {
    name: 'get_form',
    description: 'Get a Google Form by ID.',
    inputSchema: z.object({
      user_google_email: z.string(),
      form_id: z.string(),
    }),
    handler: async (input, context) => {
      const { service } = await getAuthenticatedGoogleService<any>({
        serviceName: 'forms',
        version: 'v1',
        userGoogleEmail: input.user_google_email,
        requiredScopes: [FORMS_BODY_READONLY_SCOPE],
        sessionId: context?.sessionId,
      });
      const response = await service.forms.get({ formId: input.form_id });
      return textResponse(safeJsonStringify(response.data));
    },
  });

  registerTool(server, {
    name: 'set_publish_settings',
    description: 'Update Google Form publish settings.',
    inputSchema: z.object({
      user_google_email: z.string(),
      form_id: z.string(),
      publish_as_template: z.boolean().optional(),
      require_authentication: z.boolean().optional(),
    }),
    handler: async (input, context) => {
      const { service } = await getAuthenticatedGoogleService<any>({
        serviceName: 'forms',
        version: 'v1',
        userGoogleEmail: input.user_google_email,
        requiredScopes: [FORMS_BODY_SCOPE],
        sessionId: context?.sessionId,
      });
      await service.forms.setPublishSettings({
        formId: input.form_id,
        requestBody: {
          publishAsTemplate: input.publish_as_template ?? false,
          requireAuthentication: input.require_authentication ?? false,
        },
      });
      return textResponse('Publish settings updated.');
    },
  });

  registerTool(server, {
    name: 'list_form_responses',
    description: 'List responses for a Google Form.',
    inputSchema: z.object({
      user_google_email: z.string(),
      form_id: z.string(),
      page_size: z.number().int().min(1).max(100).optional(),
    }),
    handler: async (input, context) => {
      const { service } = await getAuthenticatedGoogleService<any>({
        serviceName: 'forms',
        version: 'v1',
        userGoogleEmail: input.user_google_email,
        requiredScopes: [FORMS_RESPONSES_READONLY_SCOPE],
        sessionId: context?.sessionId,
      });
      const response = await service.forms.responses.list({ formId: input.form_id, pageSize: input.page_size ?? 20 });
      return textResponse(safeJsonStringify(response.data.responses ?? []));
    },
  });

  registerTool(server, {
    name: 'get_form_response',
    description: 'Get a specific form response.',
    inputSchema: z.object({
      user_google_email: z.string(),
      form_id: z.string(),
      response_id: z.string(),
    }),
    handler: async (input, context) => {
      const { service } = await getAuthenticatedGoogleService<any>({
        serviceName: 'forms',
        version: 'v1',
        userGoogleEmail: input.user_google_email,
        requiredScopes: [FORMS_RESPONSES_READONLY_SCOPE],
        sessionId: context?.sessionId,
      });
      const response = await service.forms.responses.get({ formId: input.form_id, responseId: input.response_id });
      return textResponse(safeJsonStringify(response.data));
    },
  });
}
