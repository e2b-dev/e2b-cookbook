import 'dotenv/config';
import OpenAI from 'openai';
import { Sandbox } from '@e2b/sdk';
import { MessageContentText } from 'openai/resources/beta/threads';
import { listFiles, readFile, saveContentToFile } from './actions';

const openai = new OpenAI();
const AI_ASSISTANT_ID = process.env.AI_ASSISTANT_ID!;

function sleep(time: number) {
  return new Promise(resolve => setTimeout(resolve, time));
}

(async () => {
  const sandbox = await Sandbox.create({
    onStdout: console.log,
    onStderr: console.error,
  });

  sandbox.addAction(readFile).addAction(saveContentToFile).addAction(listFiles);

  const task =
    'Write a function that takes a list of strings and returns the longest string in the list.';

  const thread = await openai.beta.threads.create({
    messages: [
      {
        role: 'user',
        content: `Carefully plan this task and start working on it: ${task}`,
      },
    ],
  });

  const assistant = await openai.beta.assistants.retrieve(AI_ASSISTANT_ID);
  let run = await openai.beta.threads.runs.create(thread.id, {
    assistant_id: assistant.id,
  });

  assistantLoop: while (true) {
    await sleep(1000);

    console.log('Assistant is currently in status:', run.status);
    switch (run.status) {
      case 'requires_action': {
        const outputs = await sandbox.openai.actions.run(run);

        if (outputs.length > 0) {
          await openai.beta.threads.runs.submitToolOutputs(thread.id, run.id, {
            tool_outputs: outputs,
          });
        }

        break;
      }
      case 'completed': {
        const messages = await openai.beta.threads.messages.list(thread.id);
        const textMessages = messages.data[0].content.filter(
          (message: MessageContentText) => message.type === 'text',
        ) as MessageContentText[];
        console.log('Thread finished:', textMessages[0].text.value);
        break assistantLoop;
      }
      case 'queued':
      case 'in_progress':
        break;
      case 'cancelled':
      case 'cancelling':
      case 'expired':
      case 'failed':
        break assistantLoop;
      default:
        console.error(`Unknown status: ${run.status}`);
        break assistantLoop;
    }

    run = await openai.beta.threads.runs.retrieve(thread.id, run.id);
  }

  await sandbox.close();
})();
