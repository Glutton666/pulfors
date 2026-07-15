import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * 토큰화 완료 파일에 하드코딩된 정확매칭값(borderRadius: 4/6/8, fontSize: 10/11)이
 * 재유입되지 않는지 검증합니다. 신규 PR에서 토큰을 우회한 직접 숫자 사용을 차단.
 *
 * 새로 토큰화한 파일은 이 목록에 추가하세요.
 */
const TOKENIZED_FILES = [
  "components/BlockEditPanel.tsx",
  "components/LoopBlockStripDetailed.tsx",
  "components/DialBeatDot.tsx",
  "components/Pendulum.tsx",
  "components/SubdivisionBar.tsx",
  "components/ErrorFallback.tsx",
  "components/BpmSlider.tsx",
  "components/NoteRecorderModal.tsx",
  "components/OnboardingModal.tsx",
  "components/SignalGeneratorModal.tsx",
  "components/PracticeBookModal.tsx",
  "components/SettingsModal.tsx",
  "components/WorkUpOverviewModal.tsx",
  "components/AssistantShortcutsGuide.tsx",
  "components/NoteModeView.tsx",
  "components/StopwatchTimer.tsx",
  "components/LoopBlockStripCompact.tsx",
  "components/GoalCompletePopup.tsx",
  "components/BeatIndicator.tsx",
  "components/BarPlayButton.tsx",
  "app/index.tsx",
];

const BANNED_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /borderRadius:\s*4(?!\d)/, label: "borderRadius: 4 (use Radius.xs)" },
  { pattern: /borderRadius:\s*6(?!\d)/, label: "borderRadius: 6 (use Radius.sm)" },
  { pattern: /borderRadius:\s*8(?!\d)/, label: "borderRadius: 8 (use Radius.md)" },
  { pattern: /fontSize:\s*10(?!\d)/, label: "fontSize: 10 (use FontSize.micro)" },
  { pattern: /fontSize:\s*11(?!\d)/, label: "fontSize: 11 (use FontSize.caption)" },
  { pattern: /fontSize:\s*12(?!\d)/, label: "fontSize: 12 (use FontSize.small)" },
  { pattern: /(?:padding|margin)(?:Horizontal|Vertical|Top|Bottom|Left|Right)?:\s*2(?!\d)/, label: "padding/margin 2 (use Spacing.xxs)" },
  { pattern: /(?:padding|margin)(?:Horizontal|Vertical|Top|Bottom|Left|Right)?:\s*4(?!\d)/, label: "padding/margin 4 (use Spacing.xs)" },
  { pattern: /(?:padding|margin)(?:Horizontal|Vertical|Top|Bottom|Left|Right)?:\s*8(?!\d)/, label: "padding/margin 8 (use Spacing.sm)" },
  { pattern: /\bgap:\s*2(?!\d)/, label: "gap: 2 (use Spacing.xxs)" },
  { pattern: /\bgap:\s*4(?!\d)/, label: "gap: 4 (use Spacing.xs)" },
  { pattern: /\bgap:\s*8(?!\d)/, label: "gap: 8 (use Spacing.sm)" },
];

for (const file of TOKENIZED_FILES) {
  test(`tokens regression: ${file} has no hardcoded mapped values`, () => {
    const abs = join(process.cwd(), file);
    const src = readFileSync(abs, "utf8");
    const lines = src.split("\n");
    const hits: string[] = [];
    lines.forEach((line, i) => {
      for (const { pattern, label } of BANNED_PATTERNS) {
        if (pattern.test(line)) {
          hits.push(`L${i + 1}: ${label} → ${line.trim()}`);
        }
      }
    });
    assert.equal(hits.length, 0, `토큰 우회 발견:\n${hits.join("\n")}`);
  });
}
