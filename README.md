# Ken's Great Rewiring — Finance Mock MCP

Two custom capabilities are exposed:

1. `get_financial_context` (READ): transactions, active mandates, upcoming renewals, usage signals.
2. `manage_payment` (WRITE): HOLD, RELEASE, CANCEL. RELEASE/CANCEL require HELD first.

Controlled failures are included for evals: timeout, malformed response, already processed, insufficient balance, and no mandates.

The third custom capability slot is intentionally reserved for the Gnani integration if required.

## Local
npm install
npm run typecheck
npm run dev

MCP endpoint: http://localhost:3000/mcp

## Vercel
Import this repo into Vercel. After deployment use:
https://YOUR-PROJECT.vercel.app/mcp

In AgenticOrg: Custom / Generic Connector -> MCP enabled -> Finance -> Auth None unless the competition requires authentication.

This is a competition mock of missing capabilities, not a live Pine Labs production API.
