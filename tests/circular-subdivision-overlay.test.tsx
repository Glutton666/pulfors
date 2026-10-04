import React from "react";
import { CircularSubdivisionOverlay } from "../components/CircularSubdivisionOverlay";
import { beginCircularDraft } from "../lib/circular-subdivision";
import { useTheme } from "../contexts/ThemeContext";

jest.mock("@/contexts/ThemeContext", () => ({ useTheme: jest.fn() }));

test.each([120, 160, 300])("center reference is centered and noninteractive at dial size %i", (size) => {
  (useTheme as jest.Mock).mockReturnValue({ colors: { surface: "#FFF", textSecondary: "#222", accent: "#765000" } });
  const draft = beginCircularDraft(0, { x: 500, y: 400, size, radius: size * 0.4 }, -Math.PI / 2, "accent");
  const tree = CircularSubdivisionOverlay({ draft, size });
  const children = React.Children.toArray(tree.props.children) as React.ReactElement<any>[];
  const hub = children.find(child => child.props.testID === "circular-subdivision-center-reference")!;
  expect(tree.props.pointerEvents).toBe("none");
  expect(hub.props.pointerEvents).toBe("none");
  expect(hub.props.accessible).toBe(false);
  expect(hub.props.style.left + hub.props.style.width / 2).toBe(size / 2);
  expect(hub.props.style.top + hub.props.style.height / 2).toBe(size / 2);
  expect(hub.props.style.backgroundColor).toBe("#FFF");
  (useTheme as jest.Mock).mockReturnValue({ colors: { surface: "#111", textSecondary: "#DDD", accent: "#FFC400" } });
  const dark = CircularSubdivisionOverlay({ draft, size });
  const darkHub = (React.Children.toArray(dark.props.children) as React.ReactElement<any>[])
    .find(child => child.props.testID === "circular-subdivision-center-reference")!;
  expect(darkHub.props.style.backgroundColor).toBe("#111");
  expect(darkHub.props.style.borderColor).toBe("#DDD");
});

test("MAX feedback does not cover the center reference", () => {
  (useTheme as jest.Mock).mockReturnValue({ colors: { surface: "#FFF", textSecondary: "#222", accent: "#765000" } });
  const draft = beginCircularDraft(0, { x: 0, y: 0, size: 160, radius: 64 }, 0, "accent");
  const tree = CircularSubdivisionOverlay({ draft: { ...draft, atLimit: true }, size: 160 });
  const children = React.Children.toArray(tree.props.children) as React.ReactElement<any>[];
  const badge = children.at(-1)!;
  expect(badge.props.style.top).toBeLessThan(160 / 4);
});