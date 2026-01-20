import { z } from 'zod';
import { registerTool } from '../core/toolRegistry.js';
import { textResponse, safeJsonStringify } from '../core/utils.js';
import { getAuthenticatedGoogleService } from '../auth/googleAuth.js';
import { DOCS_READONLY_SCOPE, DOCS_WRITE_SCOPE, DRIVE_READONLY_SCOPE, DRIVE_FILE_SCOPE } from '../auth/scopes.js';
import { registerCommentTools } from '../core/comments.js';

function extractDocText(document: any): string {
  const segments: string[] = [];
  const content = document.body?.content ?? [];
  for (const element of content) {
    const paragraph = element.paragraph;
    if (paragraph?.elements) {
      const text = paragraph.elements.map((e: any) => e.textRun?.content ?? '').join('');
      if (text.trim()) segments.push(text.trim());
    }
  }
  return segments.join('\n');
}

export function registerDocsTools(server: any) {
  registerTool(server, {
    name: 'search_docs',
    description: 'Search Google Docs by name.',
    inputSchema: z.object({
      user_google_email: z.string(),
      query: z.string(),
      page_size: z.number().int().min(1).max(100).optional(),
    }),
    handler: async (input, context) => {
      const escapedQuery = input.query.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      const { service } = await getAuthenticatedGoogleService<any>({
        serviceName: 'drive',
        version: 'v3',
        userGoogleEmail: input.user_google_email,
        requiredScopes: [DRIVE_READONLY_SCOPE],
        sessionId: context?.sessionId,
      });
      const response = await service.files.list({
        q: `name contains '${escapedQuery}' and mimeType='application/vnd.google-apps.document' and trashed=false`,
        pageSize: input.page_size ?? 10,
        fields: 'files(id,name,modifiedTime,webViewLink)',
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });
      const files = response.data.files ?? [];
      if (!files.length) return textResponse('No documents found.');
      return textResponse(files.map((file: any) => `- ${file.name} (ID: ${file.id}) ${file.webViewLink ?? ''}`).join('\n'));
    },
  });

  registerTool(server, {
    name: 'get_doc_content',
    description: 'Get Google Doc content by ID.',
    inputSchema: z.object({
      user_google_email: z.string(),
      document_id: z.string(),
    }),
    handler: async (input, context) => {
      const { service } = await getAuthenticatedGoogleService<any>({
        serviceName: 'docs',
        version: 'v1',
        userGoogleEmail: input.user_google_email,
        requiredScopes: [DOCS_READONLY_SCOPE],
        sessionId: context?.sessionId,
      });
      const response = await service.documents.get({ documentId: input.document_id });
      const content = extractDocText(response.data);
      return textResponse(content || 'No text content found.');
    },
  });

  registerTool(server, {
    name: 'create_doc',
    description: 'Create a Google Doc.',
    inputSchema: z.object({
      user_google_email: z.string(),
      title: z.string(),
    }),
    handler: async (input, context) => {
      const { service } = await getAuthenticatedGoogleService<any>({
        serviceName: 'docs',
        version: 'v1',
        userGoogleEmail: input.user_google_email,
        requiredScopes: [DOCS_WRITE_SCOPE],
        sessionId: context?.sessionId,
      });
      const response = await service.documents.create({ requestBody: { title: input.title } });
      return textResponse(`Document created: ${response.data.title} (ID: ${response.data.documentId})`);
    },
  });

  registerTool(server, {
    name: 'modify_doc_text',
    description: 'Insert or replace text in a Google Doc.',
    inputSchema: z.object({
      user_google_email: z.string(),
      document_id: z.string(),
      start_index: z.number().int().min(1),
      end_index: z.number().int().min(1).optional(),
      text: z.string(),
    }),
    handler: async (input, context) => {
      const { service } = await getAuthenticatedGoogleService<any>({
        serviceName: 'docs',
        version: 'v1',
        userGoogleEmail: input.user_google_email,
        requiredScopes: [DOCS_WRITE_SCOPE],
        sessionId: context?.sessionId,
      });
      const requests: any[] = [];
      if (input.end_index && input.end_index > input.start_index) {
        requests.push({ deleteContentRange: { range: { startIndex: input.start_index, endIndex: input.end_index } } });
      }
      requests.push({ insertText: { location: { index: input.start_index }, text: input.text } });
      await service.documents.batchUpdate({ documentId: input.document_id, requestBody: { requests } });
      return textResponse('Document updated successfully.');
    },
  });

  registerTool(server, {
    name: 'export_doc_to_pdf',
    description: 'Export a Google Doc to PDF (base64).',
    inputSchema: z.object({
      user_google_email: z.string(),
      document_id: z.string(),
    }),
    handler: async (input, context) => {
      const { service } = await getAuthenticatedGoogleService<any>({
        serviceName: 'drive',
        version: 'v3',
        userGoogleEmail: input.user_google_email,
        requiredScopes: [DRIVE_READONLY_SCOPE],
        sessionId: context?.sessionId,
      });
      const response = await service.files.export({ fileId: input.document_id, mimeType: 'application/pdf' }, { responseType: 'arraybuffer' });
      const base64 = Buffer.from(response.data as ArrayBuffer).toString('base64');
      return textResponse(`Base64 PDF:\n${base64}`);
    },
  });

  registerTool(server, {
    name: 'find_and_replace_doc',
    description: 'Find and replace text in a Google Doc.',
    inputSchema: z.object({
      user_google_email: z.string(),
      document_id: z.string(),
      find_text: z.string(),
      replace_text: z.string(),
      match_case: z.boolean().optional(),
    }),
    handler: async (input, context) => {
      const { service } = await getAuthenticatedGoogleService<any>({
        serviceName: 'docs',
        version: 'v1',
        userGoogleEmail: input.user_google_email,
        requiredScopes: [DOCS_WRITE_SCOPE],
        sessionId: context?.sessionId,
      });
      const requests = [
        {
          replaceAllText: {
            containsText: { text: input.find_text, matchCase: input.match_case ?? false },
            replaceText: input.replace_text,
          },
        },
      ];
      const response = await service.documents.batchUpdate({ documentId: input.document_id, requestBody: { requests } });
      return textResponse(`Replacements made: ${response.data.replies?.length ?? 0}`);
    },
  });

  registerTool(server, {
    name: 'list_docs_in_folder',
    description: 'List Google Docs in a Drive folder.',
    inputSchema: z.object({
      user_google_email: z.string(),
      folder_id: z.string(),
      page_size: z.number().int().min(1).max(100).optional(),
    }),
    handler: async (input, context) => {
      const { service } = await getAuthenticatedGoogleService<any>({
        serviceName: 'drive',
        version: 'v3',
        userGoogleEmail: input.user_google_email,
        requiredScopes: [DRIVE_READONLY_SCOPE],
        sessionId: context?.sessionId,
      });
      const response = await service.files.list({
        q: `'${input.folder_id}' in parents and mimeType='application/vnd.google-apps.document' and trashed=false`,
        pageSize: input.page_size ?? 20,
        fields: 'files(id,name,webViewLink)',
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });
      const files = response.data.files ?? [];
      if (!files.length) return textResponse('No documents found.');
      return textResponse(files.map((file: any) => `- ${file.name} (${file.id})`).join('\n'));
    },
  });

  registerTool(server, {
    name: 'insert_doc_elements',
    description: 'Run batchUpdate requests against a Google Doc.',
    inputSchema: z.object({
      user_google_email: z.string(),
      document_id: z.string(),
      requests: z.array(z.record(z.string(), z.any())),
    }),
    handler: async (input, context) => {
      const { service } = await getAuthenticatedGoogleService<any>({
        serviceName: 'docs',
        version: 'v1',
        userGoogleEmail: input.user_google_email,
        requiredScopes: [DOCS_WRITE_SCOPE],
        sessionId: context?.sessionId,
      });
      await service.documents.batchUpdate({ documentId: input.document_id, requestBody: { requests: input.requests } });
      return textResponse('Batch update executed.');
    },
  });

  registerTool(server, {
    name: 'insert_doc_image',
    description: 'Insert an image into a Google Doc.',
    inputSchema: z.object({
      user_google_email: z.string(),
      document_id: z.string(),
      image_url: z.string(),
      location_index: z.number().int().min(1).optional(),
    }),
    handler: async (input, context) => {
      const { service } = await getAuthenticatedGoogleService<any>({
        serviceName: 'docs',
        version: 'v1',
        userGoogleEmail: input.user_google_email,
        requiredScopes: [DOCS_WRITE_SCOPE],
        sessionId: context?.sessionId,
      });
      const requests = [
        {
          insertInlineImage: {
            uri: input.image_url,
            location: { index: input.location_index ?? 1 },
          },
        },
      ];
      await service.documents.batchUpdate({ documentId: input.document_id, requestBody: { requests } });
      return textResponse('Image inserted.');
    },
  });

  registerTool(server, {
    name: 'update_doc_headers_footers',
    description: 'Update headers or footers via batchUpdate.',
    inputSchema: z.object({
      user_google_email: z.string(),
      document_id: z.string(),
      requests: z.array(z.record(z.string(), z.any())),
    }),
    handler: async (input, context) => {
      const { service } = await getAuthenticatedGoogleService<any>({
        serviceName: 'docs',
        version: 'v1',
        userGoogleEmail: input.user_google_email,
        requiredScopes: [DOCS_WRITE_SCOPE],
        sessionId: context?.sessionId,
      });
      await service.documents.batchUpdate({ documentId: input.document_id, requestBody: { requests: input.requests } });
      return textResponse('Header/footer updated.');
    },
  });

  registerTool(server, {
    name: 'batch_update_doc',
    description: 'Run batchUpdate requests against a Doc.',
    inputSchema: z.object({
      user_google_email: z.string(),
      document_id: z.string(),
      requests: z.array(z.record(z.string(), z.any())),
    }),
    handler: async (input, context) => {
      const { service } = await getAuthenticatedGoogleService<any>({
        serviceName: 'docs',
        version: 'v1',
        userGoogleEmail: input.user_google_email,
        requiredScopes: [DOCS_WRITE_SCOPE],
        sessionId: context?.sessionId,
      });
      await service.documents.batchUpdate({ documentId: input.document_id, requestBody: { requests: input.requests } });
      return textResponse('Batch update executed.');
    },
  });

  registerTool(server, {
    name: 'inspect_doc_structure',
    description: 'Inspect raw Google Doc structure.',
    inputSchema: z.object({
      user_google_email: z.string(),
      document_id: z.string(),
    }),
    handler: async (input, context) => {
      const { service } = await getAuthenticatedGoogleService<any>({
        serviceName: 'docs',
        version: 'v1',
        userGoogleEmail: input.user_google_email,
        requiredScopes: [DOCS_READONLY_SCOPE],
        sessionId: context?.sessionId,
      });
      const response = await service.documents.get({ documentId: input.document_id });
      return textResponse(safeJsonStringify(response.data));
    },
  });

  registerTool(server, {
    name: 'create_table_with_data',
    description: 'Create a table in a Google Doc.',
    inputSchema: z.object({
      user_google_email: z.string(),
      document_id: z.string(),
      rows: z.number().int().min(1),
      columns: z.number().int().min(1),
      location_index: z.number().int().min(1).optional(),
    }),
    handler: async (input, context) => {
      const { service } = await getAuthenticatedGoogleService<any>({
        serviceName: 'docs',
        version: 'v1',
        userGoogleEmail: input.user_google_email,
        requiredScopes: [DOCS_WRITE_SCOPE],
        sessionId: context?.sessionId,
      });
      const requests = [
        {
          insertTable: {
            rows: input.rows,
            columns: input.columns,
            location: { index: input.location_index ?? 1 },
          },
        },
      ];
      await service.documents.batchUpdate({ documentId: input.document_id, requestBody: { requests } });
      return textResponse('Table created.');
    },
  });

  registerTool(server, {
    name: 'debug_table_structure',
    description: 'Return table structure data from a Google Doc.',
    inputSchema: z.object({
      user_google_email: z.string(),
      document_id: z.string(),
    }),
    handler: async (input, context) => {
      const { service } = await getAuthenticatedGoogleService<any>({
        serviceName: 'docs',
        version: 'v1',
        userGoogleEmail: input.user_google_email,
        requiredScopes: [DOCS_READONLY_SCOPE],
        sessionId: context?.sessionId,
      });
      const response = await service.documents.get({ documentId: input.document_id });
      const tables = (response.data.body?.content ?? []).filter((element: any) => element.table);
      return textResponse(safeJsonStringify(tables));
    },
  });

  registerCommentTools({ server, appName: 'document', fileIdParam: 'document_id' });
}
