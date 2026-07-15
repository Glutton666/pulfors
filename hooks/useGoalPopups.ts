import { useCallback, useRef, useState } from "react";
import { loadActivityLogs, loadGoals, saveGoals, type Goal, type PracticeSessionData, type PracticeRoomVisitData } from "@/lib/activity-log";
import { captureBreadcrumb } from "@/lib/error-tracking";

/**
 * app/index.tsx에서 분리한 "목표 달성 팝업" 상태 및 로직.
 * 활동 로그를 확인해 새로 달성된 목표를 찾아 팝업 큐에 추가하고,
 * 사용자가 닫으면 저장된 목표 목록에서도 제거한다. 동작은 원본과 동일하다.
 */
export function useGoalPopups() {
  const [completedGoalPopups, setCompletedGoalPopups] = useState<Goal[]>([]);
  const dismissedGoalIdsRef = useRef<Set<string>>(new Set());

  const checkCompletedGoals = useCallback(async () => {
    try {
      const [allGoals, allLogs] = await Promise.all([loadGoals(), loadActivityLogs()]);
      if (allGoals.length === 0) return;

      const now = new Date();
      const dayStart = new Date(now);
      dayStart.setHours(0, 0, 0, 0);
      const dayStartMs = dayStart.getTime();

      const todayLogs = allLogs.filter((l) => l.timestamp >= dayStartMs);
      const todaySessions = todayLogs.filter((l) => l.type === "practice_session");
      const todayTotalTime = todaySessions.reduce((s, l) => s + ((l.data as PracticeSessionData).duration || 0), 0) / 60;
      const todayBeatTime = todaySessions.filter((l) => (l.data as PracticeSessionData).mode === "dial").reduce((s, l) => s + ((l.data as PracticeSessionData).duration || 0), 0) / 60;
      const todayBarTime = todaySessions.filter((l) => (l.data as PracticeSessionData).mode === "bar").reduce((s, l) => s + ((l.data as PracticeSessionData).duration || 0), 0) / 60;
      const todayRoomTime = todayLogs.filter((l) => l.type === "practice_room_visit").reduce((s, l) => s + ((l.data as PracticeRoomVisitData).duration || 0), 0) / 60;

      const newlyCompleted = allGoals.filter((g) => {
        if (dismissedGoalIdsRef.current.has(g.id)) return false;
        let progress = 0;
        switch (g.type) {
          case "total_play_time": progress = todayTotalTime; break;
          case "beat_mode_time": progress = todayBeatTime; break;
          case "bar_mode_time": progress = todayBarTime; break;
          case "room_time": progress = todayRoomTime; break;
          case "session_goal": {
            progress = todaySessions
              .filter((l) => {
                const d = l.data as PracticeSessionData;
                return d.mode === "bar" && d.practiceNoteId === g.practiceNoteId;
              })
              .reduce((s, l) => s + ((l.data as PracticeSessionData).duration || 0), 0) / 60;
            break;
          }
        }
        return progress >= g.target;
      });

      if (newlyCompleted.length > 0) {
        setCompletedGoalPopups((prev) => {
          const existingIds = new Set(prev.map((p) => p.id));
          const fresh = newlyCompleted.filter((g) => !existingIds.has(g.id));
          return fresh.length > 0 ? [...prev, ...fresh] : prev;
        });
      }
    } catch (e) {
      captureBreadcrumb({ category: "goals", message: "Failed to check goals", level: "warning", data: { error: String(e) } });
    }
  }, []);

  const dismissGoalPopup = useCallback(async (id: string) => {
    dismissedGoalIdsRef.current.add(id);
    setCompletedGoalPopups((prev) => prev.filter((g) => g.id !== id));
    const allGoals = await loadGoals();
    const updated = allGoals.filter((g) => g.id !== id);
    await saveGoals(updated);
  }, []);

  return { completedGoalPopups, dismissedGoalIdsRef, checkCompletedGoals, dismissGoalPopup };
}

export type GoalPopups = ReturnType<typeof useGoalPopups>;
