import * as NodeCrypto from "node:crypto";
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

export const ACTIVATION_MARKER_FILE_NAME = ".t3-dev-backend-activation.json";
export const STAGE_MANIFEST_FILE_NAME = "manifest.json";

const scriptDirectory = NodePath.dirname(NodeURL.fileURLToPath(import.meta.url));
const serverDirectory = NodePath.resolve(scriptDirectory, "..");
const repositoryRoot = NodePath.resolve(serverDirectory, "../..");
const defaultStageDirectory = NodePath.join(repositoryRoot, ".t3", "dev-server", "next");
const stableEntryFiles = new Set(["bin.mjs", "service-launcher.mjs"]);

async function hashFile(filePath) {
  const hash = NodeCrypto.createHash("sha256");
  hash.update(await NodeFSP.readFile(filePath));
  return hash.digest("hex");
}

async function listFiles(rootDirectory, currentDirectory = rootDirectory) {
  const entries = await NodeFSP.readdir(currentDirectory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = NodePath.join(currentDirectory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(rootDirectory, absolutePath)));
      continue;
    }
    if (!entry.isFile()) continue;

    const relativePath = NodePath.relative(rootDirectory, absolutePath);
    if (relativePath !== STAGE_MANIFEST_FILE_NAME) files.push(relativePath);
  }

  return files.sort((left, right) => left.localeCompare(right));
}

function assertSafeRelativePath(relativePath) {
  if (
    relativePath.length === 0 ||
    NodePath.isAbsolute(relativePath) ||
    relativePath === ".." ||
    relativePath.startsWith(`..${NodePath.sep}`)
  ) {
    throw new Error(`Unsafe staged bundle path: ${relativePath}`);
  }
}

async function writeJsonAtomically(filePath, value) {
  const temporaryPath = `${filePath}.next-${String(process.pid)}-${NodeCrypto.randomUUID()}`;
  await NodeFSP.mkdir(NodePath.dirname(filePath), { recursive: true });
  await NodeFSP.writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  try {
    await NodeFSP.rename(temporaryPath, filePath);
  } catch (error) {
    if (error?.code !== "EEXIST" && error?.code !== "EPERM") throw error;
    await NodeFSP.copyFile(temporaryPath, filePath);
    await NodeFSP.unlink(temporaryPath);
  }
}

export async function sealStage({ stageDirectory = defaultStageDirectory } = {}) {
  const relativePaths = await listFiles(stageDirectory);
  if (!relativePaths.includes("bin.mjs")) {
    throw new Error(`Staged server bundle is missing bin.mjs: ${stageDirectory}`);
  }

  const files = await Promise.all(
    relativePaths.map(async (relativePath) => {
      assertSafeRelativePath(relativePath);
      const absolutePath = NodePath.join(stageDirectory, relativePath);
      const stats = await NodeFSP.stat(absolutePath);
      return {
        path: relativePath,
        bytes: stats.size,
        mode: stats.mode & 0o777,
        sha256: await hashFile(absolutePath),
      };
    }),
  );
  const manifest = {
    version: 1,
    createdAt: new Date().toISOString(),
    files,
  };

  await writeJsonAtomically(NodePath.join(stageDirectory, STAGE_MANIFEST_FILE_NAME), manifest);
  return manifest;
}

async function readAndVerifyManifest(stageDirectory) {
  const manifestPath = NodePath.join(stageDirectory, STAGE_MANIFEST_FILE_NAME);
  const manifest = JSON.parse(await NodeFSP.readFile(manifestPath, "utf8"));
  if (manifest.version !== 1 || !Array.isArray(manifest.files)) {
    throw new Error(`Unsupported staged server manifest: ${manifestPath}`);
  }
  if (!manifest.files.some((file) => file.path === "bin.mjs")) {
    throw new Error(`Staged server manifest is missing bin.mjs: ${manifestPath}`);
  }

  for (const file of manifest.files) {
    assertSafeRelativePath(file.path);
    const absolutePath = NodePath.join(stageDirectory, file.path);
    const stats = await NodeFSP.stat(absolutePath);
    if (stats.size !== file.bytes || (await hashFile(absolutePath)) !== file.sha256) {
      throw new Error(`Staged server artifact failed verification: ${file.path}`);
    }
  }

  return manifest;
}

async function assertServerDirectory(targetServerDirectory) {
  const packagePath = NodePath.join(targetServerDirectory, "package.json");
  const packageJson = JSON.parse(await NodeFSP.readFile(packagePath, "utf8"));
  if (packageJson.name !== "t3") {
    throw new Error(`Activation target is not the T3 server package: ${targetServerDirectory}`);
  }
}

async function promoteFile(sourcePath, destinationPath, mode) {
  const temporaryPath = NodePath.join(
    NodePath.dirname(destinationPath),
    `.${NodePath.basename(destinationPath)}.activate-${String(process.pid)}-${NodeCrypto.randomUUID()}`,
  );
  await NodeFSP.mkdir(NodePath.dirname(destinationPath), { recursive: true });
  await NodeFSP.copyFile(sourcePath, temporaryPath);
  await NodeFSP.chmod(temporaryPath, mode);
  try {
    await NodeFSP.rename(temporaryPath, destinationPath);
  } catch (error) {
    if (error?.code !== "EEXIST" && error?.code !== "EPERM") throw error;
    await NodeFSP.copyFile(temporaryPath, destinationPath);
    await NodeFSP.chmod(destinationPath, mode);
    await NodeFSP.unlink(temporaryPath);
  }
}

export async function activateStage({
  stageDirectory = defaultStageDirectory,
  targetServerDirectory = serverDirectory,
} = {}) {
  await assertServerDirectory(targetServerDirectory);
  const manifest = await readAndVerifyManifest(stageDirectory);
  const targetDistDirectory = NodePath.join(targetServerDirectory, "dist");
  const orderedFiles = [...manifest.files].sort((left, right) => {
    const leftIsEntry = stableEntryFiles.has(left.path);
    const rightIsEntry = stableEntryFiles.has(right.path);
    if (leftIsEntry !== rightIsEntry) return leftIsEntry ? 1 : -1;
    return left.path.localeCompare(right.path);
  });

  for (const file of orderedFiles) {
    await promoteFile(
      NodePath.join(stageDirectory, file.path),
      NodePath.join(targetDistDirectory, file.path),
      file.mode,
    );
  }

  const manifestSha256 = NodeCrypto.createHash("sha256")
    .update(JSON.stringify(manifest))
    .digest("hex");
  const receipt = {
    version: 1,
    activatedAt: new Date().toISOString(),
    manifestSha256,
    fileCount: manifest.files.length,
  };
  await writeJsonAtomically(
    NodePath.join(targetDistDirectory, ACTIVATION_MARKER_FILE_NAME),
    receipt,
  );
  return receipt;
}

function readArgument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function main() {
  const command = process.argv[2];
  const stageDirectory = readArgument("--stage-dir") ?? defaultStageDirectory;

  if (command === "seal") {
    const manifest = await sealStage({ stageDirectory });
    console.log(`Staged ${String(manifest.files.length)} verified server artifacts.`);
    return;
  }
  if (command === "activate") {
    const targetServerDirectory = readArgument("--target-server-dir") ?? serverDirectory;
    const receipt = await activateStage({ stageDirectory, targetServerDirectory });
    console.log(
      `Activated ${String(receipt.fileCount)} server artifacts without relaunching Electron.`,
    );
    return;
  }

  throw new Error(
    "Usage: dev-server-bundle.mjs <seal|activate> [--stage-dir <path>] [--target-server-dir <path>]",
  );
}

if (
  process.argv[1] &&
  NodePath.resolve(process.argv[1]) === NodeURL.fileURLToPath(import.meta.url)
) {
  await main();
}
