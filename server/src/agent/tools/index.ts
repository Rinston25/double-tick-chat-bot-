import { zodToJsonSchema } from 'zod-to-json-schema';
import { toolErr, type ToolResult } from '../../utils/errors.js';
import { createContactTool } from './createContact.js';
import { createLeadTool } from './createLead.js';
import { createServiceCaseTool } from './createServiceCase.js';
import { findCustomerTool } from './findCustomer.js';
import { getBookingStatusTool } from './getBookingStatus.js';
import { getDealStatusTool } from './getDealStatus.js';
import { getServiceScheduleTool } from './getServiceSchedule.js';
import { getVehicleInfoTool } from './getVehicleInfo.js';
import { updateDealFollowupTool } from './updateDealFollowup.js';
import type { ToolContext, ToolDefinition } from './types.js';

export const TOOLS: ToolDefinition<unknown, unknown>[] = [
  getVehicleInfoTool,
  findCustomerTool,
  createLeadTool,
  getDealStatusTool,
  updateDealFollowupTool,
  getBookingStatusTool,
  getServiceScheduleTool,
  createServiceCaseTool,
  createContactTool,
] as unknown as ToolDefinition<unknown, unknown>[];

const toolsByName = new Map(TOOLS.map((t) => [t.name, t]));

/** JSON-schema tool specs in Groq/OpenAI function-calling format, sent to the LLM every turn. */
export function getToolSpecsForLLM(): Array<{
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}> {
  return TOOLS.map((tool) => {
    const jsonSchema = zodToJsonSchema(tool.schema, { target: 'openApi3' }) as Record<
      string,
      unknown
    >;
    delete jsonSchema.$schema;
    return {
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: jsonSchema,
      },
    };
  });
}

/**
 * Validates the raw (LLM-supplied) args against the tool's zod schema and
 * runs it. Never throws — parse failures and unknown tool names come back
 * as a normal ok:false ToolResult so the orchestrator can feed the error
 * back to the model as a tool message.
 */
export async function runTool(
  name: string,
  rawArgs: unknown,
  ctx: ToolContext,
): Promise<ToolResult<unknown>> {
  const tool = toolsByName.get(name);
  if (!tool) {
    return toolErr(
      'UNKNOWN_TOOL',
      `No tool named "${name}" is registered.`,
      'Do not call this tool again; pick one of the available tools.',
    );
  }

  const parsed = tool.schema.safeParse(rawArgs);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ');
    return toolErr(
      'INVALID_ARGS',
      `Invalid arguments for ${name}: ${issues}`,
      'Re-check the required fields and call the tool again with corrected arguments.',
    );
  }

  try {
    return await tool.execute(parsed.data, ctx);
  } catch (err) {
    ctx.logger.error(
      { tool: name, err: err instanceof Error ? err.message : err },
      'Tool execution threw unexpectedly',
    );
    return toolErr(
      'TOOL_EXECUTION_ERROR',
      `${name} failed unexpectedly.`,
      'Apologize briefly and offer to try again in a moment.',
    );
  }
}

export function listToolNames(): string[] {
  return TOOLS.map((t) => t.name);
}

export type { ToolContext } from './types.js';
