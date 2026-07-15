/**
 * backup-import-size-fallback.test.ts
 *
 * Regression test for the fallback native size-check that runs when the
 * DocumentPicker does not provide asset.size.  Covers importBackup() and
 * importPracticeEntry() — both paths must reject oversized files even when
 * the picker returns `size: undefined`.
 */

import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { MAX_IMPORT_JSON_CHARS } from "../lib/backup/shared";

const FileSystemStub = require("./_stubs/expo-file-system");
const DocumentPickerStub = require("./_stubs/expo-document-picker");
const AsyncStorage = require("./_stubs/async-storage");

beforeEach(() => {
  AsyncStorage.__reset();
  FileSystemStub.readAsStringAsync = async () => "";
  FileSystemStub.getInfoAsync = async () => ({ exists: false });
  DocumentPickerStub.getDocumentAsync = async () => ({ canceled: true, assets: null });
});

afterEach(() => {
  FileSystemStub.readAsStringAsync = async () => "";
  FileSystemStub.getInfoAsync = async () => ({ exists: false });
  DocumentPickerStub.getDocumentAsync = async () => ({ canceled: true, assets: null });
});

const OVER_LIMIT = MAX_IMPORT_JSON_CHARS + 1;

test("importBackup: picker size absent + fs stat oversized → rejected without reading file", async () => {
  let fileWasRead = false;
  FileSystemStub.readAsStringAsync = async () => {
    fileWasRead = true;
    return "";
  };
  FileSystemStub.getInfoAsync = async () => ({ exists: true, size: OVER_LIMIT });
  DocumentPickerStub.getDocumentAsync = async () => ({
    canceled: false,
    assets: [{ uri: "file:///stub/huge.json" }],
  });

  const { importBackup } = require("../lib/backup/full");
  const result = await importBackup();
  assert.equal(result.success, false);
  assert.equal(fileWasRead, false, "File must not be read when fs stat shows it is too large");
});

test("importBackup: picker size present and oversized → rejected without fs stat", async () => {
  let statWasCalled = false;
  FileSystemStub.getInfoAsync = async () => {
    statWasCalled = true;
    return { exists: true, size: OVER_LIMIT };
  };
  DocumentPickerStub.getDocumentAsync = async () => ({
    canceled: false,
    assets: [{ uri: "file:///stub/huge.json", size: OVER_LIMIT }],
  });

  const { importBackup } = require("../lib/backup/full");
  const result = await importBackup();
  assert.equal(result.success, false);
  assert.equal(statWasCalled, false, "fs stat must not be called when picker already reported size");
});

test("importBackup: picker size absent + fs stat within limit → proceeds to read", async () => {
  let fileWasRead = false;
  FileSystemStub.readAsStringAsync = async () => {
    fileWasRead = true;
    return "{}";
  };
  FileSystemStub.getInfoAsync = async () => ({ exists: true, size: 100 });
  DocumentPickerStub.getDocumentAsync = async () => ({
    canceled: false,
    assets: [{ uri: "file:///stub/ok.json" }],
  });

  const { importBackup } = require("../lib/backup/full");
  await importBackup();
  assert.equal(fileWasRead, true, "File should be read when fs stat shows size is within limit");
});

test("importBackup: picker size absent + fs stat missing size → proceeds cautiously", async () => {
  let fileWasRead = false;
  FileSystemStub.readAsStringAsync = async () => {
    fileWasRead = true;
    return "{}";
  };
  FileSystemStub.getInfoAsync = async () => ({ exists: true });
  DocumentPickerStub.getDocumentAsync = async () => ({
    canceled: false,
    assets: [{ uri: "file:///stub/nosize.json" }],
  });

  const { importBackup } = require("../lib/backup/full");
  await importBackup();
  assert.equal(fileWasRead, true, "File should be read when fs stat does not report a size");
});

test("importPracticeEntry: picker size present and oversized → rejected without fs stat", async () => {
  let statWasCalled = false;
  FileSystemStub.getInfoAsync = async () => {
    statWasCalled = true;
    return { exists: true, size: OVER_LIMIT };
  };
  DocumentPickerStub.getDocumentAsync = async () => ({
    canceled: false,
    assets: [{ uri: "file:///stub/huge.json", size: OVER_LIMIT }],
  });

  const { importPracticeEntry } = require("../lib/backup/practice");
  const result = await importPracticeEntry();
  assert.equal(result.success, false);
  assert.equal(statWasCalled, false, "fs stat must not be called when picker already reported size");
});

test("importPracticeEntry: picker size absent + fs stat oversized → rejected without reading file", async () => {
  let fileWasRead = false;
  FileSystemStub.readAsStringAsync = async () => {
    fileWasRead = true;
    return "";
  };
  FileSystemStub.getInfoAsync = async () => ({ exists: true, size: OVER_LIMIT });
  DocumentPickerStub.getDocumentAsync = async () => ({
    canceled: false,
    assets: [{ uri: "file:///stub/huge.json" }],
  });

  const { importPracticeEntry } = require("../lib/backup/practice");
  const result = await importPracticeEntry();
  assert.equal(result.success, false);
  assert.equal(fileWasRead, false, "File must not be read when fs stat shows it is too large");
});

test("importPracticeEntry: picker size absent + fs stat within limit → proceeds to read", async () => {
  let fileWasRead = false;
  FileSystemStub.readAsStringAsync = async () => {
    fileWasRead = true;
    return "{}";
  };
  FileSystemStub.getInfoAsync = async () => ({ exists: true, size: 100 });
  DocumentPickerStub.getDocumentAsync = async () => ({
    canceled: false,
    assets: [{ uri: "file:///stub/ok.json" }],
  });

  const { importPracticeEntry } = require("../lib/backup/practice");
  await importPracticeEntry();
  assert.equal(fileWasRead, true, "File should be read when size is within limit");
});

// getInfoAsync throw cases: both paths must fail open (proceed to read) when
// the filesystem stat itself throws, because the thrown error may be transient
// and we prefer compatibility over false rejection. The parse-time string-length
// guard in restoreFromJson / parsePracticeJson still catches oversized content.

test("importBackup: picker size absent + getInfoAsync throws → proceeds cautiously (fail open)", async () => {
  let fileWasRead = false;
  FileSystemStub.readAsStringAsync = async () => {
    fileWasRead = true;
    return "{}";
  };
  FileSystemStub.getInfoAsync = async () => {
    throw new Error("simulated stat failure");
  };
  DocumentPickerStub.getDocumentAsync = async () => ({
    canceled: false,
    assets: [{ uri: "file:///stub/unknown.json" }],
  });

  const { importBackup } = require("../lib/backup/full");
  await importBackup();
  assert.equal(fileWasRead, true, "When stat throws, file should still be attempted (parse-time guard is the backstop)");
});

test("importPracticeEntry: picker size absent + getInfoAsync throws → proceeds cautiously (fail open)", async () => {
  let fileWasRead = false;
  FileSystemStub.readAsStringAsync = async () => {
    fileWasRead = true;
    return "{}";
  };
  FileSystemStub.getInfoAsync = async () => {
    throw new Error("simulated stat failure");
  };
  DocumentPickerStub.getDocumentAsync = async () => ({
    canceled: false,
    assets: [{ uri: "file:///stub/unknown.json" }],
  });

  const { importPracticeEntry } = require("../lib/backup/practice");
  await importPracticeEntry();
  assert.equal(fileWasRead, true, "When stat throws, file should still be attempted (parse-time guard is the backstop)");
});
