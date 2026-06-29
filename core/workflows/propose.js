export const meta = {
  name: 'propose',
  description:
    'Scaffold a new OpenSpec change from a free-text prompt — the github-agnostic front door to the pipeline. Computes the next cNNNN-<slug> ordinal, runs `node .claude/workflows/lib/openspec.js new change`, and drafts proposal.md (What/Why grounded in the prompt) following the openspec-propose skill. It does NOT review, link a ticket, or touch any task source — that separation is deliberate: /opsx:spec reviews, and /opsx:propose-gh (task-github extension) is the GitHub-linked variant that wraps this and binds an issue. Returns { change, proposalPath }. Flow: /opsx:propose <what> → /opsx:spec → /opsx:spec-pr → /opsx:ship-*.',
  phases: [
    { title: 'Scaffold', detail: 'compute cNNNN-<slug>, openspec new change, seed proposal.md from the prompt' },
  ],
}

// ---------------------------------------------------------------- args & safety
let A = typeof args === 'string' ? JSON.parse(args) : args
A = A || {}
const prompt = (A.prompt != null ? String(A.prompt) : '').trim() // free-text "what to build"
const title = (A.title != null ? String(A.title) : '').trim() // optional human title (e.g. an issue title)
const slug = A.slug // optional explicit kebab slug; otherwise derived from the title/prompt
const date = A.date // YYYY-MM-DD passed in (Date.now() unavailable in scripts)

if (!prompt && !title) throw new Error('propose requires args { prompt: "<what to build>", title?, slug?, date? }')
if (slug && !/^[a-z0-9][a-z0-9-]*$/.test(slug)) throw new Error('Unsafe slug (kebab-case): ' + slug)
if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Unsafe date (expected YYYY-MM-DD): ' + date)

const SKILL = (name) => `the \`${name}\` skill (.claude/skills/${name}/SKILL.md)`

// ---------------------------------------------------------------- schema
const SCAFFOLD = {
  type: 'object', additionalProperties: false, required: ['ok', 'reason'],
  properties: {
    ok: { type: 'boolean' }, reason: { type: 'string' },
    change: { type: 'string', description: 'the created cNNNN-<slug> change name' },
    proposalPath: { type: ['string', 'null'] },
  },
}

// ================================================================ Scaffold
phase('Scaffold')
const made = await agent(
  [
    `Scaffold a new OpenSpec change from this request, then seed its proposal. Use Bash. Apply ${SKILL('openspec-propose')} for the numbering + scaffolding conventions.`,
    `Request (what to build): ${JSON.stringify(prompt || title)}`,
    title && title !== prompt ? `Human title: ${JSON.stringify(title)}` : '',
    `1. Compute the next change name: the next cNNNN ordinal (ls -1d openspec/changes/c[0-9]* 2>/dev/null | sed -E 's#.*/c([0-9]+).*#\\1#' | sort -n | tail -1, then +1, zero-padded to 4) and a kebab slug${slug ? ` — use the given slug "${slug}"` : ' of the title (<= 48 chars)'}. Name = "cNNNN-<slug>".`,
    `2. Create it: node .claude/workflows/lib/openspec.js new change "cNNNN-<slug>".`,
    `3. Seed proposal.md: get its path (node .claude/workflows/lib/openspec.js instructions proposal --change "cNNNN-<slug>" --json) and write a proposal whose "## What" / "## Why" are grounded in the request above. Keep it faithful to the request; do NOT invent scope. Do NOT review or validate here — that is /opsx:spec's job.`,
    `Return ok, reason, change (the cNNNN-<slug>), proposalPath.`,
  ].filter(Boolean).join('\n'),
  { schema: SCAFFOLD, label: 'propose-scaffold', phase: 'Scaffold', agentType: 'general-purpose' },
)
if (!made || !made.ok || !made.change) {
  return { stage: 'scaffold', ok: false, reason: made ? (made.reason || 'scaffold returned no change') : 'scaffold agent returned null' }
}

return {
  stage: 'done', ok: true, change: made.change, proposalPath: made.proposalPath || null,
  nextStep: `Scaffolded change ${made.change}. Review/refine proposal.md, then run /opsx:spec ${made.change}.`,
}
