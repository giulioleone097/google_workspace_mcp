import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { decodeBase64Url } from './utils.js';

const DEFAULT_EXPIRATION_MS =
  Number(process.env.WORKSPACE_MCP_ATTACHMENT_TTL_SECONDS ?? 3600) * 1000;
const STORAGE_DIR = process.env.WORKSPACE_MCP_ATTACHMENT_DIR
  ? path.resolve(process.env.WORKSPACE_MCP_ATTACHMENT_DIR)
  : path.join(os.tmpdir(), 'workspace-mcp', 'attachments');

export type AttachmentMetadata = {
  filePath: string;
  filename: string;
  mimeType: string;
  size: number;
  createdAt: Date;
  expiresAt: Date;
};

class AttachmentStorage {
  private metadata = new Map<string, AttachmentMetadata>();
  constructor(private expirationMs = DEFAULT_EXPIRATION_MS) {}

  async saveAttachment(base64Data: string, filename?: string, mimeType?: string): Promise<string> {
    await fs.mkdir(STORAGE_DIR, { recursive: true });
    const fileId = randomUUID();
    const bytes = decodeBase64Url(base64Data);
    const extension = filename ? path.extname(filename) : '';
    const filePath = path.join(STORAGE_DIR, `${fileId}${extension}`);
    await fs.writeFile(filePath, bytes);
    const now = new Date();
    this.metadata.set(fileId, {
      filePath,
      filename: filename ?? `attachment${extension}`,
      mimeType: mimeType ?? 'application/octet-stream',
      size: bytes.length,
      createdAt: now,
      expiresAt: new Date(now.getTime() + this.expirationMs),
    });
    return fileId;
  }

  getAttachmentPath(fileId: string): string | null {
    const meta = this.metadata.get(fileId);
    if (!meta) return null;
    if (meta.expiresAt.getTime() < Date.now()) {
      this.metadata.delete(fileId);
      return null;
    }
    return meta.filePath;
  }

  getAttachmentMetadata(fileId: string): AttachmentMetadata | null {
    const meta = this.metadata.get(fileId);
    if (!meta) return null;
    if (meta.expiresAt.getTime() < Date.now()) {
      this.metadata.delete(fileId);
      return null;
    }
    return meta;
  }
}

let storage: AttachmentStorage | null = null;

export function getAttachmentStorage(): AttachmentStorage {
  if (!storage) {
    storage = new AttachmentStorage();
  }
  return storage;
}
