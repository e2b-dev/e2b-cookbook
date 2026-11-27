import { describe, expect, test } from 'e2e';

const ARTICLE = 'Firecracker (software)';

describe('Wikipedia in Chromium', { platforms: ['web'] }, () => {
  test('a scripted search opens the article', async ({ app, screen }) => {
    await app.open('/wiki/Main_Page');
    // A search for an exact title opens the article directly.
    await screen.getByRole('searchbox', /search wikipedia/i).fill(ARTICLE);
    await screen.getByRole('button', 'Search').click();

    await expect(screen.getByRole('heading', { name: ARTICLE, level: 1 })).toBeVisible();
  });

  test('an agent finds the article from a goal', async ({ agent, app, screen }) => {
    test.skip(!process.env.ANTHROPIC_API_KEY, 'set ANTHROPIC_API_KEY to run the agent tests');

    await app.open('/wiki/Main_Page');
    await agent.act(`Search Wikipedia for "${ARTICLE}" and open that article.`);

    // The agent acts, and a plain assertion checks the result.
    await expect(screen.getByRole('heading', { name: ARTICLE, level: 1 })).toBeVisible();
  });
});
