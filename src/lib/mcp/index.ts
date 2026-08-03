import { auth, defineMcp, defineTool, ToolError } from "@lovable.dev/mcp-js";
import type { ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

import { TOOLS, type Ctx } from "@/lib/mcp/storyforge-mcp.server";
import { supabaseForUser } from "@/lib/mcp/supabase";

/* ------------------------------------------------------------------
 * The tool catalogue, handlers and every ownership check stay exactly as
 * they are in storyforge-mcp.server.ts. This module only changes the
 * transport (Lovable MCP SDK) and the auth source (validated Supabase
 * OAuth token instead of an api_keys row).
 * ---------------------------------------------------------------- */

type JsonSchema = {
  type?: string;
  enum?: readonly string[];
  items?: JsonSchema;
  properties?: Record<string, JsonSchema>;
  required?: readonly string[];
};

/** Mirrors the existing hand-written JSON Schemas as zod shapes. */
function toZod(node: JsonSchema): z.ZodTypeAny {
  if (node.enum?.length) return z.enum([...node.enum] as [string, ...string[]]);
  switch (node.type) {
    case "string":
      return z.string();
    case "number":
      return z.number();
    case "boolean":
      return z.boolean();
    case "array":
      return z.array(node.items ? toZod(node.items) : z.unknown());
    case "object":
      return node.properties
        ? z.object(
            Object.fromEntries(
              Object.entries(node.properties).map(([k, v]) => [
                k,
                node.required?.includes(k) ? toZod(v) : toZod(v).optional(),
              ]),
            ),
          )
        : z.record(z.string(), z.unknown());
    default:
      return z.unknown();
  }
}

function toShape(schema: Record<string, unknown>): Record<string, z.ZodTypeAny> {
  const s = schema as JsonSchema;
  return Object.fromEntries(
    Object.entries(s.properties ?? {}).map(([key, prop]) => [
      key,
      s.required?.includes(key) ? toZod(prop) : toZod(prop).optional(),
    ]),
  );
}

/**
 * The user id is the `sub` claim of the validated `authenticated` Supabase
 * token. Without it the request fails — never a service-role fallback.
 */
function contextFor(ctx: ToolContext): Ctx {
  if (!ctx.isAuthenticated()) throw new ToolError("Not authenticated");
  const userId = ctx.getUserId();
  if (!userId) throw new ToolError("Could not resolve the authenticated user for this request");
  return { db: supabaseForUser(ctx), userId };
}

const tools = TOOLS.map((tool) =>
  defineTool({
    name: tool.name,
    title: tool.name,
    description: tool.description,
    inputSchema: toShape(tool.inputSchema),
    handler: async (input: unknown, ctx: ToolContext) => {
      try {
        const result = await tool.handler(
          contextFor(ctx),
          (input ?? {}) as Record<string, unknown>,
        );
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return {
          content: [{ type: "text" as const, text: e instanceof Error ? e.message : String(e) }],
          isError: true,
        };
      }
    },
  }),
);

// The OAuth issuer must be the direct Supabase host: the published runtime
// SUPABASE_URL is a proxy and would fail RFC 8414 issuer matching.
const projectRef = import.meta.env['VITE_SUPABASE_PROJECT_ID'] ?? "project-ref-unset";

export default defineMcp({
  name: "storyforge-canvas",
  title: "StoryForge Canvas",
  version: "1.0.0",
  instructions:
    "Read and write StoryForge production state: projects, sequences, scenes, beats, shots, cast, locations, elements, looks, references, canon and generation history. Start with get_project_overview to orient, and get_context_package to compile a shot's full generation context.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools,
});
