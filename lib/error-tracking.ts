/**
 * 중앙 에러 트래킹 추상화.
 *
 * 기본 동작은 콘솔 출력만 수행하는 no-op입니다.
 * Sentry를 활성화하려면:
 *   1) `EXPO_PUBLIC_SENTRY_DSN` 환경변수를 Replit Secrets(production)에 등록
 *   2) 앱 재시작 — `initErrorTracking()`이 프로덕션 환경에서만 SDK를 초기화합니다.
 *
 * 개발 환경(__DEV__ === true)에서는 DSN이 설정되어 있어도 Sentry를 초기화하지 않아
 * 개발 중 노이즈가 Sentry 대시보드에 유입되지 않습니다.
 * DSN이 없거나 패키지가 없으면 어떤 환경에서도 안전하게 콘솔 로깅만 수행합니다.
 */

type Severity = "fatal" | "error" | "warning" | "info" | "debug";

export interface Breadcrumb {
  category?: string;
  message: string;
  level?: Severity;
  data?: Record<string, unknown>;
}

let sentryRef: any = null;
let sentryActive = false;

// __DEV__는 React Native 런타임에서 주입되는 전역. node 테스트 환경처럼
// 정의되지 않은 곳에서는 false로 폴백한다.
function isDev(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return typeof (globalThis as any).__DEV__ !== "undefined"
      ? Boolean((globalThis as any).__DEV__)
      : process.env.NODE_ENV !== "production";
  } catch {
    return false;
  }
}

export async function initErrorTracking(): Promise<void> {
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  if (!dsn) {
    if (isDev()) console.info("[error-tracking] No DSN — console-only mode");
    return;
  }
  // 개발 환경(__DEV__ === true)에서는 DSN이 설정되어 있어도 Sentry를 초기화하지 않는다.
  // 이렇게 하면 개발/프리뷰 트래픽이 Sentry 대시보드에 섞이지 않는다.
  if (isDev()) {
    console.info("[error-tracking] Dev mode — Sentry disabled (console-only)");
    return;
  }
  try {
    const mod: any = await import("@sentry/react-native" as any).catch(() => null);
    if (!mod || typeof mod.init !== "function") {
      if (isDev()) console.info("[error-tracking] @sentry/react-native not installed; console-only mode");
      return;
    }
    mod.init({
      dsn,
      tracesSampleRate: 0.1,
      enableAutoPerformanceTracing: false,
      enableNative: false,
      attachStacktrace: true,
      autoSessionTracking: false,
    });
    sentryRef = mod;
    sentryActive = true;
    if (isDev()) console.info("[error-tracking] Sentry initialized");
  } catch (e) {
    console.warn("[error-tracking] Sentry init failed:", e);
  }
}

export function captureException(error: unknown, context?: Record<string, unknown>): void {
  if (sentryActive && sentryRef) {
    try {
      sentryRef.captureException(error, context ? { extra: context } : undefined);
    } catch {}
  }
  console.error("[error-tracking]", error, context ?? "");
}

export function captureBreadcrumb(crumb: Breadcrumb): void {
  if (sentryActive && sentryRef) {
    try {
      sentryRef.addBreadcrumb({
        category: crumb.category,
        message: crumb.message,
        level: crumb.level,
        data: crumb.data,
      });
    } catch {}
  }
  if (isDev() && crumb.level && (crumb.level === "warning" || crumb.level === "error" || crumb.level === "fatal")) {
    console.warn(`[breadcrumb] ${crumb.category ?? "general"}: ${crumb.message}`, crumb.data ?? "");
  }
}

export function isErrorTrackingActive(): boolean {
  return sentryActive;
}
