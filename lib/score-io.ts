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
import type { ScoreDocument, ScorePart } from "./score-types";
import { migrateLegacyLayoutOverrides } from "./score-types";
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

async function parsePulforsJson(json: string): Promise<ImportScoreResult> {
  try {
    if (typeof json !== "string" || json.length > MAX_PULFORS_JSON_CHARS) {
      return { success: false, errorCode: "invalid" };
    }
    const parsed: unknown = JSON.parse(json);
    if (!isPulforsFile(parsed)) {
      return { success: false, errorCode: "invalid" };
    }
    const rawDoc = parsed.doc as ScoreDocument;
    if (!rawDoc.id || !rawDoc.metadata || !Array.isArray(rawDoc.parts)) {
      return { success: false, errorCode: "invalid" };
    }
    const now = Date.now();
    const doc: ScoreDocument = migrateLegacyLayoutOverrides({
      ...rawDoc,
      id: Crypto.randomUUID(),
      metadata: { ...rawDoc.metadata, updatedAt: now },
    });
    await saveScore(doc);
    return { success: true, doc };
  } catch (e) {
    logger.warn("[ScoreIO] parsePulforsJson error:", e);
    return { success: false, errorCode: "invalid" };
  }
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
