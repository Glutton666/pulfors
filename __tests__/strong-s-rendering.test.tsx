/** @jest-environment jsdom */

import React from "react";
import { render, screen } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";

import { GradientLetter } from "@/components/GradientLetter";

describe("strong beat S rendering", () => {
  test("renders a visible S using the release-safe Text path", () => {
    render(
      <GradientLetter
        letter="S"
        width={18}
        height={18}
        fontSize={8}
        lineHeight={10}
        colors={["#ffffff", "#cccccc"]}
        textShadowColor="#000000"
      />,
    );

    expect(screen.getByTestId("gradient-letter-text").textContent).toBe("S");
  });

  test("Beat and Bar strong paths both use the shared S renderer", () => {
    const dialSource = fs.readFileSync(
      path.join(process.cwd(), "components/DialBeatDot.tsx"),
      "utf8",
    );
    const subdivisionSource = fs.readFileSync(
      path.join(process.cwd(), "components/SubdivisionBar.tsx"),
      "utf8",
    );
    const barSource = fs.readFileSync(
      path.join(process.cwd(), "components/BarModeView.tsx"),
      "utf8",
    );

    expect(dialSource).toContain('const isStrong = beatType === "strong"');
    expect(dialSource).toContain('letter="S"');
    expect(subdivisionSource).toContain('type === "strong" ? (');
    expect(subdivisionSource.match(/letter="S"/g)).toHaveLength(2);
    expect(barSource).toContain(
      'const bType = beatTypes[sourceBeat] || "normal";',
    );
    expect(barSource).toContain("beatType={bType}");
  });
});