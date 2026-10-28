/** @jest-environment jsdom */
import React from "react";
import { fireEvent, render } from "@testing-library/react";
import { AppPreparationScreen } from "../components/AppPreparationScreen";

jest.mock("expo-image", () => ({
  Image: () => <div data-testid="preparation-image" />,
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("../lib/i18n", () => ({ detectDeviceLanguage: () => "en" }));

test.each(["fonts", "icons", "audio", "settings"] as const)(
  "retains the live status and icon for the %s stage",
  (stage) => {
    const screen = render(<AppPreparationScreen stage={stage} language="en" />);
    expect(screen.getByTestId("preparation-screen-icon")).toBeTruthy();
    expect(screen.getByTestId("preparation-screen-status").textContent).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  },
);

test("error actions retain their original callbacks in the scrollable surface", () => {
  const retry = jest.fn();
  const proceed = jest.fn();
  const screen = render(
    <AppPreparationScreen
      stage="error"
      error={"A longer preparation error. ".repeat(30)}
      language="en"
      onRetry={retry}
      onContinue={proceed}
    />,
  );
  expect(screen.queryByTestId("preparation-screen-status")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  expect(retry).toHaveBeenCalledTimes(1);
  expect(proceed).toHaveBeenCalledTimes(1);
});
