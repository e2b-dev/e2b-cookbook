import 'dotenv/config';
import Sandbox from 'e2b';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

// Where the MCP server keeps the inbox credentials inside the sandbox.
const CREDENTIALS_DIR = '/root/.atomicmail';

// Atomic Mail usernames are the local part of an @atomicmail.ai address and
// must be 5–21 characters. Generate a random one so repeated runs don't collide.
function randomUsername(): string {
  const suffix = Math.random().toString(36).slice(2, 8);
  return `e2b-agent-${suffix}`; // e.g. "e2b-agent-k3f9zq" (16 chars)
}

// MCP tool results carry an array of content blocks; join the text ones.
function toolText(result: CallToolResult): string {
  return (result.content ?? [])
    .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
    .map((block) => block.text)
    .join('\n');
}

async function callTool(
  client: Client,
  name: string,
  args: Record<string, unknown>,
): Promise<{ result: CallToolResult; text: string }> {
  const result = (await client.callTool({ name, arguments: args })) as CallToolResult;
  const text = toolText(result);
  if (result.isError) {
    throw new Error(`Tool "${name}" failed:\n${text}`);
  }
  return { result, text };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function run() {
  if (!process.env.E2B_API_KEY) {
    throw new Error('E2B_API_KEY is not set. Copy env.template to .env and fill it in.');
  }

  const username = process.env.ATOMIC_MAIL_USERNAME || randomUsername();

  console.log('Creating E2B sandbox with the Atomic Mail MCP server...');

  // Atomic Mail ships a stdio MCP server on npm as `@atomicmail/mcp`. E2B's MCP
  // gateway runs it inside the sandbox and exposes it over authenticated HTTP.
  // No Atomic Mail API key is needed — the agent signs itself up with a
  // proof-of-work challenge (no human, no CAPTCHA).
  const sandbox = await Sandbox.create({
    mcp: {
      'github/Atomic-Mail/atomic-mail-agentic': {
        runCmd: 'npx -y @atomicmail/mcp',
        envs: {
          ATOMIC_MAIL_CREDENTIALS_DIR: CREDENTIALS_DIR,
          ATOMICMAIL_UTM: 'utm_source=e2b&utm_medium=cookbook&utm_campaign=mcp-example',
        },
      },
    },
    timeoutMs: 600_000, // 10 minutes
  });

  try {
    console.log('Sandbox created successfully');
    console.log(`MCP URL: ${sandbox.getMcpUrl()}`);

    // Connect an MCP client to the sandbox gateway.
    const client = new Client({ name: 'e2b-atomicmail-client', version: '1.0.0' });
    const transport = new StreamableHTTPClientTransport(new URL(sandbox.getMcpUrl()), {
      requestInit: {
        headers: {
          Authorization: `Bearer ${await sandbox.getMcpToken()}`,
        },
      },
    });

    console.log('Connecting to the Atomic Mail MCP server...');
    await client.connect(transport);
    console.log('Connected successfully');

    // List the tools the server exposes: register, jmap_request, help.
    const { tools } = await client.listTools();
    console.log('\nAvailable Atomic Mail tools:');
    tools.forEach((tool, i) => {
      console.log(`  ${i + 1}. ${tool.name}${tool.description ? ` — ${tool.description.split('\n')[0]}` : ''}`);
    });

    // 1. Register a brand-new inbox via proof-of-work signup (~30s, no human).
    console.log(`\nRegistering inbox for "${username}" (proof-of-work signup)...`);
    const { text: registerText } = await callTool(client, 'register', { username });

    let inbox = '';
    try {
      const parsed = JSON.parse(registerText);
      inbox =
        typeof parsed.inbox === 'string'
          ? parsed.inbox
          : parsed.inbox?.email ?? parsed.address ?? '';
    } catch {
      /* fall back to regex below */
    }
    if (!inbox) {
      inbox = registerText.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i)?.[0] ?? '';
    }
    if (!inbox) {
      throw new Error(`Could not determine inbox address from register response:\n${registerText}`);
    }
    console.log(`Inbox registered: ${inbox}`);

    // The agent owns this inbox end to end. By default we send a message to
    // ourselves so the example can also demonstrate *receiving*. Set
    // RECIPIENT_EMAIL to send to a real person instead (send-only in that case).
    const recipient = process.env.RECIPIENT_EMAIL || inbox;
    const isSelfSend = recipient.toLowerCase() === inbox.toLowerCase();

    // A unique marker so we can spot exactly this message when polling.
    const marker = Math.random().toString(36).slice(2, 8).toUpperCase();
    const subject = `Hello from an E2B sandbox agent [${marker}]`;
    const body =
      'This email was sent by an autonomous agent running in an E2B sandbox.\n' +
      'It registered its own @atomicmail.ai inbox via proof-of-work and sent this over JMAP — ' +
      'no human, no CAPTCHA, no API key.';

    // 2. Send mail using the bundled `send_mail` preset. Placeholders $ACCOUNT_ID,
    //    $INBOX and $INBOX_MAILBOX_ID come from the session; TO/SUBJECT/BODY are
    //    supplied via `vars`.
    console.log(`\nSending mail to ${recipient}...`);
    await callTool(client, 'jmap_request', {
      ops_file: 'send_mail.json',
      vars: { TO: recipient, SUBJECT: subject, BODY: body },
    });
    console.log('Mail submitted');

    if (!isSelfSend) {
      console.log(
        `\nSent to an external address (${recipient}); skipping inbox polling ` +
          `since we can only read our own mailbox.`,
      );
    } else {
      // 3. Poll the inbox with the bundled `list_inbox` preset until the message
      //    loops back to us.
      console.log('\nPolling the inbox for the message to arrive...');
      let delivered = false;
      for (let attempt = 1; attempt <= 10 && !delivered; attempt++) {
        await sleep(6000);
        const { text } = await callTool(client, 'jmap_request', { ops_file: 'list_inbox.json' });

        let emails: Array<{ subject?: string; from?: Array<{ email?: string }>; preview?: string }> = [];
        try {
          const parsed = JSON.parse(text);
          const methodResponses = parsed.methodResponses ?? parsed.responses ?? [];
          const getResponse = methodResponses.find((m: unknown[]) => m[0] === 'Email/get');
          emails = getResponse?.[1]?.list ?? [];
        } catch {
          /* ignore parse errors between eventual-consistency reads */
        }

        const match = emails.find((email) => email.subject?.includes(marker));
        if (match) {
          delivered = true;
          console.log(`\nReceived after ${attempt} poll(s):`);
          console.log(`  From:    ${match.from?.[0]?.email ?? inbox}`);
          console.log(`  Subject: ${match.subject}`);
          if (match.preview) console.log(`  Preview: ${match.preview}`);
          console.log(`\nInbox now holds ${emails.length} message(s).`);
        } else {
          console.log(`  attempt ${attempt}/10 — not delivered yet (${emails.length} message(s) in inbox)`);
        }
      }

      if (!delivered) {
        console.log(
          '\nMessage not observed within the polling window. Delivery can lag briefly; ' +
            'the send itself succeeded.',
        );
      }
    }

    console.log('\nDone.');
  } finally {
    console.log('\nCleaning up sandbox...');
    await sandbox.kill();
    console.log('Sandbox closed successfully');
  }
}

run().catch((error) => {
  console.error('Failed to run Atomic Mail example:', error);
  process.exit(1);
});
