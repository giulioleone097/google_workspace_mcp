import { z } from 'zod';
import { registerTool } from '../core/toolRegistry.js';
import { textResponse, encodeBase64Url } from '../core/utils.js';
import { getAuthenticatedGoogleService } from '../auth/googleAuth.js';
import { DRIVE_READONLY_SCOPE, DRIVE_FILE_SCOPE } from '../auth/scopes.js';

function buildExportMimeType(mimeType: string, exportFormat?: string): { mimeType?: string; filenameSuffix?: string } {
  if (mimeType === 'application/vnd.google-apps.document') {
    if (exportFormat === 'docx') return { mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', filenameSuffix: '.docx' };
    return { mimeType: 'application/pdf', filenameSuffix: '.pdf' };
  }
  if (mimeType === 'application/vnd.google-apps.spreadsheet') {
    if (exportFormat === 'csv') return { mimeType: 'text/csv', filenameSuffix: '.csv' };
    return { mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', filenameSuffix: '.xlsx' };
  }
  if (mimeType === 'application/vnd.google-apps.presentation') {
    if (exportFormat === 'pptx') return { mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', filenameSuffix: '.pptx' };
    return { mimeType: 'application/pdf', filenameSuffix: '.pdf' };
  }
  return {};
}

export function registerDriveTools(server: any) {
  registerTool(server, {
    name: 'search_drive_files',
    description: 'Search Google Drive files.',
    inputSchema: z.object({
      user_google_email: z.string(),
      query: z.string(),
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
        q: input.query,
        pageSize: input.page_size ?? 10,
        fields: 'files(id,name,mimeType,size,modifiedTime,webViewLink)',
        includeItemsFromAllDrives: true,
        supportsAllDrives: true,
      });
      const files = response.data.files ?? [];
      if (!files.length) return textResponse(`No files found for '${input.query}'.`);
      const lines = files.map((file: any) => `- ${file.name} (ID: ${file.id}, Type: ${file.mimeType}) ${file.webViewLink ?? ''}`);
      return textResponse(lines.join('\n'));
    },
  });

  registerTool(server, {
    name: 'get_drive_file_content',
    description: 'Download a Drive file and return its text content if available.',
    inputSchema: z.object({
      user_google_email: z.string(),
      file_id: z.string(),
    }),
    handler: async (input, context) => {
      const { service } = await getAuthenticatedGoogleService<any>({
        serviceName: 'drive',
        version: 'v3',
        userGoogleEmail: input.user_google_email,
        requiredScopes: [DRIVE_READONLY_SCOPE],
        sessionId: context?.sessionId,
      });
      const metadata = await service.files.get({
        fileId: input.file_id,
        fields: 'id,name,mimeType,webViewLink',
        supportsAllDrives: true,
      });
      const mimeType = metadata.data.mimeType ?? '';
      const exportInfo = buildExportMimeType(mimeType);
      const response = exportInfo.mimeType
        ? await service.files.export({ fileId: input.file_id, mimeType: exportInfo.mimeType }, { responseType: 'arraybuffer' })
        : await service.files.get({ fileId: input.file_id, alt: 'media' }, { responseType: 'arraybuffer' });
      const buffer = Buffer.from(response.data as ArrayBuffer);
      const content = buffer.toString('utf8');
      const header = `File: ${metadata.data.name} (ID: ${input.file_id}, Type: ${mimeType})`;
      return textResponse(`${header}\n\n${content}`);
    },
  });

  registerTool(server, {
    name: 'get_drive_file_download_url',
    description: 'Get a download URL for a Drive file.',
    inputSchema: z.object({
      user_google_email: z.string(),
      file_id: z.string(),
      export_format: z.string().optional(),
    }),
    handler: async (input, context) => {
      const { service } = await getAuthenticatedGoogleService<any>({
        serviceName: 'drive',
        version: 'v3',
        userGoogleEmail: input.user_google_email,
        requiredScopes: [DRIVE_READONLY_SCOPE],
        sessionId: context?.sessionId,
      });
      const metadata = await service.files.get({
        fileId: input.file_id,
        fields: 'id,name,mimeType,webViewLink,webContentLink,exportLinks',
        supportsAllDrives: true,
      });
      const mimeType = metadata.data.mimeType ?? '';
      const exportInfo = buildExportMimeType(mimeType, input.export_format);
      const exportLink = exportInfo.mimeType ? metadata.data.exportLinks?.[exportInfo.mimeType] : undefined;
      const url = exportLink || metadata.data.webContentLink || metadata.data.webViewLink || 'No download link available.';
      return textResponse(`Download URL: ${url}`);
    },
  });

  registerTool(server, {
    name: 'create_drive_file',
    description: 'Create a Drive file from text content.',
    inputSchema: z.object({
      user_google_email: z.string(),
      name: z.string(),
      content: z.string(),
      mime_type: z.string().optional(),
      folder_id: z.string().optional(),
    }),
    handler: async (input, context) => {
      const { service } = await getAuthenticatedGoogleService<any>({
        serviceName: 'drive',
        version: 'v3',
        userGoogleEmail: input.user_google_email,
        requiredScopes: [DRIVE_FILE_SCOPE],
        sessionId: context?.sessionId,
      });
      const response = await service.files.create({
        requestBody: {
          name: input.name,
          mimeType: input.mime_type ?? 'text/plain',
          parents: input.folder_id ? [input.folder_id] : undefined,
        },
        media: {
          mimeType: input.mime_type ?? 'text/plain',
          body: Buffer.from(input.content),
        },
        fields: 'id,name,webViewLink',
      });
      return textResponse(`Created file ${response.data.name} (ID: ${response.data.id}). Link: ${response.data.webViewLink}`);
    },
  });

  registerTool(server, {
    name: 'share_drive_file',
    description: 'Share a Drive file with a user, group, domain, or anyone.',
    inputSchema: z.object({
      user_google_email: z.string(),
      file_id: z.string(),
      share_type: z.enum(['user', 'group', 'domain', 'anyone']),
      role: z.enum(['reader', 'commenter', 'writer', 'owner']).default('reader'),
      email_address: z.string().optional(),
    }),
    handler: async (input, context) => {
      const { service } = await getAuthenticatedGoogleService<any>({
        serviceName: 'drive',
        version: 'v3',
        userGoogleEmail: input.user_google_email,
        requiredScopes: [DRIVE_FILE_SCOPE],
        sessionId: context?.sessionId,
      });
      const response = await service.permissions.create({
        fileId: input.file_id,
        requestBody: {
          type: input.share_type,
          role: input.role,
          emailAddress: input.email_address,
        },
        fields: 'id',
        sendNotificationEmail: false,
      });
      return textResponse(`Permission created. ID: ${response.data.id}`);
    },
  });

  registerTool(server, {
    name: 'get_drive_shareable_link',
    description: 'Create a shareable link for a Drive file.',
    inputSchema: z.object({
      user_google_email: z.string(),
      file_id: z.string(),
      role: z.enum(['reader', 'commenter', 'writer']).optional(),
    }),
    handler: async (input, context) => {
      const { service } = await getAuthenticatedGoogleService<any>({
        serviceName: 'drive',
        version: 'v3',
        userGoogleEmail: input.user_google_email,
        requiredScopes: [DRIVE_FILE_SCOPE],
        sessionId: context?.sessionId,
      });
      await service.permissions.create({
        fileId: input.file_id,
        requestBody: { type: 'anyone', role: input.role ?? 'reader' },
      });
      const metadata = await service.files.get({ fileId: input.file_id, fields: 'webViewLink' });
      return textResponse(`Shareable link: ${metadata.data.webViewLink}`);
    },
  });

  registerTool(server, {
    name: 'list_drive_items',
    description: 'List items in a Drive folder.',
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
        q: `'${input.folder_id}' in parents and trashed=false`,
        pageSize: input.page_size ?? 20,
        fields: 'files(id,name,mimeType,webViewLink)',
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });
      const files = response.data.files ?? [];
      if (!files.length) return textResponse('No items found.');
      return textResponse(files.map((file: any) => `- ${file.name} (${file.id})`).join('\n'));
    },
  });

  registerTool(server, {
    name: 'update_drive_file',
    description: 'Update Drive file metadata.',
    inputSchema: z.object({
      user_google_email: z.string(),
      file_id: z.string(),
      name: z.string().optional(),
      description: z.string().optional(),
      add_parents: z.array(z.string()).optional(),
      remove_parents: z.array(z.string()).optional(),
    }),
    handler: async (input, context) => {
      const { service } = await getAuthenticatedGoogleService<any>({
        serviceName: 'drive',
        version: 'v3',
        userGoogleEmail: input.user_google_email,
        requiredScopes: [DRIVE_FILE_SCOPE],
        sessionId: context?.sessionId,
      });
      const response = await service.files.update({
        fileId: input.file_id,
        requestBody: {
          name: input.name,
          description: input.description,
        },
        addParents: input.add_parents?.join(','),
        removeParents: input.remove_parents?.join(','),
        fields: 'id,name,webViewLink',
      });
      return textResponse(`Updated file ${response.data.name} (${response.data.id}).`);
    },
  });

  registerTool(server, {
    name: 'update_drive_permission',
    description: 'Update a Drive permission role.',
    inputSchema: z.object({
      user_google_email: z.string(),
      file_id: z.string(),
      permission_id: z.string(),
      role: z.enum(['reader', 'commenter', 'writer', 'owner']),
    }),
    handler: async (input, context) => {
      const { service } = await getAuthenticatedGoogleService<any>({
        serviceName: 'drive',
        version: 'v3',
        userGoogleEmail: input.user_google_email,
        requiredScopes: [DRIVE_FILE_SCOPE],
        sessionId: context?.sessionId,
      });
      await service.permissions.update({
        fileId: input.file_id,
        permissionId: input.permission_id,
        requestBody: { role: input.role },
      });
      return textResponse(`Permission ${input.permission_id} updated to ${input.role}.`);
    },
  });

  registerTool(server, {
    name: 'remove_drive_permission',
    description: 'Remove a Drive permission.',
    inputSchema: z.object({
      user_google_email: z.string(),
      file_id: z.string(),
      permission_id: z.string(),
    }),
    handler: async (input, context) => {
      const { service } = await getAuthenticatedGoogleService<any>({
        serviceName: 'drive',
        version: 'v3',
        userGoogleEmail: input.user_google_email,
        requiredScopes: [DRIVE_FILE_SCOPE],
        sessionId: context?.sessionId,
      });
      await service.permissions.delete({ fileId: input.file_id, permissionId: input.permission_id });
      return textResponse(`Permission ${input.permission_id} removed.`);
    },
  });

  registerTool(server, {
    name: 'transfer_drive_ownership',
    description: 'Transfer Drive file ownership.',
    inputSchema: z.object({
      user_google_email: z.string(),
      file_id: z.string(),
      permission_id: z.string(),
    }),
    handler: async (input, context) => {
      const { service } = await getAuthenticatedGoogleService<any>({
        serviceName: 'drive',
        version: 'v3',
        userGoogleEmail: input.user_google_email,
        requiredScopes: [DRIVE_FILE_SCOPE],
        sessionId: context?.sessionId,
      });
      await service.permissions.update({
        fileId: input.file_id,
        permissionId: input.permission_id,
        requestBody: { role: 'owner' },
        transferOwnership: true,
      });
      return textResponse(`Ownership transferred with permission ${input.permission_id}.`);
    },
  });

  registerTool(server, {
    name: 'batch_share_drive_file',
    description: 'Share a Drive file with multiple recipients.',
    inputSchema: z.object({
      user_google_email: z.string(),
      file_id: z.string(),
      emails: z.array(z.string()).min(1),
      role: z.enum(['reader', 'commenter', 'writer']).optional(),
    }),
    handler: async (input, context) => {
      const { service } = await getAuthenticatedGoogleService<any>({
        serviceName: 'drive',
        version: 'v3',
        userGoogleEmail: input.user_google_email,
        requiredScopes: [DRIVE_FILE_SCOPE],
        sessionId: context?.sessionId,
      });
      for (const email of input.emails) {
        await service.permissions.create({
          fileId: input.file_id,
          requestBody: { type: 'user', role: input.role ?? 'reader', emailAddress: email },
          sendNotificationEmail: false,
        });
      }
      return textResponse(`Shared file with ${input.emails.length} recipients.`);
    },
  });

  registerTool(server, {
    name: 'get_drive_file_permissions',
    description: 'List Drive file permissions.',
    inputSchema: z.object({
      user_google_email: z.string(),
      file_id: z.string(),
    }),
    handler: async (input, context) => {
      const { service } = await getAuthenticatedGoogleService<any>({
        serviceName: 'drive',
        version: 'v3',
        userGoogleEmail: input.user_google_email,
        requiredScopes: [DRIVE_READONLY_SCOPE],
        sessionId: context?.sessionId,
      });
      const response = await service.permissions.list({
        fileId: input.file_id,
        fields: 'permissions(id,type,role,emailAddress,domain)',
      });
      const perms = response.data.permissions ?? [];
      if (!perms.length) return textResponse('No permissions found.');
      const lines = perms.map((perm: any) => `- ${perm.id}: ${perm.type} ${perm.role} ${perm.emailAddress ?? perm.domain ?? ''}`);
      return textResponse(lines.join('\n'));
    },
  });

  registerTool(server, {
    name: 'check_drive_file_public_access',
    description: 'Check if a Drive file is publicly accessible.',
    inputSchema: z.object({
      user_google_email: z.string(),
      file_id: z.string(),
    }),
    handler: async (input, context) => {
      const { service } = await getAuthenticatedGoogleService<any>({
        serviceName: 'drive',
        version: 'v3',
        userGoogleEmail: input.user_google_email,
        requiredScopes: [DRIVE_READONLY_SCOPE],
        sessionId: context?.sessionId,
      });
      const response = await service.permissions.list({ fileId: input.file_id, fields: 'permissions(type,role)' });
      const isPublic = (response.data.permissions ?? []).some((perm: any) => perm.type === 'anyone');
      return textResponse(isPublic ? 'File is publicly accessible.' : 'File is not publicly accessible.');
    },
  });
}
