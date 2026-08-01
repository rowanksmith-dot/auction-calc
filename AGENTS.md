<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Model routing

- Default implementation model: DeepSeek V4 Pro (`deepseek/deepseek-v4-pro`).
- Lightweight tasks only: DeepSeek V4 Flash (`deepseek/deepseek-v4-flash`).
- Difficult implementation or debugging: Claude Sonnet 5 (`anthropic/claude-sonnet-5`) via the `sonnet-build` subagent. Requires explicit approval from Amiya or Rowan.
- Read-only mathematical, architectural, or final audit: Claude Opus 5 (`anthropic/claude-opus-5`) via the `opus-audit` subagent. Requires explicit approval from Amiya or Rowan.
- Never switch automatically to a paid Anthropic model.
- Never fall back from DeepSeek to Anthropic without explicit approval from Amiya or Rowan.
- Never expose API keys to any model.
- Never read .env files or secret credential stores.
- Never push, merge, or deploy to production without explicit approval.

## Product invariants (AuctionCalc)

- Default budget is $1,000 per team. Never change the default to $200.
- FantasyCalc values come from `item.value`.
- Auction totals must remain exact.
- Original values, live values, and Sleeper actual prices must remain separate.
- Production deployment requires explicit human approval.
