// ============================================================
// 악보 모드 — 내보내기·불러오기·성부분리 IO
// ============================================================

import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import * as Crypto from "expo-crypto";
import { captureRef } from "react-native-view-shot";
import { Platform } from "react-native";
import { logger } from "./logger";
import { saveScore } from "./score-storage";
import type {
  ScoreDocument,
  ScorePart,
} from "./score-types";
import {
  migrateLegacyLayoutOverrides,
  INSTRUMENTS,
  DRUM_TYPES,
  getTupletNormalCount,
} from "./score-types";
import {
  formatDateForFilename,
  downloadJsonWeb,
  writeStringToFile,
  readStringFromFile,
  pickFileWeb,
} from "./backup/shared";

const PULFORS_EXT = ".pulfors";
const PULFORS_MAGIC = "pulfors_score_v1";
const MAX_PULFORS_JSON_CHARS = 50 * 1024 * 1024;

interface PulforsFile {
  _type: typeof PULFORS_MAGIC;
  createdAt: string;
  doc: ScoreDocument;
}

function isPulforsFile(v: unknown): v is PulforsFile {
  return (
    typeof v === "object" &&
    v !== null &&
    (v as Record<string, unknown>)._type === PULFORS_MAGIC &&
    typeof (v as Record<string, unknown>).createdAt === "string" &&
    typeof (v as Record<string, unknown>).doc === "object"
  );
}

// ── .pulfors JSON 내보내기 ────────────────────────────────────

export async function exportScoreAsJson(doc: ScoreDocument): Promise<boolean> {
  try {
    const payload: PulforsFile = {
      _type: PULFORS_MAGIC,
      createdAt: new Date().toISOString(),
      doc,
    };
    const json = JSON.stringify(payload);
    const safeName = (doc.metadata.title || "score")
      .replace(/[^a-zA-Z0-9가-힣_-]/g, "_")
      .slice(0, 30);
    const filename = `${safeName}_${formatDateForFilename()}${PULFORS_EXT}`;

    if (Platform.OS === "web") {
      downloadJsonWeb(json, filename);
      return true;
    }

    const fileUri = (FileSystem.cacheDirectory ?? "") + filename;
    await writeStringToFile(fileUri, json);

    const canShare = await Sharing.isAvailableAsync();
    if (!canShare) {
      logger.warn("[ScoreIO] Sharing not available");
      return false;
    }
    await Sharing.shareAsync(fileUri, {
      mimeType: "application/json",
      dialogTitle: doc.metadata.title || "Score",
      UTI: "public.json",
    });
    return true;
  } catch (e) {
    logger.warn("[ScoreIO] exportScoreAsJson error:", e);
    return false;
  }
}

// ── .pulfors JSON 공유 (내보내기와 동일하지만 의미론적으로 분리) ─

export const shareScore = exportScoreAsJson;

// ── .score.json 공유 (외부 공유용, 에디터에서 바로 열 수 있음) ──

export async function shareScoreAsScoreJson(doc: ScoreDocument): Promise<boolean> {
  try {
    const payload: PulforsFile = {
      _type: PULFORS_MAGIC,
      createdAt: new Date().toISOString(),
      doc,
    };
    const json = JSON.stringify(payload);
    const safeName = (doc.metadata.title || "score")
      .replace(/[^a-zA-Z0-9가-힣_-]/g, "_")
      .slice(0, 30);
    const filename = `${safeName}.score.json`;

    if (Platform.OS === "web") {
      downloadJsonWeb(json, filename);
      return true;
    }

    const fileUri = (FileSystem.cacheDirectory ?? "") + filename;
    await writeStringToFile(fileUri, json);

    const canShare = await Sharing.isAvailableAsync();
    if (!canShare) {
      logger.warn("[ScoreIO] Sharing not available");
      return false;
    }
    await Sharing.shareAsync(fileUri, {
      mimeType: "application/json",
      dialogTitle: doc.metadata.title || "Score",
      UTI: "public.json",
    });
    return true;
  } catch (e) {
    logger.warn("[ScoreIO] shareScoreAsScoreJson error:", e);
    return false;
  }
}

// ── PNG 내보내기 (captureRef 기반) ────────────────────────────

export async function exportScoreAsPng(
  viewRef: React.RefObject<unknown>,
  doc: ScoreDocument,
): Promise<boolean> {
  try {
    const uri: string = await captureRef(viewRef as any, {
      format: "png",
      quality: 1,
    });
    if (Platform.OS === "web") {
      const a = document.createElement("a");
      a.href = uri;
      const safeName = (doc.metadata.title || "score")
        .replace(/[^a-zA-Z0-9가-힣_-]/g, "_")
        .slice(0, 30);
      a.download = `${safeName}_${formatDateForFilename()}.png`;
      a.click();
      return true;
    }
    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(uri, {
        mimeType: "image/png",
        dialogTitle: doc.metadata.title || "Score",
        UTI: "public.png",
      });
      return true;
    }
    logger.warn("[ScoreIO] Sharing not available for PNG");
    return false;
  } catch (e) {
    logger.warn("[ScoreIO] exportScoreAsPng error:", e);
    return false;
  }
}

// ── PNG 내보내기 (여러 페이지) ────────────────────────────────

export async function exportScorePagesAsPng(
  pageRefs: React.RefObject<unknown>[],
  doc: ScoreDocument,
): Promise<boolean> {
  try {
    const refs = pageRefs.filter((r) => !!(r as any)?.current);
    if (refs.length === 0) return false;
    const safeName = (doc.metadata.title || "score")
      .replace(/[^a-zA-Z0-9가-힣_-]/g, "_")
      .slice(0, 30);
    const dateStr = formatDateForFilename();
    const multi = refs.length > 1;

    const uris: string[] = [];
    for (const ref of refs) {
      const uri: string = await captureRef(ref as any, { format: "png", quality: 1 });
      uris.push(uri);
    }

    if (Platform.OS === "web") {
      uris.forEach((uri, i) => {
        const a = document.createElement("a");
        a.href = uri;
        a.download = multi
          ? `${safeName}_${dateStr}_p${i + 1}.png`
          : `${safeName}_${dateStr}.png`;
        a.click();
      });
      return true;
    }

    const canShare = await Sharing.isAvailableAsync();
    if (!canShare) {
      logger.warn("[ScoreIO] Sharing not available for PNG");
      return false;
    }
    for (let i = 0; i < uris.length; i++) {
      await Sharing.shareAsync(uris[i], {
        mimeType: "image/png",
        dialogTitle: multi
          ? `${doc.metadata.title || "Score"} (${i + 1}/${uris.length})`
          : doc.metadata.title || "Score",
        UTI: "public.png",
      });
    }
    return true;
  } catch (e) {
    logger.warn("[ScoreIO] exportScorePagesAsPng error:", e);
    return false;
  }
}

// ── .pulfors 파일 불러오기 ────────────────────────────────────

export interface ImportScoreResult {
  success: boolean;
  doc?: ScoreDocument;
  errorCode?: "invalid" | "io" | "cancelled";
  /** Invalid imports include the first failing field so the user can fix the file. */
  errorMessage?: string;
}

export async function importScoreFromJson(): Promise<ImportScoreResult> {
  try {
    if (Platform.OS === "web") {
      return pickFileWeb<ImportScoreResult>(
        `${PULFORS_EXT},.json`,
        parsePulforsJson,
        { success: false, errorCode: "cancelled" },
      );
    }

    const result = await DocumentPicker.getDocumentAsync({
      type: ["application/json", "*/*"],
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets?.[0]) {
      return { success: false, errorCode: "cancelled" };
    }
    const asset = result.assets[0];
    if (typeof asset.size === "number" && asset.size > MAX_PULFORS_JSON_CHARS) {
      return { success: false, errorCode: "io" };
    }
    const json = await readStringFromFile(asset.uri);
    return await parsePulforsJson(json);
  } catch (e) {
    logger.warn("[ScoreIO] importScoreFromJson error:", e);
    return { success: false, errorCode: "io" };
  }
}

export async function parsePulforsJson(json: string): Promise<ImportScoreResult> {
  if (typeof json !== "string" || json.length > MAX_PULFORS_JSON_CHARS) {
    return invalidScore("the file is empty or larger than the 50 MB limit");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    logger.warn("[ScoreIO] parsePulforsJson JSON error:", e);
    return invalidScore("the JSON is malformed");
  }
  if (!isPulforsFile(parsed)) {
    return invalidScore("missing the pulfors score wrapper, creation date, or document");
  }
  const validationError = validateScoreDocument(parsed.doc);
  if (validationError) {
    return invalidScore(validationError);
  }
  const rawDoc = parsed.doc;
  const now = Date.now();
  const doc: ScoreDocument = migrateLegacyLayoutOverrides({
    ...rawDoc,
    id: Crypto.randomUUID(),
    metadata: { ...rawDoc.metadata, updatedAt: now },
  });
  try {
    await saveScore(doc);
    return { success: true, doc };
  } catch (e) {
    logger.warn("[ScoreIO] parsePulforsJson save error:", e);
    return { success: false, errorCode: "io" };
  }
}

function invalidScore(reason: string): ImportScoreResult {
  return {
    success: false,
    errorCode: "invalid",
    errorMessage: `Score file error: ${reason}`,
  };
}

const CLEFS = new Set<unknown>(["treble", "bass", "alto", "tenor", "percussion"]);
const NOTE_DURATIONS = new Set<unknown>([
  "whole", "half", "quarter", "eighth", "sixteenth", "thirty_second",
  "whole_dot", "half_dot", "quarter_dot", "eighth_dot", "sixteenth_dot",
  "thirty_second_dot",
]);
const PITCH_STEPS = new Set<unknown>(["C", "D", "E", "F", "G", "A", "B"]);
const ACCIDENTALS = new Set<unknown>(["sharp", "flat", "natural", "double_sharp", "double_flat"]);
const NOTE_HEADS = new Set<unknown>(["normal", "cross", "cross_open", "open_circle", "diamond", "triangle", "slash"]);
const DIFFICULTIES = new Set<unknown>(["beginner", "intermediate", "advanced", "expert"]);
const DYNAMICS = new Set<unknown>(["pppp", "ppp", "pp", "p", "mp", "mf", "f", "ff", "fff", "ffff", "sfz", "fp", "mute"]);
const ARTICULATIONS = new Set<unknown>([
  "staccato", "tenuto", "accent", "marcato", "fermata", "staccatissimo",
  "portato", "snap_pizzicato", "left_hand_pizzicato",
]);
const ORNAMENTS = new Set<unknown>([
  "trill", "mordent", "turn", "tremolo", "grace_note", "glissando",
  "arpeggio_up", "arpeggio_down",
]);
const TEMPO_CHANGE_TYPES = new Set<unknown>(["fixed", "rit", "accel"]);
const JUMP_TARGETS = new Set<unknown>(["start", "segno", "coda", "fine"]);
const VALID_DRUM_TYPES = new Set<unknown>(DRUM_TYPES);
const MIN_SCORE_BPM = 20;
const MAX_SCORE_BPM = 300;
const MAX_TIME_SIGNATURE_COMPONENT = 99;
const MAX_PLAYABLE_MEASURE_DURATION_MS = 24 * 60 * 60 * 1000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isSafeId(value: unknown): value is string {
  return isNonEmptyString(value) &&
    !Object.prototype.hasOwnProperty.call(Object.prototype, value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isPositiveInteger(value: unknown): value is number {
  return isFiniteNumber(value) && Number.isSafeInteger(value) && value > 0;
}

export function validateScoreTimeSignature(
  value: unknown,
  path = "timeSignature",
): string | null {
  if (!isRecord(value)) return `${path} must be an object`;
  if (!isPositiveInteger(value.numerator) || value.numerator > MAX_TIME_SIGNATURE_COMPONENT) {
    return `${path}.numerator must be an integer from 1 to ${MAX_TIME_SIGNATURE_COMPONENT}`;
  }
  if (!isPositiveInteger(value.denominator) || value.denominator > MAX_TIME_SIGNATURE_COMPONENT) {
    return `${path}.denominator must be an integer from 1 to ${MAX_TIME_SIGNATURE_COMPONENT}`;
  }
  const durationAtMinimumBpm =
    value.numerator * (4 / value.denominator) * (60 / MIN_SCORE_BPM) * 1000;
  if (!Number.isFinite(durationAtMinimumBpm) ||
      durationAtMinimumBpm > MAX_PLAYABLE_MEASURE_DURATION_MS) {
    return `${path}.numerator produces a measure longer than 24 hours`;
  }
  return null;
}

function validateOptionalString(record: Record<string, unknown>, key: string, path: string): string | null {
  if (record[key] !== undefined && typeof record[key] !== "string") {
    return `${path}.${key} must be a string`;
  }
  return null;
}

function validateOptionalBoolean(record: Record<string, unknown>, key: string, path: string): string | null {
  if (record[key] !== undefined && typeof record[key] !== "boolean") {
    return `${path}.${key} must be a boolean`;
  }
  return null;
}

function validatePitch(value: unknown, path: string): string | null {
  if (!isRecord(value)) return `${path} must be an object`;
  if (!PITCH_STEPS.has(value.step)) return `${path}.step is not a valid note name`;
  if (!isFiniteNumber(value.octave) || !Number.isInteger(value.octave) || value.octave < 0 || value.octave > 8) {
    return `${path}.octave must be an integer from 0 to 8`;
  }
  if (value.accidental !== undefined && !ACCIDENTALS.has(value.accidental)) {
    return `${path}.accidental is not a valid accidental`;
  }
  return null;
}

function validateElement(value: unknown, path: string): string | null {
  if (!isRecord(value)) return `${path} must be an object`;
  if (!isSafeId(value.id)) return `${path}.id must be a safe non-empty string`;
  if (value.type !== "note" && value.type !== "rest") return `${path}.type must be note or rest`;
  if (!NOTE_DURATIONS.has(value.duration)) return `${path}.duration is not a valid duration`;

  const optionalBooleans = value.type === "note"
    ? ["dotted", "doubleDotted", "tieStart", "tieEnd", "slurStart", "slurEnd", "bowUp", "bowDown",
      "harmonic", "pizzicato", "arco", "pedal", "pedalEnd", "arpeggio"]
    : ["dotted"];
  for (const key of optionalBooleans) {
    const error = validateOptionalBoolean(value, key, path);
    if (error) return error;
  }

  if (value.type === "note") {
    const pitchError = validatePitch(value.pitch, `${path}.pitch`);
    if (pitchError) return pitchError;
    if (value.accidental !== undefined && !ACCIDENTALS.has(value.accidental)) {
      return `${path}.accidental is not valid`;
    }
    if (value.noteHead !== undefined && !NOTE_HEADS.has(value.noteHead)) {
      return `${path}.noteHead is not valid`;
    }
    if (value.dynamic !== undefined && !DYNAMICS.has(value.dynamic)) {
      return `${path}.dynamic is not valid`;
    }
    if (value.articulations !== undefined) {
      if (!Array.isArray(value.articulations) || value.articulations.some((v) => !ARTICULATIONS.has(v))) {
        return `${path}.articulations must contain valid articulation names`;
      }
    }
    if (value.ornament !== undefined && !ORNAMENTS.has(value.ornament)) {
      return `${path}.ornament is not valid`;
    }
    if (value.ottava !== undefined && ![1, 2, -1, -2].includes(value.ottava as number)) {
      return `${path}.ottava is not valid`;
    }
    if (value.drumType !== undefined && !VALID_DRUM_TYPES.has(value.drumType)) {
      return `${path}.drumType is not valid`;
    }
    for (const key of ["slurEndNoteId", "lyric"]) {
      const error = validateOptionalString(value, key, path);
      if (error) return error;
    }
  }
  return null;
}

function validateTuplets(value: unknown, path: string, elementIds: string[]): string | null {
  if (value === undefined) return null;
  if (!Array.isArray(value)) return `${path} must be an array`;
  const validElementIds = new Set(elementIds);
  const elementPositions = new Map(elementIds.map((id, index) => [id, index]));
  const usedElementIds = new Set<string>();
  const groupIds = new Set<string>();
  for (let i = 0; i < value.length; i++) {
    const tuplet = value[i];
    const itemPath = `${path}[${i}]`;
    if (!isRecord(tuplet)) return `${itemPath} must be an object`;
    if (!isSafeId(tuplet.id)) return `${itemPath}.id must be a safe non-empty string`;
    if (groupIds.has(tuplet.id)) return `${path} contains duplicate group id "${tuplet.id}"`;
    groupIds.add(tuplet.id);
    if (!Array.isArray(tuplet.elementIds) || tuplet.elementIds.length < 2 ||
        tuplet.elementIds.some((id) => !isNonEmptyString(id) || !validElementIds.has(id))) {
      return `${itemPath}.elementIds must reference at least two elements in the measure`;
    }
    const groupElementIds = tuplet.elementIds as string[];
    if (new Set(groupElementIds).size !== groupElementIds.length) {
      return `${itemPath}.elementIds must not contain duplicates`;
    }
    const positions = groupElementIds.map((id) => elementPositions.get(id) as number);
    if (positions.some((position, index) => index > 0 && position !== positions[0] + index)) {
      return `${itemPath}.elementIds must be contiguous and follow measure order`;
    }
    if (groupElementIds.some((id) => usedElementIds.has(id))) {
      return `${itemPath}.elementIds overlaps another tuplet group`;
    }
    if (!isPositiveInteger(tuplet.count) || tuplet.count < 2 || !isPositiveInteger(tuplet.normalCount)) {
      return `${itemPath}.count must be at least 2 and normalCount must be a positive integer`;
    }
    if (tuplet.count !== groupElementIds.length) {
      return `${itemPath}.count must match elementIds.length`;
    }
    if (tuplet.normalCount !== getTupletNormalCount(tuplet.count)) {
      return `${itemPath}.normalCount does not match the standard ratio for count`;
    }
    groupElementIds.forEach((id) => usedElementIds.add(id));
  }
  return null;
}

function validateMeasure(value: unknown, path: string): string | null {
  if (!isRecord(value)) return `${path} must be an object`;
  if (!isSafeId(value.id)) return `${path}.id must be a safe non-empty string`;
  if (!Array.isArray(value.elements)) return `${path}.elements must be an array`;

  const elementIds = new Set<string>();
  for (let i = 0; i < value.elements.length; i++) {
    const element = value.elements[i];
    const error = validateElement(element, `${path}.elements[${i}]`);
    if (error) return error;
    const id = (element as Record<string, unknown>).id as string;
    if (elementIds.has(id)) return `${path}.elements contains duplicate id "${id}"`;
    elementIds.add(id);
  }
  const timeSignatureError = value.timeSignature === undefined
    ? null
    : validateScoreTimeSignature(value.timeSignature, `${path}.timeSignature`);
  if (timeSignatureError) return timeSignatureError;
  for (const key of ["bpm", "tempoEndBpm"]) {
    if (value[key] !== undefined &&
        (!isFiniteNumber(value[key]) || (value[key] as number) < MIN_SCORE_BPM ||
          (value[key] as number) > MAX_SCORE_BPM)) {
      return `${path}.${key} must be from ${MIN_SCORE_BPM} to ${MAX_SCORE_BPM}`;
    }
  }
  for (const key of ["tempoText", "jumpText", "rehearsalMark", "linkedPracticeEntryId"]) {
    const error = validateOptionalString(value, key, path);
    if (error) return error;
  }
  if (value.tempoChangeType !== undefined && !TEMPO_CHANGE_TYPES.has(value.tempoChangeType)) {
    return `${path}.tempoChangeType is not valid`;
  }
  if (value.jumpTo !== undefined && !JUMP_TARGETS.has(value.jumpTo)) {
    return `${path}.jumpTo is not valid`;
  }
  if (value.dynamic !== undefined && !DYNAMICS.has(value.dynamic)) {
    return `${path}.dynamic is not valid`;
  }
  if (value.clef !== undefined && !CLEFS.has(value.clef)) return `${path}.clef is not valid`;
  if (value.keySignature !== undefined) {
    if (!isRecord(value.keySignature) || !isFiniteNumber(value.keySignature.sharps) ||
        !Number.isInteger(value.keySignature.sharps) || value.keySignature.sharps < -7 || value.keySignature.sharps > 7) {
      return `${path}.keySignature.sharps must be an integer from -7 to 7`;
    }
  }
  const tupletError = validateTuplets(value.tuplets, `${path}.tuplets`, [...elementIds]);
  if (tupletError) return tupletError;
  for (const key of ["repeatStart", "repeatEnd", "voltaBracketEnd", "segno", "coda", "crescStart",
    "crescEnd", "decrescStart", "decrescEnd"]) {
    const error = validateOptionalBoolean(value, key, path);
    if (error) return error;
  }
  if (value.voltaBracket !== undefined && !isPositiveInteger(value.voltaBracket)) {
    return `${path}.voltaBracket must be a positive integer`;
  }
  for (const key of ["crescNoteStartId", "crescNoteEndId", "decrescNoteStartId", "decrescNoteEndId"]) {
    const error = validateOptionalString(value, key, path);
    if (error) return error;
  }
  return null;
}

function validatePart(
  value: unknown,
  path: string,
  documentMeasures: Map<string, Set<string>>,
  documentElementIds: Set<string>,
): string | null {
  if (!isRecord(value)) return `${path} must be an object`;
  if (!isSafeId(value.id)) return `${path}.id must be a safe non-empty string`;
  if (!isNonEmptyString(value.instrumentId)) return `${path}.instrumentId must be a non-empty string`;
  if (!Object.prototype.hasOwnProperty.call(INSTRUMENTS, value.instrumentId)) {
    return `${path}.instrumentId is not a supported instrument`;
  }
  if (!CLEFS.has(value.clef)) return `${path}.clef is not valid`;
  if (!Array.isArray(value.measures) || value.measures.length === 0) {
    return `${path}.measures must contain at least one measure`;
  }
  const measureIds = new Set<string>();
  for (let i = 0; i < value.measures.length; i++) {
    const error = validateMeasure(value.measures[i], `${path}.measures[${i}]`);
    if (error) return error;
    const id = (value.measures[i] as Record<string, unknown>).id as string;
    if (measureIds.has(id)) return `${path}.measures contains duplicate id "${id}"`;
    if (documentMeasures.has(id)) return `doc.parts contains duplicate measure id "${id}"`;
    measureIds.add(id);
    const elements = (value.measures[i] as Record<string, unknown>).elements as Record<string, unknown>[];
    const currentElementIds = elements.map((element) => element.id as string);
    for (const elementId of currentElementIds) {
      if (documentElementIds.has(elementId)) {
        return `doc.parts contains duplicate element id "${elementId}"`;
      }
      documentElementIds.add(elementId);
    }
    documentMeasures.set(id, new Set(currentElementIds));
  }
  if (value.name !== undefined && typeof value.name !== "string") return `${path}.name must be a string`;
  if (value.enabledSymbols !== undefined) {
    if (!isRecord(value.enabledSymbols) ||
        Object.values(value.enabledSymbols).some((enabled) => typeof enabled !== "boolean")) {
      return `${path}.enabledSymbols must map names to booleans`;
    }
  }
  return null;
}

/** Returns a field-level explanation, or null when an imported document is safe to save. */
export function validateScoreDocument(value: unknown): string | null {
  if (!isRecord(value)) return "doc must be an object";
  if (!isSafeId(value.id)) return "doc.id must be a safe non-empty string";
  if (!isRecord(value.metadata)) return "doc.metadata must be an object";
  const metadata = value.metadata;
  if (typeof metadata.title !== "string") return "doc.metadata.title must be a string";
  for (const key of ["createdAt", "updatedAt"]) {
    if (!isFiniteNumber(metadata[key])) return `doc.metadata.${key} must be a finite number`;
  }
  if (metadata.difficulty !== undefined && !DIFFICULTIES.has(metadata.difficulty)) {
    return "doc.metadata.difficulty is not valid";
  }
  for (const key of ["subtitle", "composer", "arranger", "lyricist", "copyright", "memo"]) {
    const error = validateOptionalString(metadata, key, "doc.metadata");
    if (error) return error;
  }
  if (!Array.isArray(value.parts) || value.parts.length === 0) {
    return "doc.parts must contain at least one part";
  }
  const partIds = new Set<string>();
  const documentMeasures = new Map<string, Set<string>>();
  const documentElementIds = new Set<string>();
  let expectedMeasureCount: number | null = null;
  for (let i = 0; i < value.parts.length; i++) {
    const error = validatePart(
      value.parts[i],
      `doc.parts[${i}]`,
      documentMeasures,
      documentElementIds,
    );
    if (error) return error;
    const part = value.parts[i] as Record<string, unknown>;
    const id = part.id as string;
    if (partIds.has(id)) return `doc.parts contains duplicate id "${id}"`;
    partIds.add(id);
    const measureCount = (part.measures as unknown[]).length;
    if (expectedMeasureCount === null) expectedMeasureCount = measureCount;
    else if (measureCount !== expectedMeasureCount) {
      return `doc.parts[${i}].measures must contain ${expectedMeasureCount} measures to align with the first part`;
    }
  }
  const timeSignatureError = validateScoreTimeSignature(value.timeSignature, "doc.timeSignature");
  if (timeSignatureError) return timeSignatureError;
  if (!isFiniteNumber(value.bpm) || value.bpm < MIN_SCORE_BPM || value.bpm > MAX_SCORE_BPM) {
    return `doc.bpm must be from ${MIN_SCORE_BPM} to ${MAX_SCORE_BPM}`;
  }
  if (!isRecord(value.keySignature) || !isFiniteNumber(value.keySignature.sharps) ||
      !Number.isInteger(value.keySignature.sharps) || value.keySignature.sharps < -7 || value.keySignature.sharps > 7) {
    return "doc.keySignature.sharps must be an integer from -7 to 7";
  }
  if (value.playbackSettings !== undefined) {
    if (!isRecord(value.playbackSettings)) return "doc.playbackSettings must be an object";
    for (const key of ["showPlayhead", "showZoomView", "muteAudio", "notePreview"]) {
      const error = validateOptionalBoolean(value.playbackSettings, key, "doc.playbackSettings");
      if (error) return error;
    }
  }
  if (value.referenceImageUri !== undefined && typeof value.referenceImageUri !== "string") {
    return "doc.referenceImageUri must be a string";
  }
  if (value.referenceImageOpacity !== undefined &&
      (!isFiniteNumber(value.referenceImageOpacity) || value.referenceImageOpacity < 0 || value.referenceImageOpacity > 1)) {
    return "doc.referenceImageOpacity must be between 0 and 1";
  }
  for (const key of ["measuresPerLine", "linesPerPage"]) {
    if (value[key] !== undefined &&
        (!isFiniteNumber(value[key]) || !Number.isInteger(value[key]) || (value[key] as number) < 0)) {
      return `doc.${key} must be a non-negative integer`;
    }
  }
  if (value.layoutOverrides !== undefined) {
    if (!isRecord(value.layoutOverrides)) return "doc.layoutOverrides must be an object";
    for (const [measureId, overrides] of Object.entries(value.layoutOverrides)) {
      const validElements = documentMeasures.get(measureId);
      if (!validElements) return `doc.layoutOverrides.${measureId} does not reference a score measure`;
      if (!isRecord(overrides)) {
        return `doc.layoutOverrides.${measureId} must map element ids to finite numbers`;
      }
      for (const [elementId, x] of Object.entries(overrides)) {
        if (!validElements.has(elementId)) {
          return `doc.layoutOverrides.${measureId}.${elementId} does not reference an element in the measure`;
        }
        if (!isFiniteNumber(x)) {
          return `doc.layoutOverrides.${measureId}.${elementId} must be a finite number`;
        }
      }
    }
  }
  return null;
}

// ── JPG 내보내기 (captureRef 기반) ───────────────────────────

export async function exportScoreAsJpg(
  viewRef: React.RefObject<unknown>,
  doc: ScoreDocument,
): Promise<boolean> {
  try {
    const uri: string = await captureRef(viewRef as any, {
      format: "jpg",
      quality: 0.92,
    });
    if (Platform.OS === "web") {
      // 웹: data URI 다운로드
      const a = document.createElement("a");
      a.href = uri;
      const safeName = (doc.metadata.title || "score")
        .replace(/[^a-zA-Z0-9가-힣_-]/g, "_")
        .slice(0, 30);
      a.download = `${safeName}_${formatDateForFilename()}.jpg`;
      a.click();
      return true;
    }
    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(uri, {
        mimeType: "image/jpeg",
        dialogTitle: doc.metadata.title || "Score",
        UTI: "public.jpeg",
      });
      return true;
    }
    logger.warn("[ScoreIO] Sharing not available for JPG");
    return false;
  } catch (e) {
    logger.warn("[ScoreIO] exportScoreAsJpg error:", e);
    return false;
  }
}

// ── 참조 이미지 가져오기 (편집 불가 배경) ────────────────────

export interface ImportImageResult {
  uri: string;
  width?: number;
  height?: number;
}

export async function importReferenceImage(): Promise<ImportImageResult | null> {
  try {
    if (Platform.OS === "web") {
      return new Promise<ImportImageResult | null>((resolve) => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "image/*";
        input.onchange = () => {
          const file = input.files?.[0];
          if (!file) {
            resolve(null);
            return;
          }
          const reader = new FileReader();
          reader.onload = (e) => {
            const uri = e.target?.result as string;
            resolve(uri ? { uri } : null);
          };
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(file);
        };
        // 취소 시: 300ms 후 resolve(null)을 보장하기 위해 focus 이벤트로 감지
        window.addEventListener(
          "focus",
          () => {
            setTimeout(() => {
              if (!input.files?.length) resolve(null);
            }, 300);
          },
          { once: true },
        );
        input.click();
      });
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.9,
      allowsEditing: false,
    });
    if (result.canceled || !result.assets?.[0]) return null;
    const asset = result.assets[0];
    return { uri: asset.uri, width: asset.width, height: asset.height };
  } catch (e) {
    logger.warn("[ScoreIO] importReferenceImage error:", e);
    return null;
  }
}

// ── 성부 분리 ─────────────────────────────────────────────────

export async function extractParts(
  doc: ScoreDocument,
  partIndices: number[],
): Promise<ScoreDocument | null> {
  try {
    const selectedParts = partIndices
      .map((i) => doc.parts[i])
      .filter((p): p is ScorePart => !!p);
    if (selectedParts.length === 0) return null;
    const now = Date.now();
    const partLabel = selectedParts.map((p) => p.name ?? p.instrumentId).join(", ");
    const newDoc: ScoreDocument = {
      ...doc,
      id: Crypto.randomUUID(),
      metadata: {
        ...doc.metadata,
        title: `${doc.metadata.title || "Score"} — ${partLabel}`,
        createdAt: now,
        updatedAt: now,
      },
      parts: selectedParts.map((p) => ({ ...p, id: Crypto.randomUUID() })),
    };
    await saveScore(newDoc);
    return newDoc;
  } catch (e) {
    logger.warn("[ScoreIO] extractParts error:", e);
    return null;
  }
}
