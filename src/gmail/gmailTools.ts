import { z } from 'zod';
import { registerTool } from '../core/toolRegistry.js';
import { textResponse, decodeBase64Url, encodeBase64Url, stripHtml } from '../core/utils.js';
import { getAuthenticatedGoogleService } from '../auth/googleAuth.js';
import {
  GMAIL_READONLY_SCOPE,
  GMAIL_SEND_SCOPE,
  GMAIL_COMPOSE_SCOPE,
  GMAIL_MODIFY_SCOPE,
  GMAIL_LABELS_SCOPE,
} from '../auth/scopes.js';
import { getAttachmentStorage } from '../core/attachmentStorage.js';

const metadataHeaders = ['Subject', 'From', 'To', 'Cc', 'Message-ID', 'Date'];

function extractHeaders(payload: any): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const header of payload?.headers ?? []) {
    if (metadataHeaders.map((name) => name.toLowerCase()).includes(header.name.toLowerCase())) {
      headers[header.name] = header.value;
    }
  }
  return headers;
}

function extractBodies(payload: any): { text: string; html: string } {
  let text = '';
  let html = '';
  const queue = Array.isArray(payload?.parts) ? [...payload.parts] : [payload];
  while (queue.length) {
    const part = queue.shift();
    if (!part) continue;
    const bodyData = part.body?.data;
    if (bodyData) {
      const decoded = decodeBase64Url(bodyData).toString('utf8');
      if (part.mimeType === 'text/plain' && !text) {
        text = decoded;
      }
      if (part.mimeType === 'text/html' && !html) {
        html = decoded;
      }
    }
    if (Array.isArray(part.parts)) {
      queue.push(...part.parts);
    }
  }
  return { text, html };
}

function formatBody(text: string, html: string): string {
  const textTrimmed = text.trim();
  const htmlTrimmed = html.trim();
  if (htmlTrimmed && (!textTrimmed || htmlTrimmed.length > textTrimmed.length * 4)) {
    return stripHtml(htmlTrimmed);
  }
  return textTrimmed || '[No readable content found]';
}

function buildRawMessage(options: {
  subject: string;
  body: string;
  to?: string;
  cc?: string;
  bcc?: string;
  inReplyTo?: string;
  references?: string;
  bodyFormat?: 'plain' | 'html';
  from?: string;
}): string {
  const lines: string[] = [];
  if (options.from) lines.push(`From: ${options.from}`);
  if (options.to) lines.push(`To: ${options.to}`);
  if (options.cc) lines.push(`Cc: ${options.cc}`);
  if (options.bcc) lines.push(`Bcc: ${options.bcc}`);
  lines.push(`Subject: ${options.subject}`);
  if (options.inReplyTo) lines.push(`In-Reply-To: ${options.inReplyTo}`);
  if (options.references) lines.push(`References: ${options.references}`);
  lines.push('MIME-Version: 1.0');
  const contentType = options.bodyFormat === 'html' ? 'text/html' : 'text/plain';
  lines.push(`Content-Type: ${contentType}; charset="UTF-8"`);
  lines.push('');
  lines.push(options.body);
  const raw = Buffer.from(lines.join('\r\n'));
  return encodeBase64Url(raw);
}

export function registerGmailTools(server: any) {
  registerTool(server, {
    name: 'search_gmail_messages',
    description: 'Search Gmail messages using Gmail search operators.',
    inputSchema: z.object({
      user_google_email: z.string(),
      query: z.string(),
      page_size: z.number().int().min(1).max(100).optional(),
      page_token: z.string().optional(),
    }),
    handler: async (input, context) => {
      const { service } = await getAuthenticatedGoogleService<any>({
        serviceName: 'gmail',
        version: 'v1',
        userGoogleEmail: input.user_google_email,
        requiredScopes: [GMAIL_READONLY_SCOPE],
        sessionId: context?.sessionId,
      });
      const response = await service.users.messages.list({
        userId: 'me',
        q: input.query,
        maxResults: input.page_size ?? 10,
        pageToken: input.page_token,
      });
      const messages = response.data.messages ?? [];
      const lines = [`Found ${messages.length} messages for '${input.query}':`];
      messages.forEach((msg: any, index: number) => {
        lines.push(`${index + 1}. Message ID: ${msg.id} Thread ID: ${msg.threadId}`);
      });
      if (response.data.nextPageToken) {
        lines.push(`Next page token: ${response.data.nextPageToken}`);
      }
      return textResponse(lines.join('\n'));
    },
  });

  registerTool(server, {
    name: 'get_gmail_message_content',
    description: 'Get full content of a Gmail message.',
    inputSchema: z.object({
      user_google_email: z.string(),
      message_id: z.string(),
    }),
    handler: async (input, context) => {
      const { service } = await getAuthenticatedGoogleService<any>({
        serviceName: 'gmail',
        version: 'v1',
        userGoogleEmail: input.user_google_email,
        requiredScopes: [GMAIL_READONLY_SCOPE],
        sessionId: context?.sessionId,
      });
      const metadata = await service.users.messages.get({
        userId: 'me',
        id: input.message_id,
        format: 'metadata',
        metadataHeaders: metadataHeaders,
      });
      const full = await service.users.messages.get({
        userId: 'me',
        id: input.message_id,
        format: 'full',
      });
      const headers = extractHeaders(metadata.data.payload);
      const bodies = extractBodies(full.data.payload);
      const body = formatBody(bodies.text, bodies.html);
      const lines = [
        `Subject: ${headers.Subject ?? '(no subject)'}`,
        `From: ${headers.From ?? '(unknown sender)'}`,
        `Date: ${headers.Date ?? '(unknown date)'}`,
      ];
      if (headers.To) lines.push(`To: ${headers.To}`);
      if (headers.Cc) lines.push(`Cc: ${headers.Cc}`);
      lines.push('', '--- BODY ---', body);
      return textResponse(lines.join('\n'));
    },
  });

  registerTool(server, {
    name: 'get_gmail_messages_content_batch',
    description: 'Get multiple Gmail messages content in batch.',
    inputSchema: z.object({
      user_google_email: z.string(),
      message_ids: z.array(z.string()).min(1),
      format: z.enum(['full', 'metadata']).optional(),
    }),
    handler: async (input, context) => {
      const { service } = await getAuthenticatedGoogleService<any>({
        serviceName: 'gmail',
        version: 'v1',
        userGoogleEmail: input.user_google_email,
        requiredScopes: [GMAIL_READONLY_SCOPE],
        sessionId: context?.sessionId,
      });
      const output: string[] = [];
      for (const messageId of input.message_ids) {
        const response = await service.users.messages.get({
          userId: 'me',
          id: messageId,
          format: input.format ?? 'full',
          metadataHeaders: metadataHeaders,
        });
        const headers = extractHeaders(response.data.payload);
        output.push(`Message ID: ${messageId}`);
        output.push(`Subject: ${headers.Subject ?? '(no subject)'}`);
        output.push(`From: ${headers.From ?? '(unknown sender)'}`);
        if (input.format !== 'metadata') {
          const bodies = extractBodies(response.data.payload);
          output.push(formatBody(bodies.text, bodies.html));
        }
        output.push('');
      }
      return textResponse(output.join('\n'));
    },
  });

  registerTool(server, {
    name: 'send_gmail_message',
    description: 'Send an email using Gmail.',
    inputSchema: z.object({
      user_google_email: z.string(),
      to: z.string(),
      subject: z.string(),
      body: z.string(),
      body_format: z.enum(['plain', 'html']).optional(),
      cc: z.string().optional(),
      bcc: z.string().optional(),
      thread_id: z.string().optional(),
      in_reply_to: z.string().optional(),
      references: z.string().optional(),
    }),
    handler: async (input, context) => {
      const { service } = await getAuthenticatedGoogleService<any>({
        serviceName: 'gmail',
        version: 'v1',
        userGoogleEmail: input.user_google_email,
        requiredScopes: [GMAIL_SEND_SCOPE],
        sessionId: context?.sessionId,
      });
      const raw = buildRawMessage({
        subject: input.subject,
        body: input.body,
        to: input.to,
        cc: input.cc,
        bcc: input.bcc,
        inReplyTo: input.in_reply_to,
        references: input.references,
        bodyFormat: input.body_format ?? 'plain',
        from: input.user_google_email,
      });
      const body = { raw, threadId: input.thread_id };
      const response = await service.users.messages.send({ userId: 'me', requestBody: body });
      return textResponse(`Email sent! Message ID: ${response.data.id}`);
    },
  });

  registerTool(server, {
    name: 'draft_gmail_message',
    description: 'Create a Gmail draft message.',
    inputSchema: z.object({
      user_google_email: z.string(),
      subject: z.string(),
      body: z.string(),
      body_format: z.enum(['plain', 'html']).optional(),
      to: z.string().optional(),
      cc: z.string().optional(),
      bcc: z.string().optional(),
      thread_id: z.string().optional(),
      in_reply_to: z.string().optional(),
      references: z.string().optional(),
    }),
    handler: async (input, context) => {
      const { service } = await getAuthenticatedGoogleService<any>({
        serviceName: 'gmail',
        version: 'v1',
        userGoogleEmail: input.user_google_email,
        requiredScopes: [GMAIL_COMPOSE_SCOPE],
        sessionId: context?.sessionId,
      });
      const raw = buildRawMessage({
        subject: input.subject,
        body: input.body,
        to: input.to,
        cc: input.cc,
        bcc: input.bcc,
        inReplyTo: input.in_reply_to,
        references: input.references,
        bodyFormat: input.body_format ?? 'plain',
        from: input.user_google_email,
      });
      const body = { message: { raw, threadId: input.thread_id } };
      const response = await service.users.drafts.create({ userId: 'me', requestBody: body });
      return textResponse(`Draft created! Draft ID: ${response.data.id}`);
    },
  });

  registerTool(server, {
    name: 'get_gmail_thread_content',
    description: 'Get full content of a Gmail thread.',
    inputSchema: z.object({
      user_google_email: z.string(),
      thread_id: z.string(),
    }),
    handler: async (input, context) => {
      const { service } = await getAuthenticatedGoogleService<any>({
        serviceName: 'gmail',
        version: 'v1',
        userGoogleEmail: input.user_google_email,
        requiredScopes: [GMAIL_READONLY_SCOPE],
        sessionId: context?.sessionId,
      });
      const response = await service.users.threads.get({ userId: 'me', id: input.thread_id, format: 'full' });
      const messages = response.data.messages ?? [];
      const lines = [`Thread ID: ${input.thread_id}`, `Messages: ${messages.length}`, ''];
      messages.forEach((message: any, index: number) => {
        const headers = extractHeaders(message.payload);
        const bodies = extractBodies(message.payload);
        lines.push(`=== Message ${index + 1} ===`);
        lines.push(`From: ${headers.From ?? '(unknown sender)'}`);
        lines.push(`Date: ${headers.Date ?? '(unknown date)'}`);
        lines.push(formatBody(bodies.text, bodies.html));
        lines.push('');
      });
      return textResponse(lines.join('\n'));
    },
  });

  registerTool(server, {
    name: 'get_gmail_threads_content_batch',
    description: 'Get multiple Gmail threads content.',
    inputSchema: z.object({
      user_google_email: z.string(),
      thread_ids: z.array(z.string()).min(1),
    }),
    handler: async (input, context) => {
      const { service } = await getAuthenticatedGoogleService<any>({
        serviceName: 'gmail',
        version: 'v1',
        userGoogleEmail: input.user_google_email,
        requiredScopes: [GMAIL_READONLY_SCOPE],
        sessionId: context?.sessionId,
      });
      const outputs: string[] = [];
      for (const threadId of input.thread_ids) {
        const response = await service.users.threads.get({ userId: 'me', id: threadId, format: 'full' });
        outputs.push(`Thread ${threadId}: ${response.data.messages?.length ?? 0} messages`);
      }
      return textResponse(outputs.join('\n'));
    },
  });

  registerTool(server, {
    name: 'get_gmail_attachment_content',
    description: 'Download Gmail attachment content.',
    inputSchema: z.object({
      user_google_email: z.string(),
      message_id: z.string(),
      attachment_id: z.string(),
    }),
    handler: async (input, context) => {
      const { service } = await getAuthenticatedGoogleService<any>({
        serviceName: 'gmail',
        version: 'v1',
        userGoogleEmail: input.user_google_email,
        requiredScopes: [GMAIL_READONLY_SCOPE],
        sessionId: context?.sessionId,
      });
      const response = await service.users.messages.attachments.get({
        userId: 'me',
        messageId: input.message_id,
        id: input.attachment_id,
      });
      const data = response.data.data || '';
      const storage = getAttachmentStorage();
      const fileId = await storage.saveAttachment(data, undefined, response.data.mimeType ?? undefined);
      return textResponse(`Attachment downloaded. Storage ID: ${fileId}`);
    },
  });

  registerTool(server, {
    name: 'list_gmail_labels',
    description: 'List Gmail labels.',
    inputSchema: z.object({
      user_google_email: z.string(),
    }),
    handler: async (input, context) => {
      const { service } = await getAuthenticatedGoogleService<any>({
        serviceName: 'gmail',
        version: 'v1',
        userGoogleEmail: input.user_google_email,
        requiredScopes: [GMAIL_READONLY_SCOPE],
        sessionId: context?.sessionId,
      });
      const response = await service.users.labels.list({ userId: 'me' });
      const labels = response.data.labels ?? [];
      if (!labels.length) return textResponse('No labels found.');
      const lines = labels.map((label: any) => `• ${label.name} (ID: ${label.id})`);
      return textResponse(lines.join('\n'));
    },
  });

  registerTool(server, {
    name: 'manage_gmail_label',
    description: 'Create, update, or delete a Gmail label.',
    inputSchema: z.object({
      user_google_email: z.string(),
      action: z.enum(['create', 'update', 'delete']),
      name: z.string().optional(),
      label_id: z.string().optional(),
    }),
    handler: async (input, context) => {
      const { service } = await getAuthenticatedGoogleService<any>({
        serviceName: 'gmail',
        version: 'v1',
        userGoogleEmail: input.user_google_email,
        requiredScopes: [GMAIL_LABELS_SCOPE],
        sessionId: context?.sessionId,
      });
      if (input.action === 'create') {
        const response = await service.users.labels.create({
          userId: 'me',
          requestBody: { name: input.name },
        });
        return textResponse(`Label created: ${response.data.name} (${response.data.id})`);
      }
      if (!input.label_id) {
        throw new Error('label_id is required for update/delete');
      }
      if (input.action === 'update') {
        const response = await service.users.labels.update({
          userId: 'me',
          id: input.label_id,
          requestBody: { id: input.label_id, name: input.name },
        });
        return textResponse(`Label updated: ${response.data.name} (${response.data.id})`);
      }
      await service.users.labels.delete({ userId: 'me', id: input.label_id });
      return textResponse(`Label deleted: ${input.label_id}`);
    },
  });

  registerTool(server, {
    name: 'modify_gmail_message_labels',
    description: 'Modify labels for a Gmail message.',
    inputSchema: z.object({
      user_google_email: z.string(),
      message_id: z.string(),
      add_label_ids: z.array(z.string()).optional(),
      remove_label_ids: z.array(z.string()).optional(),
    }),
    handler: async (input, context) => {
      const { service } = await getAuthenticatedGoogleService<any>({
        serviceName: 'gmail',
        version: 'v1',
        userGoogleEmail: input.user_google_email,
        requiredScopes: [GMAIL_MODIFY_SCOPE],
        sessionId: context?.sessionId,
      });
      await service.users.messages.modify({
        userId: 'me',
        id: input.message_id,
        requestBody: {
          addLabelIds: input.add_label_ids ?? [],
          removeLabelIds: input.remove_label_ids ?? [],
        },
      });
      return textResponse(`Updated labels for message ${input.message_id}`);
    },
  });

  registerTool(server, {
    name: 'batch_modify_gmail_message_labels',
    description: 'Batch modify labels for Gmail messages.',
    inputSchema: z.object({
      user_google_email: z.string(),
      message_ids: z.array(z.string()).min(1),
      add_label_ids: z.array(z.string()).optional(),
      remove_label_ids: z.array(z.string()).optional(),
    }),
    handler: async (input, context) => {
      const { service } = await getAuthenticatedGoogleService<any>({
        serviceName: 'gmail',
        version: 'v1',
        userGoogleEmail: input.user_google_email,
        requiredScopes: [GMAIL_MODIFY_SCOPE],
        sessionId: context?.sessionId,
      });
      await service.users.messages.batchModify({
        userId: 'me',
        requestBody: {
          ids: input.message_ids,
          addLabelIds: input.add_label_ids ?? [],
          removeLabelIds: input.remove_label_ids ?? [],
        },
      });
      return textResponse(`Updated labels for ${input.message_ids.length} messages.`);
    },
  });
}
