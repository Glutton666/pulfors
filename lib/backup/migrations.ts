// 백업 데이터 스키마 마이그레이션 (Task #40).
// `_meta.version`은 백업 *파일 포맷*(audioFiles 도입 등)의 버전이고,
// `schemaVersion`은 백업이 담고 있는 *데이터 모양*(PracticeEntry 필드 등)의
// 버전이다. 둘은 독립적으로 진화한다 — 같은 파일 포맷 안에서 데이터 모양만
// 바뀌는 경우가 흔하기 때문이다.
//
// schemaVersion이 누락된 옛날 백업은 v0으로 분기해 마이그레이션 체인을
// 처음부터 거치고, CURRENT_SCHEMA_VERSION보다 큰 값을 만나면 사용자가
// 앱을 업데이트해야 함을 알린다.
import type { BackupFile } from "./shared";

export const CURRENT_SCHEMA_VERSION = 1;

export class UnsupportedBackupVersionError extends Error {
  readonly fileVersion: number;
  readonly currentVersion: number;
  constructor(fileVersion: number, currentVersion: number) {
    super(`Backup schemaVersion ${fileVersion} is newer than supported ${currentVersion}`);
    this.name = "UnsupportedBackupVersionError";
    this.fileVersion = fileVersion;
    this.currentVersion = currentVersion;
  }
}

type MigrationFn = (data: Record<string, string | null>) => Record<string, string | null>;

// fromVersion → fromVersion+1 변환.  v0→v1은 거의 identity이지만 누락된
// 기본값을 채우는 자리로 둔다(현재는 변환 없음 — 데이터 모양이 첫 버전과
// 동일하다고 간주). 미래에 PracticeEntry에 새 필드가 추가되면 여기에서
// 기본값을 채운다.
const migrations: Record<number, MigrationFn> = {
  0: (data) => data,
};

export interface MigrateResult {
  data: Record<string, string | null>;
  fromVersion: number;
  toVersion: number;
}

export function migrateBackup(backup: BackupFile): MigrateResult {
  // 비정상값(NaN/Infinity/문자열/음수/소수)은 모두 v0으로 안전 분기.
  // 음수 정수는 누락된 옛 데이터와 동급으로 취급한다 — 마이너스 버전이라는
  // 개념은 없으므로 의미 있는 신호가 아니다.
  const raw = backup.schemaVersion;
  const fileVersion =
    typeof raw === "number" && Number.isFinite(raw) && raw >= 0
      ? Math.floor(raw)
      : 0;

  if (fileVersion > CURRENT_SCHEMA_VERSION) {
    throw new UnsupportedBackupVersionError(fileVersion, CURRENT_SCHEMA_VERSION);
  }

  let data = backup.data;
  for (let v = fileVersion; v < CURRENT_SCHEMA_VERSION; v++) {
    const step = migrations[v];
    if (!step) {
      // 등록 누락 — 코드 버그. 보수적으로 거부한다.
      throw new Error(`Missing migration step for schemaVersion ${v}`);
    }
    data = step(data);
  }

  return { data, fromVersion: fileVersion, toVersion: CURRENT_SCHEMA_VERSION };
}
