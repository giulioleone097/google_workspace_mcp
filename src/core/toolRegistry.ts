import { logger } from './logger.js';

let enabledTools: Set<string> | null = null;

export function setEnabledToolNames(toolNames: Set<string> | null) {
  enabledTools = toolNames;
}

export function isToolEnabled(toolName: string): boolean {
  if (!enabledTools) return true;
  return enabledTools.has(toolName);
}

export function registerTool(
  server: {
    registerTool: (
      name: string,
      config: {
        description?: string;
        inputSchema?: any;
      },
      handler: (input: any, context: any) => Promise<any>,
    ) => void;
  },
  options: {
    name: string;
    description: string;
    inputSchema: any;
    handler: (input: any, context: any) => Promise<any>;
  },
) {
  if (!isToolEnabled(options.name)) {
    logger.debug(`Skipping tool registration: ${options.name}`);
    return;
  }
  server.registerTool(
    options.name,
    {
      description: options.description,
      inputSchema: options.inputSchema,
    },
    options.handler,
  );
}
