import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { logger } from './logger.js';

export type TierLevel = 'core' | 'extended' | 'complete';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class ToolTierLoader {
  private configPath: string;
  private configCache?: Record<string, Record<TierLevel, string[]>>;

  constructor(configPath?: string) {
    this.configPath = resolveToolTiersPath(configPath);
  }

  private async loadConfig() {
    if (this.configCache) return this.configCache;
    const raw = await fs.readFile(this.configPath, 'utf8');
    const parsed = YAML.parse(raw) as Record<string, Record<TierLevel, string[]>>;
    this.configCache = parsed;
    return parsed;
  }

  async getAvailableServices(): Promise<string[]> {
    const config = await this.loadConfig();
    return Object.keys(config);
  }

  async getToolsForTier(tier: TierLevel, services?: string[]): Promise<string[]> {
    const config = await this.loadConfig();
    const selectedServices = services ?? Object.keys(config);
    const tools: string[] = [];
    for (const service of selectedServices) {
      const serviceConfig = config[service];
      if (!serviceConfig || !serviceConfig[tier]) continue;
      tools.push(...serviceConfig[tier]);
    }
    return tools;
  }

  async getToolsUpToTier(tier: TierLevel, services?: string[]): Promise<string[]> {
    const tiers: TierLevel[] = ['core', 'extended', 'complete'];
    const maxIndex = tiers.indexOf(tier);
    const tools: string[] = [];
    for (let i = 0; i <= maxIndex; i += 1) {
      tools.push(...(await this.getToolsForTier(tiers[i], services)));
    }
    return Array.from(new Set(tools));
  }

  async getServicesForTools(toolNames: string[]): Promise<string[]> {
    const config = await this.loadConfig();
    const services = new Set<string>();
    for (const [service, tiers] of Object.entries(config)) {
      for (const tools of Object.values(tiers)) {
        if (tools?.some((tool) => toolNames.includes(tool))) {
          services.add(service);
          break;
        }
      }
    }
    return Array.from(services).sort();
  }
}

function resolveToolTiersPath(configPath?: string): string {
  const modulePath = path.resolve(__dirname, '..', '..', 'core', 'tool_tiers.yaml');
  const cwdPath = path.resolve(process.cwd(), 'core', 'tool_tiers.yaml');
  const srcPath = path.resolve(process.cwd(), 'src', 'core', 'tool_tiers.yaml');
  const envPath = process.env.WORKSPACE_MCP_TOOL_TIERS_PATH;
  const candidatePaths = [configPath, envPath, cwdPath, srcPath, modulePath].filter(
    (value): value is string => Boolean(value),
  );
  for (const candidate of candidatePaths) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return modulePath;
}

export async function resolveToolsFromTier(
  tier: TierLevel,
  services?: string[],
): Promise<{ tools: string[]; serviceNames: string[] }> {
  const loader = new ToolTierLoader();
  const tools = await loader.getToolsUpToTier(tier, services);
  const serviceNames = await loader.getServicesForTools(tools);
  logger.info(`Tool tier '${tier}' resolved to ${tools.length} tools across ${serviceNames.length} services.`);
  return { tools, serviceNames };
}
