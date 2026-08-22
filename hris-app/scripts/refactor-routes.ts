import { readdirSync, statSync, readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'fs';
import { join, relative, basename, dirname } from 'path';
import { createHash } from 'crypto';

interface FileInfo {
  path: string;
  relativePath: string;
  content: string;
  hash: string;
  lineCount: number;
  role: string;
  filename: string;
}

interface DuplicateGroup {
  filename: string;
  hash: string;
  files: FileInfo[];
  lineCount: number;
}

interface RefactorPlan {
  templatePath: string;
  templateRelativePath: string;
  componentName: string;
  sourceFile: FileInfo;
  allFiles: FileInfo[];
  routeUpdates: RouteUpdate[];
}

interface RouteUpdate {
  oldPath: string;
  newPath: string;
  role: string;
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

// Calculate MD5 hash of file content
function calculateHash(content: string): string {
  return createHash('md5').update(content).digest('hex');
}

// Extract role from file path
function extractRole(relativePath: string): string {
  const parts = relativePath.split('/');
  return parts[0] || 'unknown';
}

// Extract component name from file content
function extractComponentName(content: string): string {
  // Match: export default function ComponentName() or export default function ComponentName ()
  const match = content.match(/export\s+default\s+function\s+(\w+)/);
  return match ? match[1] : 'UnknownComponent';
}

// Generate template path for duplicate files
function generateTemplatePath(duplicateGroup: DuplicateGroup): string {
  const firstFile = duplicateGroup.files[0].relativePath;
  const pathParts = firstFile.split('/');
  pathParts.shift(); // Remove role (admin, employee, etc.)

  // Convert something like "requests/$type.tsx" to "requests/request-type-template.tsx"
  const filename = pathParts[pathParts.length - 1];
  const nameWithoutExt = filename.replace(/\.(tsx|ts)$/, '');

  // Create a template name in kebab-case
  const templateName = nameWithoutExt + '-template.tsx';

  pathParts[pathParts.length - 1] = templateName;

  return pathParts.join('/');
}

// Analyze and find duplicates
function findDuplicates(routesDir: string): DuplicateGroup[] {
  const allRouteFiles = getAllFiles(routesDir).filter(
    (file) => (file.endsWith('.tsx') || file.endsWith('.ts')) && !file.includes('_shared')
  );

  const fileInfos: FileInfo[] = allRouteFiles.map((path) => {
    const content = readFileSync(path, 'utf-8');
    const relativePath = relative(routesDir, path).replace(/\\/g, '/');
    const hash = calculateHash(content);
    const lineCount = content.split('\n').length;
    const role = extractRole(relativePath);
    const filename = basename(path);

    return {
      path,
      relativePath,
      content,
      hash,
      lineCount,
      role,
      filename,
    };
  });

  // Group by hash
  const hashGroups = new Map<string, FileInfo[]>();
  fileInfos.forEach((fileInfo) => {
    const existing = hashGroups.get(fileInfo.hash) || [];
    existing.push(fileInfo);
    hashGroups.set(fileInfo.hash, existing);
  });

  // Find duplicates
  const duplicates: DuplicateGroup[] = [];
  hashGroups.forEach((files, hash) => {
    if (files.length > 1) {
      duplicates.push({
        filename: files[0].filename,
        hash,
        files,
        lineCount: files[0].lineCount,
      });
    }
  });

  duplicates.sort((a, b) => b.lineCount - a.lineCount);
  return duplicates;
}

// Create template file content
function createTemplateContent(sourceContent: string, componentName: string): string {
  // Keep all the original content, but change the export to a named export
  return sourceContent.replace(
    /export\s+default\s+function\s+(\w+)/,
    'export function $1'
  );
}

// Create wrapper file content that imports from template
function createWrapperContent(templateRelativePath: string, componentName: string): string {
  // Use ~ alias to import from app directory
  const importPath = `~/components/${templateRelativePath.replace('.tsx', '')}`;
  return `import { ${componentName} } from "${importPath}";\n\nexport default ${componentName};\n`;
}

// Create refactor plan
function createRefactorPlan(duplicates: DuplicateGroup[], appDir: string): RefactorPlan[] {
  return duplicates.map((group) => {
    const templateRelativePath = generateTemplatePath(group);
    const sourceFile = group.files[0];
    const componentName = extractComponentName(sourceFile.content);

    return {
      templatePath: join(appDir, 'components', 'templates', templateRelativePath),
      templateRelativePath: `templates/${templateRelativePath}`,
      componentName,
      sourceFile,
      allFiles: group.files,
      routeUpdates: [],
    };
  });
}

// Update routes.ts file
function updateRoutesFile(appDir: string, dryRun: boolean): void {
  const routesFilePath = join(appDir, 'routes.ts');

  if (!existsSync(routesFilePath)) {
    console.log('⚠️  routes.ts not found, skipping routes update');
    return;
  }

  console.log('\n📝 Updating routes.ts...');

  if (!dryRun) {
    // Routes.ts doesn't need updating because we're keeping the same file paths
    // The route files themselves now just import from templates
    console.log('✅ Routes.ts remains unchanged (route paths stay the same)');
  }
}

// Execute refactoring
function executeRefactor(plan: RefactorPlan[], appDir: string, dryRun: boolean): void {
  console.log(dryRun ? '🔍 DRY RUN - No files will be modified\n' : '🚀 Executing refactor...\n');

  let templatesCreated = 0;
  let routesUpdated = 0;
  let filesDeleted = 0;

  plan.forEach((item, index) => {
    const templateDir = dirname(item.templatePath);

    console.log(`${index + 1}. ${item.sourceFile.filename}`);
    console.log(`   📝 Template: components/${item.templateRelativePath}`);
    console.log(`   🔧 Component: ${item.componentName}`);
    console.log(`   📂 Processing ${item.allFiles.length} route files:`);

    if (!dryRun) {
      // Create template directory if it doesn't exist
      if (!existsSync(templateDir)) {
        mkdirSync(templateDir, { recursive: true });
      }

      // Create template file (from first duplicate)
      const templateContent = createTemplateContent(item.sourceFile.content, item.componentName);
      writeFileSync(item.templatePath, templateContent, 'utf-8');
      templatesCreated++;
    }

    // Delete old route files and create new ones that import the template
    item.allFiles.forEach((file) => {
      console.log(`      → ${file.relativePath}`);

      if (!dryRun) {
        // Delete the old duplicate file
        unlinkSync(file.path);
        filesDeleted++;

        // Create new wrapper file that imports from template
        const wrapperContent = createWrapperContent(
          item.templateRelativePath,
          item.componentName
        );
        writeFileSync(file.path, wrapperContent, 'utf-8');
        routesUpdated++;
      }
    });

    console.log('');
  });

  console.log('='.repeat(80));
  console.log('');

  if (dryRun) {
    console.log('✅ Dry run complete! No files were modified.');
    console.log(`   Would create: ${plan.length} template files`);
    console.log(`   Would delete: ${plan.reduce((sum, p) => sum + p.allFiles.length, 0)} duplicate route files`);
    console.log(`   Would create: ${plan.reduce((sum, p) => sum + p.allFiles.length, 0)} new wrapper route files`);
  } else {
    console.log(`✅ Refactor complete!`);
    console.log(`   Created: ${templatesCreated} template files`);
    console.log(`   Deleted: ${filesDeleted} duplicate files`);
    console.log(`   Created: ${routesUpdated} new wrapper route files`);
  }

  // Update routes.ts
  updateRoutesFile(appDir, dryRun);

  console.log('');
  console.log('📝 Next Steps:');
  console.log('  1. Review the generated template files in app/components/templates/');
  console.log('  2. Review the new wrapper route files');
  console.log('  3. Test your application: npm run dev');
  console.log('  4. Check that all routes still work correctly');
  console.log('');
}

function main() {
  const appDir = join(process.cwd(), 'app');
  const routesDir = join(appDir, 'routes');
  const dryRun = process.argv.includes('--dry-run');

  console.log('='.repeat(80));
  console.log('🔧 ROUTE REFACTORING TOOL (Template-based)');
  console.log('='.repeat(80));
  console.log('');

  const duplicates = findDuplicates(routesDir);

  if (duplicates.length === 0) {
    console.log('✅ No duplicates found! Nothing to refactor.');
    process.exit(0);
  }

  console.log(`📊 Found ${duplicates.length} duplicate groups\n`);

  const plan = createRefactorPlan(duplicates, appDir);
  executeRefactor(plan, appDir, dryRun);
}

main();
