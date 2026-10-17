# Prompt Enhancer

**English** · [Português (Brasil)](README.pt-BR.md)

A Claude Code mod that puts two buttons right above the prompt box, **✦ Enhance** and **➤ Send**.

**Enhance** rewrites your draft in place, without sending it, so the AI understands it on the first read:

- fixes the writing and cuts repetition and hesitation;
- puts the goal first and lists, as bullet points, the requests and constraints you already made;
- when the request has a checkable outcome, ends with a short **Done when** built only from what you already asked for;
- comes out in the language of the draft.

It adds nothing of its own: no new requirements, questions, suggestions or project facts. You review, adjust and send.

The band's on-screen labels are in Brazilian Portuguese; below, each one comes with its English meaning.

## Usage

| Action | How |
| --- | --- |
| Enhance the draft | `alt+e` in the prompt box, or the **✦ Enhance** chip; in the desktop app, the **Enhance** button or `/enhance` before the draft (`alt+e` doesn't work there) |
| Send | **➤ Send** (or Enter, as always) |
| Go back to the original draft | **↶ Desfazer** (Undo), which appears after an enhance |
| Stop a rewrite | **Cancelar** (Cancel), which appears while it runs |
| Enhance some text directly | `/enhance <text>` |
| Pick the model and effort | `/prompt-enhancer` (see [Configuration](#configuration)) |
| Use the band from the keyboard | `ctrl+x tab` focuses Enhance, `Tab` moves between the buttons, `Esc` goes back to the prompt |

While the model works, the band shows its progress. If you edit the draft in the meantime, your version wins and nothing is replaced.

## The shortcut

In this version, a mod can't register a global shortcut on its own. `alt+e` comes from a line in `~/.claude/keybindings.json` that runs the mod's `/enhance` command without clearing the box:

```json
{
  "$schema": "https://www.schemastore.org/claude-code-keybindings.json",
  "$docs": "https://code.claude.com/docs/en/keybindings",
  "bindings": [
    { "context": "Chat", "bindings": { "alt+e": "command:enhance" } }
  ]
}
```

To use another key, replace `alt+e`. The hint in the band reads this file and shows the key you configured.

## What goes to the model

Each Enhance sends only the draft and the rewrite instructions, through the same client and account as your session. Nothing from the project, the conversation or the skills list goes along: the Claude that receives the prompt already has all of that, and the rewrite doesn't need it.

The rewrite comes out in the language of the draft, even if your Claude Code `language` setting is a different one, because the text is your prompt, not a reply to you. The mod recognizes English and Portuguese on its own and gives the model the right label for the closing section ("Done when" or "Pronto quando"); in other languages, the model decides.

## Configuration

The mod has its own command, `/prompt-enhancer`, and doesn't show up in `/config`. There are two choices:

- **Rewrite model:** `sonnet` (default), `opus` or `haiku`. `opus` rewrites better but is slower and costs more; `haiku` is the fastest.
- **Rewrite effort:** `low`, `medium` (default) or `high`. It's how much the model thinks before rewriting.

There are two ways to choose:

- `/prompt-enhancer` on its own opens a row in the band, above Enhance, with the two lists, **Modelo** (Model) and **Esforço** (Effort). `ctrl+x tab` moves the focus to the model list, the arrow keys change the value, Enter picks it, `Tab` moves on to the effort and **Fechar** (Close) hides the row. The command's reply also shows the current settings.
- `/prompt-enhancer opus high` saves directly, without opening the row. You can pass just one of the two (`/prompt-enhancer haiku`, `/prompt-enhancer low`).

The choice is saved in the mod's own file, in the Claude Code configuration folder, and applies to every session from the next Enhance on. The row with the lists doesn't appear in the mobile app; use the typed form there.

## Install for every session

This repository is also a marketplace. In the terminal, once:

```
claude plugin marketplace add carreirodev/mod-prompt-enhancer
```

```
claude plugin install prompt-enhancer@prompt-enhancer
```

To get a new version, run `claude plugin update prompt-enhancer@prompt-enhancer` and then `/reload-plugins` in an open session.

To work on the mod, add the marketplace from your cloned folder instead of GitHub (`claude plugin marketplace add C:\path\to\clone`). Claude Code then reads the mod straight from that folder, and after an edit you just run `/reload-plugins` in an open session.

## Known limitations

- **Send** doesn't carry pastes or images (`[Pasted text #1]`, `[Image #1]`), because a prompt sent by a mod doesn't expand them. In those cases the button warns you, and you send with Enter.
- A prompt sent with **Send** shows up in the transcript marked as coming from `prompt-enhancer`, but the model reads it as your own words.
- The band exists in the terminal and in the desktop app; mobile and VS Code don't draw that area. In the terminal the buttons are colored chips; on desktop they're the app's own buttons (Enhance highlighted), with some space below for a mod drawn right underneath.
- With the mod uninstalled, `alt+e` answers that `/enhance` doesn't exist. In that case, remove the line from `keybindings.json`.

## Development

```
claude plugin validate .
```

```
claude plugin test .
```

The type-check uses the root `tsconfig.json`, which extends the types Claude Code writes to `.claude-plugin/types/` when it loads the mod.
