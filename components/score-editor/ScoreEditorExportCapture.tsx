// ============================================================
// ScoreEditorExportCapture — JPG/PNG 내보내기 전용 화면외 캡처 뷰
// ============================================================

import React from "react";
import { View, Text } from "react-native";
import { ScoreRenderer } from "@/components/ScoreRenderer";
import type { ScoreDocument } from "@/lib/score-types";

export interface ScoreEditorExportCaptureProps {
  doc: ScoreDocument;
  containerWidth: number;
  exportViewRef: React.RefObject<View>;
  /** PNG 내보내기용 줄당 마디 수 오버라이드 */
  pngExportMeasuresPerLine: number | undefined;
  /** PNG 페이지별 렌더링 문서 */
  pngExportPages: ScoreDocument[];
  exportPageRefs: React.MutableRefObject<(View | null)[]>;
  untitledLabel: string;
}

export function ScoreEditorExportCapture({
  doc,
  containerWidth,
  exportViewRef,
  pngExportMeasuresPerLine,
  pngExportPages,
  exportPageRefs,
  untitledLabel,
}: ScoreEditorExportCaptureProps) {
  const w = containerWidth || 400;

  return (
    <>
      {/* ── JPG 내보내기 전용 캡처 뷰 (화면 바깥에 렌더링) ─────── */}
      <View
        ref={exportViewRef}
        collapsable={false}
        style={{
          position: "absolute",
          left: -9999,
          top: 0,
          width: w,
          backgroundColor: "#ffffff",
        }}
        pointerEvents="none"
      >
        <View
          style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: "#e0e0e0" }}
        >
          <Text
            style={{ fontSize: 20, fontWeight: "700", color: "#000", textAlign: "center" }}
          >
            {doc.metadata.title || untitledLabel}
          </Text>
          {doc.metadata.composer ? (
            <Text
              style={{ fontSize: 13, color: "#444", textAlign: "center", marginTop: 4 }}
            >
              {doc.metadata.composer}
            </Text>
          ) : null}
          {doc.metadata.arranger ? (
            <Text style={{ fontSize: 12, color: "#666", textAlign: "center" }}>
              Arr. {doc.metadata.arranger}
            </Text>
          ) : null}
          {doc.metadata.copyright ? (
            <Text style={{ fontSize: 11, color: "#888", textAlign: "center" }}>
              © {doc.metadata.copyright}
            </Text>
          ) : null}
        </View>
        <ScoreRenderer
          doc={
            pngExportMeasuresPerLine !== doc.measuresPerLine
              ? { ...doc, measuresPerLine: pngExportMeasuresPerLine }
              : doc
          }
          containerWidth={w}
          showPartNames
        />
      </View>

      {/* ── PNG 내보내기 전용 캡처 뷰 (페이지별) ── */}
      {pngExportPages.map((pageDoc, idx) => (
        <View
          key={idx}
          ref={(el) => {
            exportPageRefs.current[idx] = el;
          }}
          collapsable={false}
          style={{
            position: "absolute",
            left: -9999,
            top: 0,
            width: w,
            backgroundColor: "#ffffff",
          }}
          pointerEvents="none"
        >
          {idx === 0 && (
            <View
              style={{
                padding: 16,
                borderBottomWidth: 1,
                borderBottomColor: "#e0e0e0",
              }}
            >
              <Text
                style={{
                  fontSize: 20,
                  fontWeight: "700",
                  color: "#000",
                  textAlign: "center",
                }}
              >
                {doc.metadata.title || untitledLabel}
              </Text>
              {doc.metadata.composer ? (
                <Text
                  style={{
                    fontSize: 13,
                    color: "#444",
                    textAlign: "center",
                    marginTop: 4,
                  }}
                >
                  {doc.metadata.composer}
                </Text>
              ) : null}
              {doc.metadata.arranger ? (
                <Text style={{ fontSize: 12, color: "#666", textAlign: "center" }}>
                  Arr. {doc.metadata.arranger}
                </Text>
              ) : null}
              {doc.metadata.copyright ? (
                <Text style={{ fontSize: 11, color: "#888", textAlign: "center" }}>
                  © {doc.metadata.copyright}
                </Text>
              ) : null}
            </View>
          )}
          {pngExportPages.length > 1 && (
            <Text
              style={{ fontSize: 11, color: "#888", textAlign: "center", paddingTop: 8 }}
            >
              {idx + 1} / {pngExportPages.length}
            </Text>
          )}
          <ScoreRenderer doc={pageDoc} containerWidth={w} showPartNames />
        </View>
      ))}
    </>
  );
}
