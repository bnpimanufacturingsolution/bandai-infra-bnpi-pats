import { readFileSync, writeFileSync, copyFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, relative, basename } from 'path';
import { createHash } from 'crypto';

interface SharedFile {
  sharedPath: string;
  originalRoles: string[];
}

// Recursively get all files in a directory
function getAllFiles(dirPath: string, arrayOfFiles: string[] = []): string[] {
  if (!existsSync(dirPath)) {
    return arrayOfFiles;
  }

  const files = readdirSync(dirPath);

  files.forEach((file) => {
    const filePath = join(dirPath, file);
    if (statSync(filePath).isDirectory()) {
      arrayOfFiles = getAllFiles(filePath, arrayOfFiles);
    } else {
      arrayOfFiles.push(filePath);
    }
  });

  return arrayOfFiles;
}

// Find all shared files
function findSharedFiles(routesDir: string): Map<string, SharedFile> {
  const sharedDir = join(routesDir, '_shared');
  const sharedFiles = new Map<string, SharedFile>();

  if (!existsSync(sharedDir)) {
    return sharedFiles;
  }

  const files = getAllFiles(sharedDir).filter(
    (file) => file.endsWith('.tsx') || file.endsWith('.ts')
  );

  files.forEach((filePath) => {
    const relativePath = relative(routesDir, filePath).replace(/\\/g, '/');
    const filename = basename(filePath);

    // Determine which roles should use this shared file
    // by looking at the subdirectory structure
    const pathParts = relativePath.split('/');
    pathParts.shift(); // Remove '_shared'

    const subPath = pathParts.join('/');

    // Find which roles have directories that match this structure
    const roles: string[] = [];
    const routesSubdirs = readdirSync(routesDir).filter((name) => {
      const fullPath = join(routesDir, name);
      return statSync(fullPath).isDirectory() && name !== '_shared';
    });

    routesSubdirs.forEach((role) => {
      const expectedPath = join(routesDir, role, subPath);
      // If the role doesn't have this file anymore (it was deleted), it means it was a duplicate
      if (!existsSync(expectedPath)) {
        roles.push(role);
      }
    });

    if (roles.length > 0) {
      sharedFiles.set(relativePath, {
        sharedPath: relativePath,
        originalRoles: roles,
      });
    }
  });

  return sharedFiles;
}

// Update routes.ts to use shared files
function updateRoutesConfig(
  routesConfigPath: string,
  sharedFiles: Map<string, SharedFile>,
  dryRun: boolean
): void {
  const content = readFileSync(routesConfigPath, 'utf-8');
  let updatedContent = content;
  let changeCount = 0;

  console.log('🔍 Analyzing routes.ts for updates...\n');

  sharedFiles.forEach((shared, sharedPath) => {
    shared.originalRoles.forEach((role) => {
      // Extract the subpath (everything after _shared/)
      const subPath = sharedPath.replace('_shared/', '');

      // Original route path pattern
      const originalPath = `routes/${role}/${subPath}`;

      // Create regex to match this route in various contexts
      const patterns = [
        // Match exact quoted strings
        new RegExp(`["']${originalPath}["']`, 'g'),
        // Match with escaped forward slashes (if any)
        new RegExp(`["']${originalPath.replace(/\//g, '\\/')}["']`, 'g'),
      ];

      patterns.forEach((pattern) => {
        const matches = updatedContent.match(pattern);
        if (matches) {
          updatedContent = updatedContent.replace(pattern, `"routes/${sharedPath}"`);
          changeCount += matches.length;
          console.log(`  ✓ ${role}/${subPath} → _shared/${subPath}`);
        }
      });
    });
  });

  if (changeCount === 0) {
    console.log('ℹ️  No changes needed in routes.ts');
    return;
  }

  console.log('');
  console.log('='.repeat(80));
  console.log(`\n📝 Total route references updated: ${changeCount}\n`);

  if (dryRun) {
    console.log('🔍 DRY RUN - Preview of changes:\n');
    console.log('--- Original routes.ts');
    console.log('+++ Updated routes.ts');
    console.log('');

    // Show a simple diff-like output
    const originalLines = content.split('\n');
    const updatedLines = updatedContent.split('\n');

    let diffCount = 0;
    originalLines.forEach((line, index) => {
      if (line !== updatedLines[index] && diffCount < 10) {
        console.log(`  - ${line}`);
        console.log(`  + ${updatedLines[index]}`);
        console.log('');
        diffCount++;
      }
    });

    if (diffCount >= 10) {
      console.log('  ... (showing first 10 differences)');
      console.log('');
    }

    console.log('✅ Dry run complete! No files were modified.');
    console.log('   Run without --dry-run to apply changes.');
  } else {
    // Create backup
    const backupPath = `${routesConfigPath}.backup`;
    copyFileSync(routesConfigPath, backupPath);
    console.log(`💾 Backup created: ${backupPath}\n`);

    // Write updated content
    writeFileSync(routesConfigPath, updatedContent, 'utf-8');
    console.log('✅ routes.ts has been updated!\n');

    console.log('📝 Next Steps:');
    console.log('  1. Review the changes in routes.ts');
    console.log('  2. Test your application: npm run dev');
    console.log('  3. Check all role-based routes work correctly');
    console.log(`  4. If needed, restore from backup: ${backupPath}`);
  }

  console.log('');
}

function main() {
  const routesDir = join(process.cwd(), 'app', 'routes');
  const routesConfigPath = join(process.cwd(), 'app', 'routes.ts');
  const dryRun = process.argv.includes('--dry-run');

  console.log('='.repeat(80));
  console.log('📝 ROUTES CONFIG UPDATER');
  console.log('='.repeat(80));
  console.log('');

  if (!existsSync(routesConfigPath)) {
    console.error('❌ Error: routes.ts not found at:', routesConfigPath);
    process.exit(1);
  }

  const sharedFiles = findSharedFiles(routesDir);

  if (sharedFiles.size === 0) {
    console.log('ℹ️  No shared files found in _shared directory.');
    console.log('   Run npm run refactor:routes first to create shared files.');
    process.exit(0);
  }

  console.log(`📊 Found ${sharedFiles.size} shared files\n`);

  updateRoutesConfig(routesConfigPath, sharedFiles, dryRun);
}

main();
