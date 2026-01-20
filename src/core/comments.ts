import { z } from 'zod';
import { registerTool } from './toolRegistry.js';
import { textResponse } from './utils.js';
import { getAuthenticatedGoogleService } from '../auth/googleAuth.js';
import { DRIVE_FILE_SCOPE, DRIVE_READONLY_SCOPE } from '../auth/scopes.js';

export function registerCommentTools(options: {
  server: any;
  appName: string;
  fileIdParam: string;
}) {
  const { server, appName, fileIdParam } = options;

  const readName = `read_${appName}_comments`;
  const createName = `create_${appName}_comment`;
  const replyName = `reply_to_${appName}_comment`;
  const resolveName = `resolve_${appName}_comment`;

  registerTool(server, {
    name: readName,
    description: `Read comments from a ${appName}.`,
    inputSchema: z.object({
      user_google_email: z.string(),
      [fileIdParam]: z.string(),
    }),
    handler: async (input, context) => {
      const { service } = await getAuthenticatedGoogleService<{ comments: any }>({
        serviceName: 'drive',
        version: 'v3',
        userGoogleEmail: input.user_google_email,
        requiredScopes: [DRIVE_READONLY_SCOPE],
        sessionId: context?.sessionId,
      });
      const response = await service.comments.list({
        fileId: input[fileIdParam],
        fields: 'comments(id,content,author,createdTime,modifiedTime,resolved,replies(content,author,id,createdTime,modifiedTime))',
      });
      const comments = response.data.comments ?? [];
      if (!comments.length) {
        return textResponse(`No comments found in ${appName} ${input[fileIdParam]}`);
      }
      const output: string[] = [`Found ${comments.length} comments in ${appName} ${input[fileIdParam]}:`];
      for (const comment of comments) {
        output.push(`Comment ID: ${comment.id}`);
        output.push(`Author: ${comment.author?.displayName ?? 'Unknown'}`);
        output.push(`Created: ${comment.createdTime ?? ''}${comment.resolved ? ' [RESOLVED]' : ''}`);
        output.push(`Content: ${comment.content ?? ''}`);
        const replies = comment.replies ?? [];
        if (replies.length) {
          output.push(`Replies (${replies.length}):`);
          for (const reply of replies) {
            output.push(`  Reply ID: ${reply.id}`);
            output.push(`  Author: ${reply.author?.displayName ?? 'Unknown'}`);
            output.push(`  Created: ${reply.createdTime ?? ''}`);
            output.push(`  Content: ${reply.content ?? ''}`);
          }
        }
        output.push('');
      }
      return textResponse(output.join('\n'));
    },
  });

  registerTool(server, {
    name: createName,
    description: `Create a comment on a ${appName}.`,
    inputSchema: z.object({
      user_google_email: z.string(),
      [fileIdParam]: z.string(),
      comment_content: z.string(),
    }),
    handler: async (input, context) => {
      const { service } = await getAuthenticatedGoogleService<{ comments: any }>({
        serviceName: 'drive',
        version: 'v3',
        userGoogleEmail: input.user_google_email,
        requiredScopes: [DRIVE_FILE_SCOPE],
        sessionId: context?.sessionId,
      });
      const response = await service.comments.create({
        fileId: input[fileIdParam],
        requestBody: { content: input.comment_content },
        fields: 'id,content,author,createdTime',
      });
      return textResponse(`Comment created!\nComment ID: ${response.data.id}\nAuthor: ${response.data.author?.displayName ?? 'Unknown'}\nCreated: ${response.data.createdTime ?? ''}`);
    },
  });

  registerTool(server, {
    name: replyName,
    description: `Reply to a comment on a ${appName}.`,
    inputSchema: z.object({
      user_google_email: z.string(),
      [fileIdParam]: z.string(),
      comment_id: z.string(),
      reply_content: z.string(),
    }),
    handler: async (input, context) => {
      const { service } = await getAuthenticatedGoogleService<{ replies: any }>({
        serviceName: 'drive',
        version: 'v3',
        userGoogleEmail: input.user_google_email,
        requiredScopes: [DRIVE_FILE_SCOPE],
        sessionId: context?.sessionId,
      });
      const response = await service.replies.create({
        fileId: input[fileIdParam],
        commentId: input.comment_id,
        requestBody: { content: input.reply_content },
        fields: 'id,content,author,createdTime',
      });
      return textResponse(`Reply posted!\nReply ID: ${response.data.id}\nAuthor: ${response.data.author?.displayName ?? 'Unknown'}\nCreated: ${response.data.createdTime ?? ''}`);
    },
  });

  registerTool(server, {
    name: resolveName,
    description: `Resolve a comment on a ${appName}.`,
    inputSchema: z.object({
      user_google_email: z.string(),
      [fileIdParam]: z.string(),
      comment_id: z.string(),
    }),
    handler: async (input, context) => {
      const { service } = await getAuthenticatedGoogleService<{ replies: any }>({
        serviceName: 'drive',
        version: 'v3',
        userGoogleEmail: input.user_google_email,
        requiredScopes: [DRIVE_FILE_SCOPE],
        sessionId: context?.sessionId,
      });
      const response = await service.replies.create({
        fileId: input[fileIdParam],
        commentId: input.comment_id,
        requestBody: { content: 'Resolved', action: 'resolve' },
        fields: 'id,author,createdTime',
      });
      return textResponse(`Comment resolved. Resolve reply ID: ${response.data.id}`);
    },
  });
}
