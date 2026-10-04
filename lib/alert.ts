import { Alert as NativeAlert, Platform, type AlertButton, type AlertOptions } from "react-native";

export interface WebAlertRequest {
  id: number;
  title: string;
  message?: string;
  buttons: AlertButton[];
  options?: AlertOptions;
}

let nextId = 0;
let current: WebAlertRequest | null = null;
const queue: WebAlertRequest[] = [];
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

export const getWebAlert = () => current;
export function subscribeWebAlert(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Native behavior is unchanged; web actions are rendered by WebAlertHost. */
export const Alert = {
  prompt: NativeAlert?.prompt?.bind(NativeAlert),
  alert(title: string, message?: string, buttons?: AlertButton[], options?: AlertOptions) {
    if (Platform.OS !== "web") {
      NativeAlert.alert(title, message, buttons, options);
      return;
    }
    const request: WebAlertRequest = {
      id: ++nextId, title, message,
      buttons: buttons?.length ? buttons : [{ text: "OK" }],
      options,
    };
    if (current) queue.push(request);
    else current = request;
    notify();
  },
};

/** Ignore stale presses, and advance the queue before callbacks can add alerts. */
export function resolveWebAlert(id: number, buttonIndex?: number) {
  if (!current || current.id !== id) return;
  const request = current;
  if (buttonIndex !== undefined && !request.buttons[buttonIndex]) return;
  current = queue.shift() ?? null;
  notify();
  if (buttonIndex !== undefined) request.buttons[buttonIndex].onPress?.();
  else request.options?.onDismiss?.();
}

export function cancelWebAlert(id: number) {
  if (!current || current.id !== id || current.options?.cancelable === false) return;
  const cancel = current.buttons.findIndex((button) => button.style === "cancel");
  if (cancel >= 0) resolveWebAlert(id, cancel);
  else resolveWebAlert(id);
}