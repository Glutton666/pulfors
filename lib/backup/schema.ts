import { z } from "zod";

// Zod 스키마: 백업 파일 구조 검증.
// - safeParse로 실패하면 ZodError에서 필드 경로와 메시지를 추출해 사용자에게 표시한다.
// - 하위 호환을 위해 선택적 필드에는 .optional()을 사용한다.

export const BackupMetaSchema = z.object({
  app: z.literal("metronome"),
  version: z.number(),
  createdAt: z.string(),
  keyCount: z.number(),
});

export const BackupFileSchema = z.object({
  _meta: BackupMetaSchema,
  schemaVersion: z.number().optional(),
  data: z.record(z.union([z.string(), z.null()])),
  audioFiles: z.record(z.string()).optional(),
});

export type BackupFileParsed = z.infer<typeof BackupFileSchema>;

export const PracticeShareMetaSchema = z.object({
  app: z.literal("metronome"),
  type: z.literal("practice_entry"),
  createdAt: z.string(),
});

// entry의 필수 필드만 검증하고 나머지는 passthrough로 그대로 통과시킨다.
// 나머지 필드 검증은 sanitizePracticeEntry가 처리한다.
export const PracticeEntryMinimalSchema = z
  .object({
    bpm: z.number({ required_error: "bpm is required" }),
    beatsPerMeasure: z.number({ required_error: "beatsPerMeasure is required" }),
    beatTypes: z.array(z.string(), { required_error: "beatTypes is required" }),
  })
  .passthrough();

export const PracticeShareFileSchema = z.object({
  _meta: PracticeShareMetaSchema,
  entry: PracticeEntryMinimalSchema,
  audioFiles: z.record(z.string()).optional(),
});

export type PracticeShareFileParsed = z.infer<typeof PracticeShareFileSchema>;

/**
 * ZodError를 사람이 읽을 수 있는 짧은 문자열로 변환한다.
 * 최대 3개 이슈를 "필드.경로: 메시지" 형식으로 join.
 */
export function formatZodError(err: z.ZodError): string {
  return err.issues
    .slice(0, 3)
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}
