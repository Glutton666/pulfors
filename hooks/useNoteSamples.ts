import { useState, useRef, useCallback } from "react";
import type {
  NoteSampleMap,
  NoteSampleNameMap,
  NoteSampleSourceMap,
  NoteSampleChannelMap,
} from "@/lib/note-samples";

/**
 * Centralizes the four note-sample maps (samples/names/sources/channels) and
 * their refs. Each pair (state + ref) is updated together via the returned
 * setAll helpers, removing the dual-update boilerplate previously sprinkled
 * across ~30 sites in app/index.tsx.
 *
 * Adding a new per-note field in the future only requires touching this hook
 * and the persistence module — not every handler.
 */
export interface NoteSamplesHook {
  samples: NoteSampleMap;
  samplesRef: React.MutableRefObject<NoteSampleMap>;
  setSamples: React.Dispatch<React.SetStateAction<NoteSampleMap>>;
  setSamplesAll: (m: NoteSampleMap) => void;

  names: NoteSampleNameMap;
  namesRef: React.MutableRefObject<NoteSampleNameMap>;
  setNames: React.Dispatch<React.SetStateAction<NoteSampleNameMap>>;
  setNamesAll: (m: NoteSampleNameMap) => void;

  sources: NoteSampleSourceMap;
  sourcesRef: React.MutableRefObject<NoteSampleSourceMap>;
  setSources: React.Dispatch<React.SetStateAction<NoteSampleSourceMap>>;
  setSourcesAll: (m: NoteSampleSourceMap) => void;

  channels: NoteSampleChannelMap;
  channelsRef: React.MutableRefObject<NoteSampleChannelMap>;
  setChannels: React.Dispatch<React.SetStateAction<NoteSampleChannelMap>>;
  setChannelsAll: (m: NoteSampleChannelMap) => void;

  /** Replace all four maps in one call. Both state and refs sync together. */
  replaceAll(maps: {
    samples?: NoteSampleMap;
    names?: NoteSampleNameMap;
    sources?: NoteSampleSourceMap;
    channels?: NoteSampleChannelMap;
  }): void;
}

export function useNoteSamples(): NoteSamplesHook {
  const [samples, setSamples] = useState<NoteSampleMap>({});
  const samplesRef = useRef<NoteSampleMap>({});
  const [names, setNames] = useState<NoteSampleNameMap>({});
  const namesRef = useRef<NoteSampleNameMap>({});
  const [sources, setSources] = useState<NoteSampleSourceMap>({});
  const sourcesRef = useRef<NoteSampleSourceMap>({});
  const [channels, setChannels] = useState<NoteSampleChannelMap>({});
  const channelsRef = useRef<NoteSampleChannelMap>({});

  const setSamplesAll = useCallback((m: NoteSampleMap) => {
    setSamples(m);
    samplesRef.current = m;
  }, []);
  const setNamesAll = useCallback((m: NoteSampleNameMap) => {
    setNames(m);
    namesRef.current = m;
  }, []);
  const setSourcesAll = useCallback((m: NoteSampleSourceMap) => {
    setSources(m);
    sourcesRef.current = m;
  }, []);
  const setChannelsAll = useCallback((m: NoteSampleChannelMap) => {
    setChannels(m);
    channelsRef.current = m;
  }, []);

  const replaceAll = useCallback((maps: {
    samples?: NoteSampleMap;
    names?: NoteSampleNameMap;
    sources?: NoteSampleSourceMap;
    channels?: NoteSampleChannelMap;
  }) => {
    if (maps.samples !== undefined) {
      setSamples(maps.samples);
      samplesRef.current = maps.samples;
    }
    if (maps.names !== undefined) {
      setNames(maps.names);
      namesRef.current = maps.names;
    }
    if (maps.sources !== undefined) {
      setSources(maps.sources);
      sourcesRef.current = maps.sources;
    }
    if (maps.channels !== undefined) {
      setChannels(maps.channels);
      channelsRef.current = maps.channels;
    }
  }, []);

  return {
    samples, samplesRef, setSamples, setSamplesAll,
    names, namesRef, setNames, setNamesAll,
    sources, sourcesRef, setSources, setSourcesAll,
    channels, channelsRef, setChannels, setChannelsAll,
    replaceAll,
  };
}
