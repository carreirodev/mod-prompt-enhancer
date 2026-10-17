# Prompt Enhancer — tasks

Done when: the band above the prompt shows Enhance and Send; alt+e and the Enhance button rewrite the draft in place without sending; Send submits; `claude plugin validate`, `tsc` and `claude plugin test` pass; a real E2E capture shows it working.

- [x] Write the mod in the session's mods folder (manifest, hooks module, state contract)
- [x] Context gathering: installed skills, project snapshot, recent conversation
- [x] Rewrite request + reply cleanup + summary
- [x] Band UI: Enhance/Send chips, working shimmer, done/failed states, Undo/Cancel
- [x] `/enhance` command + `alt+e` keybinding (`command:enhance`)
- [x] Tests (kit), validate, tsc
- [x] E2E in WSL tmux with a real session; evidence in the scratchpad
- [x] Copy the finished mod into this repo with README and marketplace.json
- [x] Fixes from E2E: focus never lands on Send mid-rewrite; Send keeps the draft on failure; rewrite follows the draft's language
- [x] `.gitignore` for the generated `.claude-plugin/types/`; README installs from GitHub instead of a local path
- [x] First commit, pushed to GitHub (public)
- [x] Install for every session (`claude plugin marketplace add` + `claude plugin install`), then rerun tsc against the generated types

## 0.2.0 — `/prompt-enhancer` settings outside `/config`

Done when: `/prompt-enhancer` opens a row in the band with Model and Effort pickers; `/prompt-enhancer opus high` saves without the row; the choice holds in a new session and drives Enhance; `/config` no longer lists the mod; validate, tsc and tests pass; a real tmux E2E shows the row.

- [x] Settings kept in `$.store` (parse + args helpers in `hooks/settings.ts`), state contract for the row
- [x] `/prompt-enhancer` command: no args opens the row, args save directly, unknown words answered
- [x] Settings row in the band (two `Select`s + Fechar), focus lands on Model
- [x] Drop `userConfig` from plugin.json, bump to 0.2.0, README
- [x] Tests, validate, tsc
- [x] E2E in WSL tmux: row opens, ctrl+x tab opens the Model list, Tab moves to Effort then Fechar, picks land in the store, Enhance ran with haiku, typed form saves and refuses `gpt`, choice holds in a new session, row fits 60 columns
- [x] Commit, push (asks first), `claude plugin update`

## Found (out of scope, waiting for a Linear project)

- ~~`.tlc/harness/state/*` showed up as untracked in this repo~~ — gone by 2026-10-17 (no `.tlc/` folder), nothing to decide.
- The done state ("✓ Prompt melhorado" + Desfazer) outlives a box cleared with ctrl+c and slash commands run afterwards; only a submitted prompt resets it (`hooks/register.tsx`, the `prompt.submit` hook). Seen in the 0.2.0 E2E, predates it. Pressing Desfazer then still puts the original draft back, so it is cosmetic.
