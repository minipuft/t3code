import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { assert, describe, expect, it } from "vite-plus/test";

import {
  ACTIVATION_MARKER_FILE_NAME,
  SESSION_INTERRUPTION_ACKNOWLEDGEMENT,
  activateStage,
  assertActivationAcknowledged,
  sealStage,
} from "./dev-server-bundle.mjs";

async function makeFixture() {
  const root = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3-dev-server-bundle-"));
  const stageDirectory = NodePath.join(root, "stage");
  const targetServerDirectory = NodePath.join(root, "server");
  await NodeFSP.mkdir(stageDirectory, { recursive: true });
  await NodeFSP.mkdir(NodePath.join(targetServerDirectory, "dist"), { recursive: true });
  await NodeFSP.writeFile(
    NodePath.join(targetServerDirectory, "package.json"),
    JSON.stringify({ name: "t3" }),
  );
  await NodeFSP.writeFile(NodePath.join(stageDirectory, "chunk-new.mjs"), "export const v = 2;\n");
  await NodeFSP.writeFile(NodePath.join(stageDirectory, "bin.mjs"), "import './chunk-new.mjs';\n");
  await NodeFSP.writeFile(NodePath.join(targetServerDirectory, "dist", "chunk-old.mjs"), "old\n");
  await NodeFSP.writeFile(NodePath.join(targetServerDirectory, "dist", "bin.mjs"), "old entry\n");
  return { root, stageDirectory, targetServerDirectory };
}

describe("development server bundle activation", () => {
  it("requires explicit acknowledgement that activation interrupts sessions", () => {
    expect(() => assertActivationAcknowledged([])).toThrow(/terminates active agent turns/);
    expect(() =>
      assertActivationAcknowledged([SESSION_INTERRUPTION_ACKNOWLEDGEMENT]),
    ).not.toThrow();
  });

  it("refuses programmatic activation before publishing a receipt", async () => {
    const fixture = await makeFixture();
    try {
      await sealStage(fixture);

      await expect(activateStage(fixture)).rejects.toThrow(/terminates active agent turns/);
      await expect(
        NodeFSP.access(
          NodePath.join(fixture.targetServerDirectory, "dist", ACTIVATION_MARKER_FILE_NAME),
        ),
      ).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await NodeFSP.rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("promotes verified files, preserves old chunks, and emits the activation receipt last", async () => {
    const fixture = await makeFixture();
    try {
      await sealStage(fixture);
      const receipt = await activateStage({
        ...fixture,
        acknowledgeSessionInterruption: true,
      });
      const dist = NodePath.join(fixture.targetServerDirectory, "dist");

      assert.equal(
        await NodeFSP.readFile(NodePath.join(dist, "bin.mjs"), "utf8"),
        "import './chunk-new.mjs';\n",
      );
      assert.equal(
        await NodeFSP.readFile(NodePath.join(dist, "chunk-new.mjs"), "utf8"),
        "export const v = 2;\n",
      );
      assert.equal(await NodeFSP.readFile(NodePath.join(dist, "chunk-old.mjs"), "utf8"), "old\n");
      assert.equal(receipt.fileCount, 2);
      assert.equal(
        JSON.parse(await NodeFSP.readFile(NodePath.join(dist, ACTIVATION_MARKER_FILE_NAME), "utf8"))
          .manifestSha256,
        receipt.manifestSha256,
      );
    } finally {
      await NodeFSP.rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects a changed staged file without publishing an activation receipt", async () => {
    const fixture = await makeFixture();
    try {
      await sealStage(fixture);
      await NodeFSP.writeFile(NodePath.join(fixture.stageDirectory, "bin.mjs"), "tampered\n");

      await expect(
        activateStage({
          ...fixture,
          acknowledgeSessionInterruption: true,
        }),
      ).rejects.toThrow(/failed verification: bin\.mjs/);
      await expect(
        NodeFSP.access(
          NodePath.join(fixture.targetServerDirectory, "dist", ACTIVATION_MARKER_FILE_NAME),
        ),
      ).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await NodeFSP.rm(fixture.root, { recursive: true, force: true });
    }
  });
});
