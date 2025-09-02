import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import axios from "axios";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


dotenv.config({ path: path.join(__dirname, "../src/.env") });


const BASE_URL = process.env.UNIPILE_DSN;
if (!BASE_URL) {
  console.error("❌ Missing UNIPILE_DSN in .env");
  process.exit(1);
}


const server = new McpServer({
  name: "UNIPILE",
  version: "1.0.0",
  capabilities: { tools: {}, resources: {} },
});


//Tools
server.tool("unipile_list_all_accounts", "List all messaging accounts connected to Unipile", {}, async (_input: any, context: any) => {
  const apiKey = context?.selected_server_credentials?.UNIPILE?.accessToken || process.env.UNIPILE_API_KEY;
  if (!apiKey) {
    return {
      content: [{ type: "text", text: "❌ Missing Unipile API Key (set in .env or payload)" }],
      isError: true,
    };
  }
  try {
    const response = await axios.get(`${BASE_URL}/accounts`, {
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
      },
    });
    const rawData = response.data?.items || response.data?.accounts || response.data?.data || [];
    const accounts = Array.isArray(rawData) ? rawData : [];
    const formatted = accounts.map((acc: any) => ({
      id: acc.id ?? "Unknown",
      name: acc.name ?? acc.label ?? acc.email ?? acc.type ?? "Unknown",
      email: acc.email ?? "N/A",
      type: acc.type ?? "Unknown",
      provider: acc.provider ?? "Unknown",
      status: acc.status ?? "Unknown",
    }));
    const text = JSON.stringify(formatted.length ? formatted : { message: "No accounts found." }, null, 2);
    return {
      content: [{ type: "text", text }],
    };
  } catch (err: any) {
    const msg = err.response?.data?.message || err.message || "Unknown error";
    const status = err.response?.status || "Unknown";
    return {
      content: [{ type: "text", text: `❌ Failed to list accounts (Status: ${status}): ${msg}` }],
      isError: true,
    };
  }
});


server.tool(
  "unipile_get_gmail_emails",
  "Fetch recent emails from connected Gmail account (auto-detects account)",
  {
    maxResults: { type: "number", default: 10, description: "Maximum number of emails to retrieve" },
  },
  async (input: any, context: any) => {
    const apiKey = context?.selected_server_credentials?.UNIPILE?.accessToken || process.env.UNIPILE_API_KEY;
    if (!apiKey) {
      return {
        content: [{ type: "text", text: "❌ Missing Unipile API Key (set in .env or payload)" }],
        isError: true,
      };
    }

    try {
      // Step 1: Get all connected accounts
      const accountsRes = await axios.get(`${BASE_URL}/accounts`, {
        headers: {
          "x-api-key": apiKey,
          "Content-Type": "application/json",
        },
      });

      const allAccounts = accountsRes.data?.items || [];
      const gmailAcc = allAccounts.find((acc: any) =>
        acc.email?.includes("@gmail.com") && acc.type === "GOOGLE_OAUTH"
      );

      if (!gmailAcc) {
        return {
          content: [{ type: "text", text: "❌ No Gmail-compatible account found (GOOGLE_OAUTH type)." }],
          isError: true,
        };
      }

      // Step 2: Fetch recent emails
      const emailsRes = await axios.get(`${BASE_URL}/accounts/${gmailAcc.id}/messages`, {
        headers: {
          "x-api-key": apiKey,
          "Content-Type": "application/json",
        },
        params: {
          maxResults: input.maxResults || 10,
        },
      });

      const messages = emailsRes.data?.items || emailsRes.data?.messages || [];

      const formatted = messages.map((msg: any, i: number) => ({
        index: i + 1,
        id: msg.id,
        subject: msg.subject || "(no subject)",
        from: msg.from,
        snippet: msg.snippet,
        date: msg.date,
      }));

      const text = JSON.stringify(formatted.length ? formatted : { message: "No emails found." }, null, 2);

      return {
        content: [{ type: "text", text }],
      };
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || "Unknown error";
      const status = err.response?.status || "Unknown";
      return {
        content: [{ type: "text", text: `❌ Failed to fetch emails (Status: ${status}): ${msg}` }],
        isError: true,
      };
    }
  }
);



async function main() {
  try {
    const transport = new StdioServerTransport();
    await server.connect(transport);
  } catch (err: any) {
    console.error("❌ Fatal error:", err.message);
    process.exit(1);
  }
}


main().catch(err => {
  console.error("❌ Unhandled error:", err);
  process.exit(1);
});
