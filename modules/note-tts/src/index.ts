import { requireOptionalNativeModule } from "expo-modules-core";
import type { NoteTtsNative } from "@/lib/note-tts";

// This entry is never imported on web; lib/note-tts-runtime.web is a hard gate.
export default requireOptionalNativeModule<NoteTtsNative>("NoteTts");
