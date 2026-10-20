# CLAUDE.md

Reply to the user in Hebrew (masculine form), short and direct, no emojis.

## This folder is a template

This folder is the user's **base template for every new project**. To start a new project, the user copies these files into a new folder and builds from there. So there are two situations, and you must know which one you are in:

| Situation | How to tell | What to do |
|---|---|---|
| **Fresh copy** (a new project) | `Project name` below is still `TEMPLATE` and the working folder is **not** the template folder | Run the `new-project-setup` skill first, before any feature work |
| **Editing the template itself** | The working folder is the template folder: `C:\Users\Shalom\Projects\New Claude project` (or any mounted path whose last folder is `New Claude project`) | Keep every change generic. No project-specific names, stacks, content or files |
| **Project already set up** | `Project name` is filled in | Normal work through the pipeline below |

Check the working folder path first; it decides between the first two rows without guessing from the user's wording. If the template folder is ever moved or renamed, update the path here.

Rules while editing the template:
- Anything added must be useful to *any* future project, or be clearly marked as conditional (for example "only when the project is a website").
- Template-only files (the template roadmap in `docs/TEMPLATE-ROADMAP.md`) are deleted by `new-project-setup` in a fresh copy.
- Never put secrets, API keys or account IDs here. Each project fills its own.

### Base skills vs project skills

**Base skills** are the template's permanent skills and agents. Every copy gets them. Current base set:

- Skills: `architecture-plan`, `ce-compound`, `ce-compound-refresh`, `ce-debug`, `ce-simplify-code`, `drop-generic-design`, `feature-spike`, `loop-engineering`, `new-project-setup`, `rtl-chat`, `ui-ux-review`, `write-feature-spec`
- Agents: `architecture-expert`, `change-reviewer`, `design-expert`, `product-expert`, `qa-expert`, `security-expert`

**Project skills** are added after a project was copied and fit only that project. They are listed under "Project skills" in that project's CLAUDE.md, never here. `new-project-setup` writes that section, with its own registration steps and start-of-session check, into every new project.

### Adding a skill or agent to the template

When the user adds a skill or agent while `Project name` is `TEMPLATE`, it is a base skill. Before calling it done:

1. Make it generic: no project names, stacks, domains, IDs or keys. Values a project must supply are written as `TBD` or read from "Project facts".
2. If it only applies to some projects, say so in its `description` (for example "Use only when the project is a website").
3. Point any file paths it writes at the shared output folders in "Where outputs go"; add a row if it needs a new one.
4. Add it to the base set above and a row to "Skill routing" (or "Agents").
5. If it references skills that are not installed, add them to the substitutes table.

**Check at the start of template work:** list `.claude/skills/` and `.claude/agents/`. Anything not in the base set above was added without registration. Run steps 1 to 5 on it, or ask the user if it looks project-specific.


## Project facts

- Project name: `TEMPLATE`
- Project type: **TBD** (website, app, API, script...). Website-specific skills apply only when this is a website.
- Stack: **TBD** (no site code yet). Fill in when the first code lands.
- Verify command: **TBD**. Until it exists, `loop-engineering` uses the narrowest real check available and says which one it ran.
- Performance budget: **TBD** (set by `new-project-setup` for websites; see `docs/TEMPLATE-ROADMAP.md`).
- Product direction: `docs/PRODUCT-DIRECTION.md` if present; otherwise ask the user and do not invent one.
- Not a git repository yet. Skills that commit or open PRs stop at the local change.

## Where outputs go

| Output | Path | Written by |
|---|---|---|
| Feature spec | `docs/specs/<feature>.md` | `write-feature-spec` |
| Spike code (throwaway) | `spikes/<feature>/` | `feature-spike` |
| Spike result and verdict | `docs/spikes/<feature>.md` | `feature-spike` |
| Implementation plan | `docs/plans/<feature>-PLAN.md` | `architecture-plan` |
| Solved-problem learnings | `docs/solutions/` | `ce-compound` |
| Template roadmap (template only) | `docs/TEMPLATE-ROADMAP.md` | manual |

## Skill routing: which skill when

| Situation | Use | Not |
|---|---|---|
| Fresh copy of the template, first request | `new-project-setup` | starting features with `TEMPLATE` facts |
| New feature or vague request | `write-feature-spec` | jumping to code |
| Spec approved, new capability | `feature-spike` (small experiment first) | building the full feature on an untested idea |
| Spike verdict GO, need a technical plan | `architecture-plan` | re-opening product decisions |
| Plan approved, build it | `loop-engineering` | building without an approved plan |
| Any frontend work (spec, build, review) | `ui-ux-review` + `drop-generic-design` (via `design-expert`) | decorative polish first |
| Bug, failing test, slow behavior | `ce-debug` | guessing fixes |
| Fix verified and the reasoning is non-obvious | `ce-compound` | documenting routine fixes |
| Feature built and tests pass, code feels messy | `ce-simplify-code` | changing behavior while cleaning |
| `docs/solutions/` may be stale or duplicated | `ce-compound-refresh` | editing product code |
| User asks for RTL widgets in Cowork | `rtl-chat` | turning it on just because text is Hebrew |

Small, clear changes (typo, one-line copy edit, a config value) skip the pipeline. The pipeline is for features.

## Rule: spike before building

The user builds many capabilities from scratch. Before writing the full code of any new capability, always write a small experiment first (`feature-spike`): minimal code that tests the riskiest assumption and shows whether the feature is feasible and worth developing. Only after a GO verdict and the user's approval, plan and build the full capability. Skip only for small, clear changes, or when every part is already proven in this project (say so).

## Feature pipeline

```
write-feature-spec  ->  [user approves spec]
  fan-out: product-expert, architecture-expert, design-expert, qa-expert
           (+ security-expert only on a trust-boundary trigger)
feature-spike       ->  small experiment, verdict GO | CHANGE | NO-GO  ->  [user decides]
architecture-plan   ->  [user approves plan]
loop-engineering    ->  build / check / repair, max 3 cycles
  change-reviewer   ->  PASS | REPAIR | REPLAN | HUMAN DECISION
ce-compound         ->  only if the work taught something non-obvious
```

Bugs found during `loop-engineering` go to `ce-debug`, then back into the loop.

## Agents

| Agent | Called by | Preloaded skills |
|---|---|---|
| `product-expert` | `write-feature-spec` | none |
| `architecture-expert` | `write-feature-spec` | `architecture-plan` |
| `design-expert` | `write-feature-spec`, frontend reviews | `ui-ux-review`, `drop-generic-design` |
| `qa-expert` | `write-feature-spec`, acceptance criteria | none |
| `security-expert` | trust-boundary changes only | none |
| `change-reviewer` | `loop-engineering`, after every build | none |

All agents are read-only. Only the main session edits files.

## compound-engineering skills

`ce-debug`, `ce-compound`, `ce-simplify-code` and `ce-compound-refresh` come from the compound-engineering plugin (EveryInc). They are **copied into `.claude/skills/` on purpose**, because the plugin was not active in the user's Claude Code and a copy travels with the template. Do not also install the full plugin in the same project: that shows each skill twice.

To refresh the copies from a newer plugin version, copy the four folders from `$HOME\.claude\plugins\cache\compound-engineering-plugin` over the ones here.

The plugin also ships skills that overlap this template's own pipeline. For features, use the template's pipeline above, not these:

| Plugin skill | Use instead |
|---|---|
| `ce-brainstorm` | `write-feature-spec` |
| `ce-plan` | `architecture-plan` |
| `ce-work`, `lfg` | `loop-engineering` |
| `ce-code-review` | `change-reviewer` agent |

Git and PR skills (`ce-commit`, `ce-commit-push-pr`, `ce-babysit-pr`, `ce-resolve-pr-feedback`) run only when the user asks and the folder is a git repository.
