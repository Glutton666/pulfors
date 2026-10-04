import { Alert as NativeAlert, Platform } from "react-native";
import { Alert, cancelWebAlert, getWebAlert, resolveWebAlert } from "../lib/alert";
import { confirmDestructive } from "../lib/confirm";

describe("cross-platform action dialogs", () => {
  const originalOS = Platform.OS;
  beforeEach(() => {
    while (getWebAlert()) resolveWebAlert(getWebAlert()!.id);
    (Platform as { OS: string }).OS = "web";
  });
  afterAll(() => { (Platform as { OS: string }).OS = originalOS; });

  it("does not execute a destructive action until explicitly confirmed", () => {
    const onConfirm = jest.fn();
    confirmDestructive("Reset?", { title: "Reset All", onConfirm });
    expect(onConfirm).not.toHaveBeenCalled();
    const request = getWebAlert()!;
    expect(request.title).toBe("Reset All");
    resolveWebAlert(request.id, 1);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("cancel and Escape cannot execute the destructive action", () => {
    const onConfirm = jest.fn();
    confirmDestructive("Delete?", { onConfirm });
    cancelWebAlert(getWebAlert()!.id);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(getWebAlert()).toBeNull();
  });

  it("selects the actual action from multi-button import/share menus", () => {
    const apply = jest.fn();
    const saveAndApply = jest.fn();
    Alert.alert("Import", "Settings", [
      { text: "Cancel", style: "cancel" },
      { text: "Apply", onPress: apply },
      { text: "Save and Apply", onPress: saveAndApply },
    ]);
    resolveWebAlert(getWebAlert()!.id, 2);
    expect(saveAndApply).toHaveBeenCalledTimes(1);
    expect(apply).not.toHaveBeenCalled();
  });

  it("queues alerts without losing callbacks or allowing stale double presses", () => {
    const first = jest.fn();
    Alert.alert("First", "", [{ text: "Go", onPress: first }]);
    const id = getWebAlert()!.id;
    Alert.alert("Second");
    resolveWebAlert(id, 0);
    expect(getWebAlert()?.title).toBe("Second");
    resolveWebAlert(id, 0);
    expect(first).toHaveBeenCalledTimes(1);
    expect(getWebAlert()?.title).toBe("Second");
  });

  it("queues an alert created by a callback after existing pending alerts", () => {
    Alert.alert("First", "", [{ onPress: () => Alert.alert("Third") }]);
    Alert.alert("Second");
    resolveWebAlert(getWebAlert()!.id, 0);
    expect(getWebAlert()?.title).toBe("Second");
    resolveWebAlert(getWebAlert()!.id, 0);
    expect(getWebAlert()?.title).toBe("Third");
  });

  it("provides a dismissible OK action for information/errors", () => {
    Alert.alert("File too large", "Try a smaller file.");
    expect(getWebAlert()?.buttons[0].text).toBe("OK");
    resolveWebAlert(getWebAlert()!.id, 0);
    expect(getWebAlert()).toBeNull();
  });

  it("honors non-cancelable alerts and explicit dismissal callbacks", () => {
    const onDismiss = jest.fn();
    Alert.alert("Wait", "", undefined, { cancelable: false, onDismiss });
    const id = getWebAlert()!.id;
    cancelWebAlert(id);
    expect(getWebAlert()?.id).toBe(id);
    expect(onDismiss).not.toHaveBeenCalled();
    resolveWebAlert(id, 0);
    const explicitCancel = jest.fn();
    Alert.alert("Required decision", "", [{ text: "Cancel", style: "cancel", onPress: explicitCancel }], { cancelable: false });
    const requiredId = getWebAlert()!.id;
    cancelWebAlert(requiredId);
    expect(explicitCancel).not.toHaveBeenCalled();
    expect(getWebAlert()?.id).toBe(requiredId);
    resolveWebAlert(requiredId, 0);
    expect(explicitCancel).toHaveBeenCalledTimes(1);
    Alert.alert("Info", "", undefined, { onDismiss });
    cancelWebAlert(getWebAlert()!.id);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("forwards native buttons, prompt support, and options without changing them", () => {
    (Platform as { OS: string }).OS = "ios";
    const spy = jest.spyOn(NativeAlert, "alert").mockImplementation(() => {});
    const buttons = [{ text: "OK", onPress: jest.fn() }];
    const options = { cancelable: false };
    Alert.alert("Native", "Body", buttons, options);
    expect(spy).toHaveBeenCalledWith("Native", "Body", buttons, options);
    expect(getWebAlert()).toBeNull();
    expect(buttons[0].onPress).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});