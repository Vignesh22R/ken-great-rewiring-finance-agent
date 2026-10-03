# Ken Great Rewiring — Finance Decision MCP Mock

Competition mock MCP server for the Pine Labs AgenticOrg build.

Endpoints: `/mcp` and `/api/mcp` (both rewrite to the Vercel function).

Tools:
- `get_financial_context` — read-only financial context and controlled failure scenarios.
- `manage_payment` — hold/release/cancel with explicit-hold gating and controlled failure scenarios.
