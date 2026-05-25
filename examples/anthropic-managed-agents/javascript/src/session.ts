import Anthropic from "@anthropic-ai/sdk";

function isEndTurn(event: { type?: string; stop_reason?: { type?: string } | null }) {
  return event.type === "session.status_idle" && event.stop_reason?.type === "end_turn";
}

export async function streamMessage({
  apiKey,
  agentId,
  environmentId,
  message,
}: {
  apiKey: string;
  agentId: string;
  environmentId: string;
  message: string;
}) {
  const client = new Anthropic({ apiKey });
  const session = await client.beta.sessions.create({
    agent: agentId,
    environment_id: environmentId,
  });
  console.log(`session=${session.id}`);

  const stream = await client.beta.sessions.events.stream(session.id);
  await client.beta.sessions.events.send(session.id, {
    events: [
      {
        type: "user.message",
        content: [{ type: "text", text: message }],
      },
    ],
  });

  for await (const event of stream) {
    console.log(JSON.stringify(event));
    if (isEndTurn(event)) {
      break;
    }
  }
}
