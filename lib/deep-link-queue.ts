/**
 * deep-link-queue.ts
 *
 * Cold-start 딥링크 경합 조건 대응을 위한 순수 큐 클래스.
 *
 * 설계 결정
 * - latest-wins: 핸들러 등록 전 여러 명령이 도착하면 마지막 것만 보관.
 * - 핸들러가 등록(setHandler)될 때 pending 명령을 즉시 재전달.
 * - 핸들러가 null 로 교체된 이후 수신된 명령은 다시 보관.
 * - 에러 처리는 호출자의 책임이므로 클래스 내에서 catch 하지 않음.
 *   (DeepLinkContext 에서 try/catch 로 래핑)
 */

import type { VoiceCommand } from "./voice-commands";

export type CommandHandler = (cmd: VoiceCommand) => void;

export class DeepLinkQueue {
  private _handler: CommandHandler | null = null;
  private _pending: VoiceCommand | null = null;

  /**
   * 명령 전달을 시도한다.
   * 핸들러가 없으면 pending 에 보관(latest-wins)하고 true 를 반환.
   * 핸들러가 있으면 즉시 호출하고 false 를 반환.
   */
  dispatch(cmd: VoiceCommand): boolean {
    if (this._handler) {
      this._pending = null;
      this._handler(cmd);
      return false;
    }
    this._pending = cmd;
    return true;
  }

  /**
   * 핸들러를 등록(또는 해제)한다.
   * h 가 non-null 이고 pending 명령이 있으면 즉시 h 를 호출한다.
   */
  setHandler(h: CommandHandler | null): void {
    this._handler = h;
    if (h && this._pending) {
      const pending = this._pending;
      this._pending = null;
      h(pending);
    }
  }

  /** 현재 핸들러 (읽기 전용) */
  get handler(): CommandHandler | null {
    return this._handler;
  }

  /** 보관 중인 명령 — 테스트 및 내부 상태 확인용 */
  get pending(): VoiceCommand | null {
    return this._pending;
  }

  /** 상태를 초기화한다 (테스트 셋업 등에서 활용) */
  reset(): void {
    this._handler = null;
    this._pending = null;
  }
}
