import { useCallback, useEffect, useRef, useState } from "react";
import { loadQuickAddList, saveQuickAddList, type PracticeEntry } from "@/lib/storage";

/**
 * app/index.tsx에서 분리한 "빠른 추가 목록" 상태 및 로드/저장 로직.
 * 동작은 원본과 동일하다.
 */
export function useQuickAddList() {
  const [quickAddList, setQuickAddList] = useState<PracticeEntry[]>([]);
  const quickAddListRef = useRef<PracticeEntry[]>([]);
  useEffect(() => { quickAddListRef.current = quickAddList; }, [quickAddList]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await loadQuickAddList();
      if (!cancelled) setQuickAddList(list);
    })();
    return () => { cancelled = true; };
  }, []);

  const handleQuickAddListChange = useCallback((list: PracticeEntry[]) => {
    setQuickAddList(list);
    quickAddListRef.current = list;
    saveQuickAddList(list).catch(() => {});
  }, []);

  return { quickAddList, quickAddListRef, handleQuickAddListChange };
}

export type QuickAddListState = ReturnType<typeof useQuickAddList>;
