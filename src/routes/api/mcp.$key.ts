import { createFileRoute } from "@tanstack/react-router";

const JSON_HEADERS = { "Content-Type": "application/json" };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

export const Route = createFileRoute("/api/mcp/$key")({
  server: {
    handlers: {
      GET: async () => new Response("Method Not Allowed", { status: 405 }),
      DELETE: async () => new Response("Method Not Allowed", { status: 405 }),
      POST: async ({ request, params }) => {
        const { authenticate, handleRpc, rpcError } = await import(
          "@/lib/mcp/storyforge-mcp.server"
        );

        const header = request.headers.get("authorization");
        const bearer = header?.toLowerCase().startsWith("bearer ")
          ? header.slice(7).trim()
          : null;
        const rawKey = params.key && params.key !== "key" ? params.key : bearer;

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return json(rpcError(null, -32700, "Parse error"), 400);
        }

        const ctx = await authenticate(rawKey ?? bearer);
        if (!ctx) {
          const id = (body as { id?: unknown } | null)?.id ?? null;
          return json(rpcError(id, -32001, "Unauthorized: invalid or missing API key"), 401);
        }

        if (Array.isArray(body)) {
          const out: unknown[] = [];
          for (const msg of body) {
            const res = await handleRpc(msg, ctx);
            if (res) out.push(res);
          }
          return out.length ? json(out) : new Response(null, { status: 202 });
        }

        const res = await handleRpc(body as never, ctx);
        if (!res) return new Response(null, { status: 202 });
        return json(res);
      },
    },
  },
});
