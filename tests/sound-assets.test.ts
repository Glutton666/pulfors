import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

const SOUND_DIR = path.join(process.cwd(), "assets", "sounds");
const TARGET_SETS = ["cowbell", "clave", "cajon", "stick"] as const;
const ROLES = ["strong", "high", "low"] as const;

function readWav(setName: string, role: string) {
  const filePath = path.join(SOUND_DIR, `${setName}-${role}.wav`);
  const buffer = fs.readFileSync(filePath);
  assert.equal(buffer.toString("ascii", 0, 4), "RIFF", `${filePath} must be a RIFF file`);
  assert.equal(buffer.toString("ascii", 8, 12), "WAVE", `${filePath} must be a WAVE file`);
  assert.equal(buffer.toString("ascii", 12, 16), "fmt ", `${filePath} must contain a fmt chunk`);
  assert.equal(buffer.readUInt16LE(20), 1, `${filePath} must use PCM encoding`);
  assert.equal(buffer.readUInt16LE(22), 1, `${filePath} must be mono`);
  assert.equal(buffer.readUInt32LE(24), 44100, `${filePath} must use 44.1 kHz`);
  assert.equal(buffer.readUInt16LE(34), 16, `${filePath} must use 16-bit samples`);

  const dataOffset = buffer.indexOf(Buffer.from("data")) + 8;
  assert.ok(dataOffset >= 8, `${filePath} must contain a data chunk`);
  assert.equal((buffer.length - dataOffset) % 2, 0, `${filePath} data must contain whole samples`);

  let peak = 0;
  let sumSquares = 0;
  const sampleCount = (buffer.length - dataOffset) / 2;
  for (let offset = dataOffset; offset < buffer.length; offset += 2) {
    const sample = buffer.readInt16LE(offset) / 32768;
    peak = Math.max(peak, Math.abs(sample));
    sumSquares += sample * sample;
  }
  assert.ok(sampleCount > 0, `${filePath} must contain samples`);
  assert.ok(peak > 0.1, `${filePath} must not be silent`);
  assert.ok(peak <= 1, `${filePath} must not clip`);

  return { byteLength: buffer.length, sampleCount, rms: Math.sqrt(sumSquares / sampleCount) };
}

test("identity sound sets have matching, valid role assets", () => {
  for (const setName of TARGET_SETS) {
    const files = ROLES.map((role) => readWav(setName, role));
    assert.equal(
      new Set(files.map((file) => file.sampleCount)).size,
      1,
      `${setName} strong/high/low must have the same duration`,
    );
    assert.ok(
      new Set(files.map((file) => file.byteLength)).size === 1,
      `${setName} strong/high/low must have the same WAV size`,
    );
    assert.ok(
      new Set(files.map((file) => file.rms.toFixed(4))).size > 1,
      `${setName} roles should not be identical copies`,
    );
  }
});