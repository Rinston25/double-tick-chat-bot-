import type { z } from 'zod';
import type { ZohoClient } from '../../zoho/client.js';
import type { ToolResult } from '../../utils/errors.js';
import type { AppLogger } from '../../utils/logger.js';

export interface ToolContext {
  zohoClient: ZohoClient;
  logger: AppLogger;
  sessionId: string;
}

export interface ToolDefinition<Args = unknown, Data = unknown> {
  name: string;
  description: string;
  schema: z.ZodType<Args>;
  /** Tool implementations never throw — every failure path resolves ok:false. */
  execute: (args: Args, ctx: ToolContext) => Promise<ToolResult<Data>>;
}

export function defineTool<Args, Data>(
  def: ToolDefinition<Args, Data>,
): ToolDefinition<Args, Data> {
  return def;
}
