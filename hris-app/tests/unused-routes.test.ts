import { describe, it, expect } from 'vitest';
import { readdirSync, statSync, readFileSync, existsSync } from 'fs';
import { join, relative, resolve, dirname, extname } from 'path';

// Parse the routes.ts file to extract all referenced route files
function extractRoutePaths(routesContent: string): Set<string> {
  const routePaths = new Set<string>();

  // Match all route() calls with file paths
  const routeRegex = /route\([^,]+,\s*["']([^"']+)["']\)/g;
  const indexRegex = /index\(["']([^"']+)["']\)/g;
  const layoutRegex = /layout\(["']([^"']+)["']/g;

  let match;

  while ((match = routeRegex.exec(routesContent)) !== null) {
    routePaths.add(match[1]);
  }

  while ((match = indexRegex.exec(routesContent)) !== null) {
    routePaths.add(match[1]);
  }

  while ((match = layoutRegex.exec(routesContent)) !== null) {
    routePaths.add(match[1]);
  }

  return routePaths;
}

// Extract imports from a file
function extractImports(fileContent: string, filePath: string, appDir: string): Set<string> {
  const imports = new Set<string>();

  // Match import statements with relative paths
  const importRegex = /import\s+.*?\s+from\s+["'](\.[^"']+)["']/g;
  let match;

  while ((match = importRegex.exec(fileContent)) !== null) {
    const importPath = match[1];

    // Resolve the import path relative to the current file
    const fileDir = dirname(filePath);
    let resolvedPath = resolve(fileDir, importPath);

    // Try different extensions if the path doesn't have one
    if (!extname(importPath)) {
      const extensions = ['.tsx', '.ts', '.jsx', '.js'];
      for (const ext of extensions) {
        const pathWithExt = resolvedPath + ext;
        if (existsSync(pathWithExt)) {
          resolvedPath = pathWithExt;
          break;
        }
      }
    }

    // Convert to relative path from app directory
    if (existsSync(resolvedPath)) {
      const relativePath = relative(appDir, resolvedPath).replace(/\\/g, '/');
      imports.add(relativePath);
    }
  }

  return imports;
}

// Recursively find all files imported by route files
function findAllUsedFiles(initialPaths: Set<string>, appDir: string): Set<string> {
  const usedFiles = new Set<string>(initialPaths);
  const toProcess = Array.from(initialPaths);
  const processed = new Set<string>();

  while (toProcess.length > 0) {
    const currentPath = toProcess.pop()!;

    if (processed.has(currentPath)) {
      continue;
    }
    processed.add(currentPath);

    const absolutePath = join(appDir, currentPath);

    if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) {
      continue;
    }

    // Only process TypeScript/JavaScript files in the routes directory
    if (!currentPath.startsWith('routes/') && !currentPath.startsWith('layouts/')) {
      continue;
    }

    const fileContent = readFileSync(absolutePath, 'utf-8');
    const imports = extractImports(fileContent, absolutePath, appDir);

    for (const importPath of imports) {
      if (!usedFiles.has(importPath) && importPath.startsWith('routes/')) {
        usedFiles.add(importPath);
        toProcess.push(importPath);
      }
    }
  }

  return usedFiles;
}

// Recursively get all files in a directory
function getAllFiles(dirPath: string, arrayOfFiles: string[] = []): string[] {
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

describe('Route Files Usage', () => {
  it('should not have unused route files', () => {
    const appDir = join(process.cwd(), 'app');
    const routesDir = join(appDir, 'routes');
    const routesConfigPath = join(appDir, 'routes.ts');

    // Read routes.ts
    const routesContent = readFileSync(routesConfigPath, 'utf-8');

    // Extract all referenced route paths from routes.ts
    const referencedPaths = extractRoutePaths(routesContent);

    console.log('\n📋 Routes referenced in routes.ts:');
    console.log('-----------------------------------');
    referencedPaths.forEach(path => console.log(`  ✓ ${path}`));

    // Recursively find all files imported by these routes
    const allUsedFiles = findAllUsedFiles(referencedPaths, appDir);

    console.log(`\n📦 Total files used (including imports): ${allUsedFiles.size}`);

    // Get all actual route files
    const allRouteFiles = getAllFiles(routesDir).filter(
      (file) => file.endsWith('.tsx') || file.endsWith('.ts')
    );

    // Convert to relative paths from app directory
    const allRouteRelativePaths = allRouteFiles.map((file) =>
      relative(appDir, file).replace(/\\/g, '/')
    );

    // Find unused routes (files in routes/ that are not referenced)
    const unusedRoutes = allRouteRelativePaths.filter(
      (path) => !allUsedFiles.has(path)
    );

    if (unusedRoutes.length > 0) {
      console.log(`\n🗑️  Found ${unusedRoutes.length} unused route files:`);
      console.log('-----------------------------------');
      unusedRoutes.forEach((path) => {
        console.log(`  ❌ ${path}`);
      });
      console.log('\nTo delete these files, run:');
      console.log('  npm run clean-routes\n');
    } else {
      console.log('\n✅ No unused routes found! All route files are being used.\n');
    }

    // This will fail the test if there are unused routes
    expect(unusedRoutes).toEqual([]);
  });
});
