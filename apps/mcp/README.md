# @buildtogether/mcp — Cue MCP server

A local, **read-only** [Model Context Protocol](https://modelcontextprotocol.io) server that lets
any MCP client (Claude Code, Claude Desktop, Cursor, …) read your Cue execution intelligence. The
model on your side does the reasoning; Cue only serves its deterministic, evidence-backed signals.

| Tool                   | Returns                                                                 |
| ---------------------- | ----------------------------------------------------------------------- |
| `list_workspaces`      | Workspaces you belong to                                                |
| `list_projects`        | Projects you can see in a workspace                                     |
| `project_intelligence` | Health + factors, blockers, risks, next best actions, decision impact   |
| `my_focus`             | Your overdue / upcoming / blocked / awaiting-review work + next actions |

No tool writes anything. The API enforces this too: an API key is accepted **only** on these four
`GET` routes, and every request still runs your normal workspace membership checks.

## Setup

1. **Enable API keys** in the Clerk dashboard (Configure → API keys) for the Cue application.
2. **Create a key** for your user (Clerk's `<APIKeys />` component, or the dashboard). Treat it like
   a password; revoke it in Clerk to cut access.
3. **Build** the server: `pnpm --filter @buildtogether/mcp build`.
4. **Register** it with your client. Claude Code:

   ```bash
   claude mcp add cue --env CUE_API_URL=https://api.your-domain.com --env CUE_API_KEY=<key> -- node /absolute/path/to/apps/mcp/dist/index.js
   ```

   Generic JSON config (Claude Desktop, Cursor):

   ```json
   {
     "mcpServers": {
       "cue": {
         "command": "node",
         "args": ["/absolute/path/to/apps/mcp/dist/index.js"],
         "env": { "CUE_API_URL": "https://api.your-domain.com", "CUE_API_KEY": "<key>" }
       }
     }
   }
   ```

`CUE_API_URL` must be `https` (plain `http` is allowed only for `localhost`, e.g.
`http://localhost:4000` against `pnpm --filter @buildtogether/api dev`).

## Tests

`pnpm --filter @buildtogether/mcp test` drives the real MCP server through an in-memory client with
a fake API: tool list and read-only hints, URL + `Bearer` key, error mapping, and path-injection
rejection.
