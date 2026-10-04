# Ken Great Rewiring — Finance Decision Mock MCP

Competition mock MCP server for the Pine Labs AgenticOrg build.

Endpoint:
`/api/mcp`

Tools:
- `get_financial_context` — read-only transactions, mandates and derived signals.
- `manage_payment` — controlled HOLD / RELEASE / CANCEL state transition with failure scenarios.

This is a competition mock, not a production Pine Labs API.

The server uses the official MCP TypeScript SDK v2 and exposes a Vercel-compatible callable default export that forwards to the SDK's web-standard `fetch` handler.
