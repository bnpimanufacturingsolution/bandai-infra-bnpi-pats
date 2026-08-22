import { readdirSync, statSync, readFileSync } from 'fs';
import { join, relative, basename } from 'path';
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

// Extract role from file path (e.g., "admin", "employee", "manager")
function extractRole(relativePath: string): string {
  const parts = relativePath.split('/');
  return parts[0] || 'unknown'; // admin/dashboard.tsx -> admin
}

// Analyze route files and find duplicates
function analyzeRouteFiles(routesDir: string): {
  allFiles: FileInfo[];
  duplicates: DuplicateGroup[];
  stats: {
    totalFiles: number;
    duplicateFiles: number;
    duplicateLines: number;
    uniqueGroups: number;
  };
} {
  const allRouteFiles = getAllFiles(routesDir).filter(
    (file) => file.endsWith('.tsx') || file.endsWith('.ts')
  );

  console.log(`📊 Analyzing ${allRouteFiles.length} route files...\n`);

  // Build file info map
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

  // Group files by hash
  const hashGroups = new Map<string, FileInfo[]>();
  fileInfos.forEach((fileInfo) => {
    const existing = hashGroups.get(fileInfo.hash) || [];
    existing.push(fileInfo);
    hashGroups.set(fileInfo.hash, existing);
  });

  // Find duplicate groups (where multiple files have the same hash)
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

  // Sort by line count (descending) to show biggest duplicates first
  duplicates.sort((a, b) => b.lineCount - a.lineCount);

  // Calculate stats
  const duplicateFiles = duplicates.reduce((sum, group) => sum + group.files.length, 0);
  const duplicateLines = duplicates.reduce(
    (sum, group) => sum + group.lineCount * (group.files.length - 1),
    0
  );

  return {
    allFiles: fileInfos,
    duplicates,
    stats: {
      totalFiles: allRouteFiles.length,
      duplicateFiles,
      duplicateLines,
      uniqueGroups: duplicates.length,
    },
  };
}

// Generate a suggested shared path for duplicate files
function suggestSharedPath(duplicateGroup: DuplicateGroup): string {
  const roles = duplicateGroup.files.map((f) => f.role);
  const uniqueRoles = Array.from(new Set(roles)).sort();

  // Extract the subdirectory structure (everything except the role)
  const firstFile = duplicateGroup.files[0].relativePath;
  const pathParts = firstFile.split('/');
  pathParts.shift(); // Remove role (first part)

  const subPath = pathParts.join('/');

  return `_shared/${subPath}`;
}

function main() {
  const routesDir = join(process.cwd(), 'app', 'routes');

  const { allFiles, duplicates, stats } = analyzeRouteFiles(routesDir);

  console.log('=' .repeat(80));
  console.log('📋 DUPLICATE DETECTION REPORT');
  console.log('='.repeat(80));
  console.log('');

  console.log('📊 Statistics:');
  console.log(`  Total files analyzed: ${stats.totalFiles}`);
  console.log(`  Duplicate files found: ${stats.duplicateFiles}`);
  console.log(`  Unique duplicate groups: ${stats.uniqueGroups}`);
  console.log(`  Duplicate lines of code: ${stats.duplicateLines.toLocaleString()}`);
  console.log('');

  if (duplicates.length === 0) {
    console.log('✅ No duplicate files found! Your codebase is clean.');
    process.exit(0);
  }

  console.log('🔍 Duplicate Groups:');
  console.log('='.repeat(80));
  console.log('');

  duplicates.forEach((group, index) => {
    const roles = Array.from(new Set(group.files.map((f) => f.role))).join(', ');
    const suggestedPath = suggestSharedPath(group);

    console.log(`${index + 1}. ${group.filename} (${group.lineCount} lines)`);
    console.log(`   Roles: ${roles}`);
    console.log(`   Duplicates:`);
    group.files.forEach((file) => {
      console.log(`     - ${file.relativePath}`);
    });
    console.log(`   💡 Suggested shared path: ${suggestedPath}`);
    console.log('');
  });

  console.log('='.repeat(80));
  console.log('');
  console.log('💾 Potential Savings:');
  console.log(`  Files reduced: ${stats.duplicateFiles} → ${stats.uniqueGroups}`);
  console.log(`  Lines saved: ${stats.duplicateLines.toLocaleString()}`);
  console.log('');
  console.log('📝 Next Steps:');
  console.log('  1. Review the duplicate groups above');
  console.log('  2. Run: npm run refactor:routes:dry-run (to preview changes)');
  console.log('  3. Run: npm run refactor:routes (to apply changes)');
  console.log('');
}

main();
