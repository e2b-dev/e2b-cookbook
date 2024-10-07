import { promises as fs, readFileSync } from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import ignore, { Ignore } from 'ignore';

// Read and parse a .env file
export function readEnvFile(filePath: string = '.env'): Record<string, string> {
  const envPath = path.resolve(process.cwd(), filePath);
  return dotenv.parse(readFileSync(envPath, 'utf-8'));
}

// Read and parse a .gitignore file
export async function readIgnoreFile(gitignorePath: string = '.gitignore'): Promise<Ignore> {
  const ig = ignore();

  // Read and parse .gitignore if it exists
  try {
    const gitignoreFile = path.resolve(gitignorePath);
    const gitignoreContent = await fs.readFile(gitignoreFile, 'utf8');
    ig.add(gitignoreContent.split('\n').filter(Boolean));
  } catch (err) {
    // No .gitignore file, proceed without ignoring any files
  }

  return ig;
}

// Recursively list files, using an ignore policy
async function listFilesRecursively(directory: string, ig: Ignore): Promise<string[]> {
  let results = [];
  const list = await fs.readdir(directory, { withFileTypes: true });
  
  for (const file of list) {
    // List the directory, skipping files to ignore
    const filePath = path.resolve(directory, file.name);
    const relativePath = path.relative(process.cwd(), filePath);
    if (ig.ignores(relativePath)) continue;
    
    // Recursively list subdirectories
    if (file.isDirectory()) {
      const subdirFiles = await listFilesRecursively(filePath, ig);
      results = results.concat(subdirFiles);
    } else {
      results.push(filePath);
    }
  }

  return results;
};

// Upload all files and subdirectories from a local directory to an E2B sandbox
export async function uploadPathToPath(sourcePath: string, destinationBasePath: string, sandbox: any): Promise<void> {
  const stat = await fs.stat(sourcePath);
  const isDirectory = stat.isDirectory();
  const sourceDirectory = isDirectory ? sourcePath : path.dirname(sourcePath);
  const files = await listFilesRecursively(sourceDirectory, await readIgnoreFile());

  for (const localFilePath of files) {
    const relativeFilePath = path.relative(sourceDirectory, localFilePath);
    const destinationFilePath = path.join(destinationBasePath, relativeFilePath);
    const fileContent = await fs.readFile(localFilePath);
    await sandbox.files.write(destinationFilePath, fileContent.toString());
  }
};