# Feature Implementation Prompt

## Purpose

Provide a reusable prompt for common agent work.

## How to Use

Fill placeholders with project context, task scope, constraints, and validation commands.

## Rules

- Keep prompts grounded in wiki truth and governance gates.
- Use Wiki first, then code, when a feature introduces or changes product truth.
- Capture new truth from prompts, uploaded files, screenshots, and images before implementation when possible.
- Update `.wwg/workspace/current-task.md` before and after work.
- Understand requirements and acceptance criteria.
- Identify affected systems.
- Verify architecture compatibility with product invariants.
- Implement at authoritative layers first.
- Avoid cross-layer hacks.
- Add validation and explicit error handling.
- Add or update tests.
- Verify adjacent system stability and non-regression.
- Review public-surface update needs.
- Review runtime/infrastructure and public discovery impacts when the feature changes deployment, public routes, metadata, monitoring, or operational behavior.
- Run truth capture and drift guard before close-out.
- Update canonical docs/context/skills/governance when truth changes.

## Output Format

Role, context, change category, affected systems, implementation plan, validation, public-surface review, maintenance updates, and report expectations.
