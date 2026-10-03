import { toNodeHandler } from "@modelcontextprotocol/node";
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

type PaymentStatus = "PENDING" | "HELD" | "RELEASED" | "CANCELLED";

const mandates = [
  {
    mandate_id: "MANDATE_NETFLIX_001",
    merchant: "Netflix",
    amount: 649,
    currency: "INR",
    frequency: "MONTHLY",
    next_renewal_at: "2026-10-04T10:00:00+05:30",
    last_used_at: "2026-07-02T20:10:00+05:30",
    status: "ACTIVE",
    category: "ENTERTAINMENT",
  },
  {
    mandate_id: "MANDATE_SPOTIFY_002",
    merchant: "Spotify",
    amount: 119,
    currency: "INR",
    frequency: "MONTHLY",
    next_renewal_at: "2026-10-04T09:00:00+05:30",
    last_used_at: "2026-10-01T21:30:00+05:30",
    status: "ACTIVE",
    category: "ENTERTAINMENT",
  },
  {
    mandate_id: "MANDATE_DEMAT_003",
    merchant: "Demat AMC",
    amount: 590,
    currency: "INR",
    frequency: "ANNUAL",
    next_renewal_at: "2026-10-05T11:00:00+05:30",
    last_used_at: "2025-10-03T11:00:00+05:30",
    status: "ACTIVE",
    category: "FINANCIAL_SERVICES",
  },
];

const transactions = [
  {
    transaction_id: "TXN_1001",
    timestamp: "2026-10-03T13:12:00+05:30",
    merchant: "Apple Store",
    amount: 38500,
    currency: "INR",
    category: "ELECTRONICS",
    type: "DISCRETIONARY",
    status: "PENDING",
  },
  {
    transaction_id: "TXN_1002",
    timestamp: "2026-10-03T14:30:00+05:30",
    merchant: "Swiggy",
    amount: 1200,
    currency: "INR",
    category: "FOOD",
    type: "DISCRETIONARY",
    status: "COMPLETED",
  },
];

// Module-level state intentionally survives across warm Vercel invocations.
// It is demo state only; production would use a durable payment-state store.
const paymentState = new Map<string, PaymentStatus>();

const result = (data: unknown, isError = false) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  isError,
});

function buildServer(): McpServer {
  const server = new McpServer(
    { name: "ken-finance-mock", version: "1.1.0" },
    { capabilities: { tools: {} } },
  );

  server.registerTool(
    "get_financial_context",
    {
      title: "Get Financial Context",
      description:
        "READ ONLY: returns recent UPI transactions, active payment mandates, upcoming renewals and derived usage signals. Use before deciding whether intervention is warranted. Supports controlled evaluation failures.",
      inputSchema: z.object({
        user_id: z.string().default("USER_001"),
        scenario: z
          .enum(["NORMAL", "NO_MANDATES", "TIMEOUT", "MALFORMED_RESPONSE"])
          .default("NORMAL"),
      }),
    },
    async ({ user_id, scenario }) => {
      if (scenario === "TIMEOUT") {
        // Deliberately return a deterministic timeout error instead of sleeping
        // past Vercel's function-duration limit.
        return result(
          {
            user_id,
            error: "FINANCIAL_CONTEXT_TIMEOUT",
            retryable: true,
            message: "Financial data source timed out before returning a valid response.",
          },
          true,
        );
      }

      if (scenario === "MALFORMED_RESPONSE") {
        return result(
          {
            user_id,
            transactions: "INVALID_EXPECTED_ARRAY",
            active_mandates: null,
            corrupted: true,
          },
          true,
        );
      }

      return result({
        user_id,
        generated_at: new Date().toISOString(),
        transactions,
        active_mandates: scenario === "NO_MANDATES" ? [] : mandates,
        derived_signals: {
          large_purchase_threshold_inr: 10000,
          dormant_days_threshold: 60,
          notes: [
            "Old does not mean wasteful; evaluate usage.",
            "Evaluate renewal timing and recent usage before prompting.",
            "Obtain a live human decision before release or cancellation.",
          ],
        },
      });
    },
  );

  server.registerTool(
    "manage_payment",
    {
      title: "Manage Payment Decision",
      description:
        "WRITE: changes a pending payment state. Supported actions HOLD, RELEASE, CANCEL. RELEASE and CANCEL require the payment to be HELD first. Supports controlled evaluation failures.",
      inputSchema: z.object({
        payment_id: z.string(),
        action: z.enum(["HOLD", "RELEASE", "CANCEL"]),
        scenario: z
          .enum([
            "NORMAL",
            "ALREADY_PROCESSED",
            "INSUFFICIENT_BALANCE",
            "TIMEOUT",
            "MALFORMED_RESPONSE",
          ])
          .default("NORMAL"),
      }),
    },
    async ({ payment_id, action, scenario }) => {
      if (scenario === "TIMEOUT") {
        return result(
          {
            payment_id,
            error: "PAYMENT_RAIL_TIMEOUT",
            retryable: true,
            action,
            message: "Payment rail timed out before confirming the requested state change.",
          },
          true,
        );
      }

      if (scenario === "MALFORMED_RESPONSE") {
        return result(
          {
            payment_id,
            status: { unexpected: "MALFORMED" },
            action,
            corrupted: true,
          },
          true,
        );
      }

      if (scenario === "ALREADY_PROCESSED") {
        return result(
          {
            payment_id,
            status: "ALREADY_PROCESSED",
            action,
            message: "The payment can no longer be safely held or changed.",
          },
          true,
        );
      }

      if (scenario === "INSUFFICIENT_BALANCE" && action === "RELEASE") {
        return result(
          {
            payment_id,
            status: "FAILED",
            reason: "INSUFFICIENT_BALANCE",
            action,
          },
          true,
        );
      }

      const current = paymentState.get(payment_id) ?? "PENDING";

      if (action === "HOLD") {
        if (current === "RELEASED" || current === "CANCELLED") {
          return result(
            {
              payment_id,
              status: current,
              action,
              message: "Payment is no longer mutable.",
            },
            true,
          );
        }

        paymentState.set(payment_id, "HELD");
        return result({
          payment_id,
          previous_status: current,
          status: "HELD",
          action: "HOLD",
          message: "Payment is held pending an explicit user decision.",
        });
      }

      if (current !== "HELD") {
        return result(
          {
            payment_id,
            status: "REJECTED",
            action,
            reason: "EXPLICIT_HOLD_REQUIRED",
            message: "A payment must be HELD before RELEASE or CANCEL.",
          },
          true,
        );
      }

      if (action === "RELEASE") {
        paymentState.set(payment_id, "RELEASED");
        return result({
          payment_id,
          previous_status: "HELD",
          status: "RELEASED",
          action: "RELEASE",
          message: "Payment released after explicit user approval.",
        });
      }

      paymentState.set(payment_id, "CANCELLED");
      return result({
        payment_id,
        previous_status: "HELD",
        status: "CANCELLED",
        action: "CANCEL",
        message: "Payment cancelled after explicit user rejection.",
      });
    },
  );

  return server;
}

// AgenticOrg needs a normal remote MCP HTTP endpoint. Vercel's /api/*.ts
// runtime is Node-based, so adapt the web-standard MCP handler to Node once.
const mcpHandler = createMcpHandler(buildServer, {
  responseMode: "json",
  keepAliveMs: 0,
});

const nodeHandler = toNodeHandler(mcpHandler);

export default nodeHandler;

export const maxDuration = 60;
