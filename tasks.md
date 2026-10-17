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

## Found (out of scope, waiting for a Linear project)

- ~~`.tlc/harness/state/*` showed up as untracked in this repo~~ — gone by 2026-10-17 (no `.tlc/` folder), nothing to decide.
