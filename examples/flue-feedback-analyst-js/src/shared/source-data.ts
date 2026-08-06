import { readFileSync } from 'node:fs';
import { defineSkill } from '@flue/runtime';

/**
 * The agent's data (instructions.md, skills/, examples/) sits at the project
 * root — copied verbatim from the downloaded product-feedback-synthesizer
 * bundle, same content the sibling vercel-eve-feedback-analyst-js carries.
 * Read at runtime so there is exactly one copy inside this project.
 */
const bundleRoot = new URL('../../', import.meta.url);

const read = (relativePath: string) => readFileSync(new URL(relativePath, bundleRoot), 'utf8');

export const MODEL = 'anthropic/claude-sonnet-5';

export const instructions = read('instructions.md');

/**
 * The upstream skill file carries Eve-style frontmatter (a bare
 * `description`, no `name`), so it can't be imported as a SKILL.md directly —
 * `defineSkill` writes spec-compliant frontmatter around the same body.
 */
const playbookSource = read('skills/product-feedback-synthesizer.md');
const frontmatter = /^---\n([\s\S]*?)\n---\n/.exec(playbookSource);

export const playbook = defineSkill({
	name: 'product-feedback-synthesizer',
	description:
		frontmatter?.[1].replace(/^description:\s*/, '').trim() ??
		'Apply the Product Feedback Synthesizer workflow.',
	instructions: playbookSource.slice(frontmatter?.[0].length ?? 0).trim(),
});
