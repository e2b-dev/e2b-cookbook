import { test } from '@e2e-dev/mobile';
import { beforeEach, describe, expect } from 'e2e';

const APP_ID = 'org.secuso.privacyfriendly2048';
const DIRECTIONS = ['left', 'down', 'right', 'up'] as const;
const MAX_SWIPES = 12;

describe('2048 on Android', { platforms: ['android'] }, () => {
  // Both tests share one sandbox, so each one starts from a fresh install state.
  beforeEach(async ({ app }) => {
    await app.clearState();
  });

  test('scripted swipes change the score', async ({ app, screen }) => {
    await screen.getByRole('button', 'SKIP').click();
    await screen.getByRole('button', 'START NEW GAME').click();

    const board = screen.getByTestId(`${APP_ID}:id/touch_field`);
    const points = screen.getByTestId(`${APP_ID}:id/points`);
    await expect(points).toHaveText('0');

    // The start tiles are random, so swipe until two tiles merge.
    for (let swipe = 0; swipe < MAX_SWIPES && (await points.textContent()) === '0'; swipe++) {
      await board.swipe({ direction: DIRECTIONS[swipe % DIRECTIONS.length]!, momentum: 'fast' });
    }

    await expect(points).not.toHaveText('0');
    await app.screenshot('2048-board');
  });

  test('an agent plays from a goal', async ({ agent, screen }) => {
    test.skip(!process.env.ANTHROPIC_API_KEY, 'set ANTHROPIC_API_KEY to run the agent tests');

    await agent.act('Skip the tutorial, start a new game, and swipe the board until the score is above 0.');

    // The agent acts, and a plain assertion checks the result.
    await expect(screen.getByTestId(`${APP_ID}:id/points`)).not.toHaveText('0');
  });
});
