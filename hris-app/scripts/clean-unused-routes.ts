import { readdirSync, statSync, unlinkSync, readFileSync, existsSync } from 'fs';
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

function main() {
  const appDir = join(process.cwd(), 'app');
  const routesDir = join(appDir, 'routes');
  const routesConfigPath = join(appDir, 'routes.ts');

  // Read routes.ts
  const routesContent = readFileSync(routesConfigPath, 'utf-8');

  // Extract all referenced route paths from routes.ts
  const referencedPaths = extractRoutePaths(routesContent);

  console.log('📋 Analyzing route dependencies...\n');

  // Recursively find all files imported by these routes
  const allUsedFiles = findAllUsedFiles(referencedPaths, appDir);

  console.log(`📦 Total files used (including imports): ${allUsedFiles.size}\n`);

  // Get all actual route files
  const allRouteFiles = getAllFiles(routesDir).filter(
    (file) => file.endsWith('.tsx') || file.endsWith('.ts')
  );

  // Convert to relative paths from app directory and create a map
  const filePathMap = new Map<string, string>();
  allRouteFiles.forEach((absolutePath) => {
    const relativePath = relative(appDir, absolutePath).replace(/\\/g, '/');
    filePathMap.set(relativePath, absolutePath);
  });

  // Find unused routes (files in routes/ that are not referenced)
  const unusedRoutes = Array.from(filePathMap.keys()).filter(
    (path) => !allUsedFiles.has(path)
  );

  if (unusedRoutes.length === 0) {
    console.log('✅ No unused routes found! Nothing to delete.');
    process.exit(0);
  }

  console.log(`🗑️  Deleting ${unusedRoutes.length} unused route files:`);
  console.log('-----------------------------------');

  let deletedCount = 0;
  let errorCount = 0;

  for (const relativePath of unusedRoutes) {
    const absolutePath = filePathMap.get(relativePath);
    if (absolutePath) {
      try {
        unlinkSync(absolutePath);
        console.log(`  ✓ Deleted: ${relativePath}`);
        deletedCount++;
      } catch (error) {
        console.error(`  ✗ Failed to delete: ${relativePath}`, error);
        errorCount++;
      }
    }
  }

  console.log('');
  console.log(`✅ Successfully deleted ${deletedCount} files`);
  if (errorCount > 0) {
    console.log(`❌ Failed to delete ${errorCount} files`);
  }

  process.exit(errorCount > 0 ? 1 : 0);
}

main();
