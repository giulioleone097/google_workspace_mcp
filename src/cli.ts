#!/usr/bin/env node
import 'dotenv/config';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { WORKSPACE_MCP_PORT } from './core/config.js';
import { createServer } from './server.js';
import { ensureOAuthCallbackServer } from './auth/oauthCallbackServer.js';
import { logger } from './core/logger.js';

function parseArgs(argv: string[]) {
  const args = argv.slice(2);
  const result: {
    transport: 'stdio' | 'streamable-http';
    tools?: string[];
    toolTier?: 'core' | 'extended' | 'complete';
    singleUser: boolean;
  } = {
    transport: 'stdio',
    singleUser: false,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--transport') {
      const value = args[i + 1];
      if (value === 'stdio' || value === 'streamable-http') {
        result.transport = value;
      } else {
        throw new Error(`Invalid transport: ${value}`);
      }
      i += 1;
    } else if (arg === '--tool-tier') {
      result.toolTier = args[i + 1] as 'core' | 'extended' | 'complete';
      i += 1;
    } else if (arg === '--tools') {
      const tools: string[] = [];
      while (args[i + 1] && !args[i + 1].startsWith('--')) {
        tools.push(args[i + 1]);
        i += 1;
      }
      result.tools = tools;
    } else if (arg === '--single-user') {
      result.singleUser = true;
    }
  }

  if (result.singleUser) {
    process.env.MCP_SINGLE_USER_MODE = '1';
  }

  return result;
}

async function main() {
  const parsed = parseArgs(process.argv);
  const server = await createServer({
    tools: parsed.tools,
    toolTier: parsed.toolTier,
    transport: parsed.transport,
  });

  if (parsed.transport === 'streamable-http') {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
    });
    await server.connect(transport);
    const httpServer = http.createServer((req, res) => {
      if (!req.url?.startsWith('/mcp')) {
        res.statusCode = 404;
        res.end('Not Found');
        return;
      }
      transport.handleRequest(req, res).catch((error) => {
        logger.error('HTTP transport error', error);
        res.statusCode = 500;
        res.end('Transport error');
      });
    });
    httpServer.listen(WORKSPACE_MCP_PORT, '0.0.0.0', () => {
      logger.info(`MCP server running on http://localhost:${WORKSPACE_MCP_PORT}/mcp`);
    });
    return;
  }

  await ensureOAuthCallbackServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  logger.error('Failed to start MCP server', error);
  process.exit(1);
});
