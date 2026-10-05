import { useState, useEffect, useCallback } from "react";
import { useTonePreview, usePrepareTonePreview } from "./useTonePreview";
import type { MetronomeEngine } from "@/lib/metronome-engine";
import type { UseAudioPipelineResult } from "./useAudioPipeline";

/** Defer preview until sound-selection state has committed. */
export function useSoundSetPreview(
  getClickPCMs: UseAudioPipelineResult["getClickPCMs"],
  captureTone: UseAudioPipelineResult["captureAudioToneSnapshot"],
  engineRef: React.MutableRefObject<MetronomeEngine | null>,
  identity: string,
) {
  const prepareTonePreview = usePrepareTonePreview(getClickPCMs, captureTone);
  const preview = useTonePreview(prepareTonePreview, identity);
  const [request, setRequest] = useState<{ key: string } | null>(null);
  useEffect(() => {
    if (request && !engineRef.current?.getIsRunning()) void preview.play(request.key, 0);
  }, [request, preview.play, engineRef]);
  const previewSoundSet = useCallback((key: string) => {
    if (engineRef.current?.getIsRunning()) return;
    preview.unlock();
    setRequest({ key });
  }, [preview.unlock, engineRef]);
  return { prepareTonePreview, previewSoundSet };
}
