import { z } from 'zod';
import { registerTool } from '../core/toolRegistry.js';
import { textResponse, safeJsonStringify } from '../core/utils.js';
import { getAuthenticatedGoogleService } from '../auth/googleAuth.js';
import { SHEETS_READONLY_SCOPE, SHEETS_WRITE_SCOPE, DRIVE_READONLY_SCOPE } from '../auth/scopes.js';
import { registerCommentTools } from '../core/comments.js';

export function registerSheetsTools(server: any) {
  registerTool(server, {
    name: 'create_spreadsheet',
    description: 'Create a Google Spreadsheet.',
    inputSchema: z.object({
      user_google_email: z.string(),
      title: z.string(),
    }),
    handler: async (input, context) => {
      const { service } = await getAuthenticatedGoogleService<any>({
        serviceName: 'sheets',
        version: 'v4',
        userGoogleEmail: input.user_google_email,
        requiredScopes: [SHEETS_WRITE_SCOPE],
        sessionId: context?.sessionId,
      });
      const response = await service.spreadsheets.create({ requestBody: { properties: { title: input.title } } });
      return textResponse(`Spreadsheet created: ${response.data.spreadsheetId}`);
    },
  });

  registerTool(server, {
    name: 'read_sheet_values',
    description: 'Read values from a spreadsheet range.',
    inputSchema: z.object({
      user_google_email: z.string(),
      spreadsheet_id: z.string(),
      range: z.string(),
    }),
    handler: async (input, context) => {
      const { service } = await getAuthenticatedGoogleService<any>({
        serviceName: 'sheets',
        version: 'v4',
        userGoogleEmail: input.user_google_email,
        requiredScopes: [SHEETS_READONLY_SCOPE],
        sessionId: context?.sessionId,
      });
      const response = await service.spreadsheets.values.get({ spreadsheetId: input.spreadsheet_id, range: input.range });
      return textResponse(safeJsonStringify(response.data.values ?? []));
    },
  });

  registerTool(server, {
    name: 'modify_sheet_values',
    description: 'Write values to a spreadsheet range.',
    inputSchema: z.object({
      user_google_email: z.string(),
      spreadsheet_id: z.string(),
      range: z.string(),
      values: z.array(z.array(z.any())),
      value_input_option: z.enum(['RAW', 'USER_ENTERED']).optional(),
    }),
    handler: async (input, context) => {
      const { service } = await getAuthenticatedGoogleService<any>({
        serviceName: 'sheets',
        version: 'v4',
        userGoogleEmail: input.user_google_email,
        requiredScopes: [SHEETS_WRITE_SCOPE],
        sessionId: context?.sessionId,
      });
      const response = await service.spreadsheets.values.update({
        spreadsheetId: input.spreadsheet_id,
        range: input.range,
        valueInputOption: input.value_input_option ?? 'RAW',
        requestBody: { values: input.values },
      });
      return textResponse(`Updated ${response.data.updatedCells ?? 0} cells.`);
    },
  });

  registerTool(server, {
    name: 'list_spreadsheets',
    description: 'List accessible spreadsheets.',
    inputSchema: z.object({
      user_google_email: z.string(),
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
        q: "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false",
        pageSize: input.page_size ?? 20,
        fields: 'files(id,name,webViewLink)',
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });
      const files = response.data.files ?? [];
      if (!files.length) return textResponse('No spreadsheets found.');
      return textResponse(files.map((file: any) => `- ${file.name} (${file.id})`).join('\n'));
    },
  });

  registerTool(server, {
    name: 'get_spreadsheet_info',
    description: 'Get spreadsheet metadata.',
    inputSchema: z.object({
      user_google_email: z.string(),
      spreadsheet_id: z.string(),
    }),
    handler: async (input, context) => {
      const { service } = await getAuthenticatedGoogleService<any>({
        serviceName: 'sheets',
        version: 'v4',
        userGoogleEmail: input.user_google_email,
        requiredScopes: [SHEETS_READONLY_SCOPE],
        sessionId: context?.sessionId,
      });
      const response = await service.spreadsheets.get({ spreadsheetId: input.spreadsheet_id });
      return textResponse(safeJsonStringify({ properties: response.data.properties, sheets: response.data.sheets?.map((sheet: any) => sheet.properties) }));
    },
  });

  registerTool(server, {
    name: 'create_sheet',
    description: 'Add a new sheet to a spreadsheet.',
    inputSchema: z.object({
      user_google_email: z.string(),
      spreadsheet_id: z.string(),
      title: z.string(),
    }),
    handler: async (input, context) => {
      const { service } = await getAuthenticatedGoogleService<any>({
        serviceName: 'sheets',
        version: 'v4',
        userGoogleEmail: input.user_google_email,
        requiredScopes: [SHEETS_WRITE_SCOPE],
        sessionId: context?.sessionId,
      });
      const response = await service.spreadsheets.batchUpdate({
        spreadsheetId: input.spreadsheet_id,
        requestBody: { requests: [{ addSheet: { properties: { title: input.title } } }] },
      });
      return textResponse(`Sheet created. Reply count: ${response.data.replies?.length ?? 0}`);
    },
  });

  registerCommentTools({ server, appName: 'spreadsheet', fileIdParam: 'spreadsheet_id' });
}
