## Service Scaffolding Guide

This guide covers the script that scaffolds services and wires them into the app.

Prerequisites:

- `app/template/` exists and compiles
- `zod/template.zod.ts` and `prisma/schema/template.prisma` exist

---

### create-service (from template)

Scaffolds a new service by copying `app/template` and wiring everything up.

Command:

```bash
npm run create-service -- <name>
# example
npm run create-service -- site
```

What it does:

- Copies `app/template` to `app/<name>` and renames:
    - Filenames containing `template` → `<name>`
    - Occurrences in file contents: `template`/`Template`/`TEMPLATE`, `templateModule` → `<name>Service`
- Creates Zod schemas:
    - `zod/<name>.zod.ts` from `zod/template.zod.ts`
- Creates Prisma model schema:
    - `prisma/schema/<name>.prisma` from `prisma/schema/template.prisma`
- Adds service-specific config into `config/constant.ts`:
    - ERROR, SUCCESS, ACTIVITY_LOG (ACTIONS, DESCRIPTIONS, PAGES), AUDIT_LOG (RESOURCES, ENTITY_TYPES, DESCRIPTIONS)
- Wires the service into `index.ts`:
    - Adds `const <name> = require("./app/<name>")(prisma);`
    - Adds `app.use(config.baseApiPath, <name>);`
- Safety: aborts if `app/<name>` already exists; skips config and wiring if already present.

Routes generated:

- Base path will be `${config.baseApiPath}/<name>` (e.g., `/api/site`).
    - Derived from the `app/<name>/<name>.router.ts` path (converted from `/template`).

---

### After running the script

```bash
# generate prisma client if needed
npm run prisma-generate

# start the server
npm run dev
```

Verify:

- Visit Swagger docs (non-production): `${config.baseApiPath}/docs`
- Hit endpoints like `GET ${config.baseApiPath}/<name>`

Rollback (if needed):

- Delete `app/<name>/`
- Delete `zod/<name>.zod.ts`
- Delete `prisma/schema/<name>.prisma` and rerun `npm run prisma-generate`
- Remove inserted lines in `config/constant.ts` and `index.ts`

### Troubleshooting

- If your shell errors on flags, prefer the provided npm scripts.
- If `index.ts` format differs significantly, the auto-wiring may not place lines correctly; add them manually.
