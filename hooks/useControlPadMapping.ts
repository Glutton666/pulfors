import { useCallback, useEffect, useRef, useState } from "react";
import { loadControlPadMapping, saveControlPadMapping, createEmptyControlPadMapping, type ControlPadMapping } from "@/lib/storage";

/**
 * app/index.tsx에서 분리한 "컨트롤 패드 매핑" 로드/저장 로직.
 * 마운트 시 저장된 매핑을 비동기로 불러오되, 그 사이 사용자가 이미
 * 매핑을 변경했다면(controlPadDirtyRef) 덮어쓰지 않는다. 동작은 원본과 동일하다.
 */
export function useControlPadMapping() {
  const [controlPadMapping, setControlPadMapping] = useState<ControlPadMapping>(createEmptyControlPadMapping);
  const controlPadDirtyRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const m = await loadControlPadMapping();
      if (cancelled) return;
      if (!controlPadDirtyRef.current) {
        setControlPadMapping(m);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleControlPadMappingChange = useCallback((m: ControlPadMapping) => {
    controlPadDirtyRef.current = true;
    setControlPadMapping(m);
    saveControlPadMapping(m).catch(() => {});
  }, []);

  return { controlPadMapping, handleControlPadMappingChange };
}

export type ControlPadMappingState = ReturnType<typeof useControlPadMapping>;
