import { Platform } from "react-native";
import { logger } from "./logger";

const STORAGE_KEY = "@practice_pending_import";

export function setPendingImport(data: unknown) {
  try {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }
  } catch (e) {
    logger.warn("setPendingImport error:", e);
  }
}

export function consumePendingImport(): unknown {
  try {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      const raw = window.sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        window.sessionStorage.removeItem(STORAGE_KEY);
        return JSON.parse(raw);
      }
    }
  } catch (e) {
    logger.warn("consumePendingImport error:", e);
  }
  return null;
}
