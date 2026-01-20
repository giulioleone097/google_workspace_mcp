import crypto from 'node:crypto';
import striptags from 'striptags';

export function textResponse(text: string) {
  return {
    content: [{ type: 'text', text }],
  };
}

export function decodeBase64Url(data: string): Buffer {
  const padded = data.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(padded, 'base64');
}

export function encodeBase64Url(buffer: Buffer): string {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function stripHtml(html: string): string {
  return striptags(html).replace(/\s+/g, ' ').trim();
}

export function generateState(): string {
  return crypto.randomBytes(16).toString('hex');
}

export function safeJsonStringify(value: unknown, indent = 2): string {
  try {
    return JSON.stringify(value, null, indent);
  } catch (error) {
    return String(error);
  }
}
