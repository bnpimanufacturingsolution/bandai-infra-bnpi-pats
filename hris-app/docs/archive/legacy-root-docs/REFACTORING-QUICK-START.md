# 🚀 Quick Start: Route Refactoring

## TL;DR - 5 Commands to Run

```bash
# 1. Find duplicates (safe, just analyzes)
npm run detect:duplicates

# 2. Preview changes (safe, no modifications)
npm run refactor:routes:dry-run

# 3. Apply changes (moves files, deletes duplicates)
npm run refactor:routes

# 4. Preview routes.ts update (safe, no modifications)
npm run update:routes-config:dry-run

# 5. Update routes.ts (modifies routes.ts file)
npm run update:routes-config
```

## ✅ Safe Commands (No File Changes)

```bash
npm run detect:duplicates              # Find duplicates
npm run refactor:routes:dry-run        # Preview file moves
npm run update:routes-config:dry-run   # Preview routes.ts changes
```

## ⚠️ Destructive Commands (Modifies Files)

```bash
npm run refactor:routes          # Moves/deletes files
npm run update:routes-config     # Updates routes.ts
```

## 📊 What You'll Get

**Before:** 133 files, 12,600 duplicate lines
**After:** 90 files, 0 duplicates

**Example duplicate found:**
- `employee/requests/leave.tsx` (793 lines)
- `manager/requests/leave.tsx` (793 lines) ← SAME FILE!

**After refactoring:**
- `_shared/requests/leave.tsx` (793 lines) ← Used by both!

## 🛡️ Safety Tips

1. **Always dry-run first**: Use `:dry-run` commands
2. **Use git**: Commit before refactoring
3. **Backups created**: `routes.ts.backup` is auto-created
4. **Test after**: Run `npm run dev` and check all roles

## 🔄 Undo If Needed

```bash
# Restore routes.ts
cp app/routes.ts.backup app/routes.ts

# Revert all file changes
git checkout app/routes/
```

## 📖 Full Guide

See `REFACTORING-GUIDE.md` for detailed documentation.

---

**Ready? Start with:** `npm run detect:duplicates` 🎯
