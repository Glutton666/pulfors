import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { NoteImageCrop } from "@/lib/storage";
import type { PracticeEntry } from "@/lib/storage";
import { loadPracticeBook } from "@/lib/storage";
import { isNoteSourceEntry } from "@/lib/note-mode-sources";
import { applyQueueInsert } from "@/lib/index.helpers";
import { normalizeNoteImageCrop } from "@/lib/note-image-crop";

export type NotePlayMode = "once" | "loop" | "random";

export interface UseNoteSessionParams {
  noteStartPlayingEntry: (index: number) => Promise<void>;
  finishNoteQueuePlayback: (reason?: "manual" | "measure_complete") => void;
}

export interface UseNoteSessionResult {
  noteQueue: PracticeEntry[];
  setNoteQueue: Dispatch<SetStateAction<PracticeEntry[]>>;
  noteQueueRef: MutableRefObject<PracticeEntry[]>;
  notePlayMode: NotePlayMode;
  setNotePlayMode: Dispatch<SetStateAction<NotePlayMode>>;
  notePlayModeRef: MutableRefObject<NotePlayMode>;
  handleNotePlayModeChange: (mode: NotePlayMode) => void;
  noteCurrentIndex: number;
  setNoteCurrentIndex: Dispatch<SetStateAction<number>>;
  noteCurrentIndexRef: MutableRefObject<number>;
  noteIsPlaying: boolean;
  setNoteIsPlaying: Dispatch<SetStateAction<boolean>>;
  noteIsPlayingRef: MutableRefObject<boolean>;
  noteMeasureCount: number;
  setNoteMeasureCount: Dispatch<SetStateAction<number>>;
  noteMeasureCountRef: MutableRefObject<number>;
  noteFirstBeatFiredRef: MutableRefObject<boolean>;
  noteBarEntries: PracticeEntry[];
  setNoteBarEntries: Dispatch<SetStateAction<PracticeEntry[]>>;
  noteAdvanceQueueRef: MutableRefObject<() => void>;
  noteEntryTransitionEpochRef: MutableRefObject<number>;
  noteShuffledIndicesRef: MutableRefObject<number[]>;
  noteShuffledPosRef: MutableRefObject<number>;
  handleNoteAddToQueue: (entry: PracticeEntry, insertAt?: number) => void;
  handleNoteRemoveFromQueue: (index: number) => void;
  handleNoteReorderQueue: (fromIndex: number, toIndex: number) => void;
  handleNoteQueueItemImageChange: (
    index: number,
    imageUri: string | undefined,
    imageCrop?: NoteImageCrop,
  ) => void;
  handleNoteInsertNext: (entry: PracticeEntry) => void;
  handleNoteLoadPracticeSources: () => Promise<PracticeEntry[]>;
  handleNoteSourceSelectionChange: (entries: PracticeEntry[]) => void;
  resetNoteQueue: () => void;
}

export function useNoteSession({
  noteStartPlayingEntry,
  finishNoteQueuePlayback,
}: UseNoteSessionParams): UseNoteSessionResult {
  const [noteQueue, setNoteQueue] = useState<PracticeEntry[]>([]);
  const noteQueueRef = useRef<PracticeEntry[]>([]);
  useEffect(() => {
    noteQueueRef.current = noteQueue;
  }, [noteQueue]);
  const [notePlayMode, setNotePlayMode] = useState<NotePlayMode>("once");
  const notePlayModeRef = useRef<NotePlayMode>("once");
  useEffect(() => {
    notePlayModeRef.current = notePlayMode;
  }, [notePlayMode]);
  const handleNotePlayModeChange = useCallback((mode: NotePlayMode) => {
    notePlayModeRef.current = mode;
    setNotePlayMode(mode);
  }, []);
  const [noteCurrentIndex, setNoteCurrentIndex] = useState(-1);
  const noteCurrentIndexRef = useRef(-1);
  useEffect(() => {
    noteCurrentIndexRef.current = noteCurrentIndex;
  }, [noteCurrentIndex]);
  const [noteIsPlaying, setNoteIsPlaying] = useState(false);
  const noteIsPlayingRef = useRef(false);
  useEffect(() => {
    noteIsPlayingRef.current = noteIsPlaying;
  }, [noteIsPlaying]);
  const [noteMeasureCount, setNoteMeasureCount] = useState(0);
  const noteMeasureCountRef = useRef(0);
  const noteFirstBeatFiredRef = useRef(false);
  const [noteBarEntries, setNoteBarEntries] = useState<PracticeEntry[]>([]);
  const noteAdvanceQueueRef = useRef<() => void>(() => {});
  const noteEntryTransitionEpochRef = useRef(0);
  const noteShuffledIndicesRef = useRef<number[]>([]);
  const noteShuffledPosRef = useRef(0);

  const handleNoteAddToQueue = useCallback((entry: PracticeEntry, insertAt?: number) => {
    setNoteQueue((previous) => {
      const position = typeof insertAt === "number" ? insertAt : previous.length;
      const result = applyQueueInsert(
        previous,
        noteCurrentIndexRef.current,
        noteShuffledIndicesRef.current,
        noteShuffledPosRef.current,
        notePlayModeRef.current,
        position,
        entry,
      );
      noteQueueRef.current = result.queue;
      noteShuffledIndicesRef.current = result.shuffledIndices;
      if (result.currentIndex !== noteCurrentIndexRef.current) {
        noteCurrentIndexRef.current = result.currentIndex;
        setNoteCurrentIndex(result.currentIndex);
      }
      return result.queue;
    });
  }, []);

  const handleNoteRemoveFromQueue = useCallback((index: number) => {
    const currentIndex = noteCurrentIndexRef.current;
    const updated = noteQueueRef.current.filter((_, itemIndex) => itemIndex !== index);
    noteQueueRef.current = updated;
    setNoteQueue(updated);
    if (currentIndex === index && noteIsPlayingRef.current) {
      if (updated.length > 0) {
        void noteStartPlayingEntry(currentIndex < updated.length ? currentIndex : 0);
      } else {
        finishNoteQueuePlayback("manual");
        noteCurrentIndexRef.current = -1;
        setNoteCurrentIndex(-1);
      }
    } else if (currentIndex > index) {
      noteCurrentIndexRef.current = currentIndex - 1;
      setNoteCurrentIndex(currentIndex - 1);
    }
  }, [finishNoteQueuePlayback, noteIsPlayingRef, noteStartPlayingEntry]);

  const handleNoteReorderQueue = useCallback((fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= noteQueueRef.current.length || fromIndex < 0) return;
    const updated = [...noteQueueRef.current];
    const [moved] = updated.splice(fromIndex, 1);
    if (!moved) return;
    updated.splice(toIndex, 0, moved);
    noteQueueRef.current = updated;
    setNoteQueue(updated);
    const currentIndex = noteCurrentIndexRef.current;
    const nextIndex = currentIndex === fromIndex
      ? toIndex
      : fromIndex < currentIndex && toIndex >= currentIndex
      ? currentIndex - 1
      : fromIndex > currentIndex && toIndex <= currentIndex
      ? currentIndex + 1
      : currentIndex;
    if (nextIndex !== currentIndex) {
      noteCurrentIndexRef.current = nextIndex;
      setNoteCurrentIndex(nextIndex);
    }
  }, []);

  const handleNoteQueueItemImageChange = useCallback((
    index: number,
    imageUri: string | undefined,
    imageCrop?: NoteImageCrop,
  ) => {
    setNoteQueue((previous) => {
      const updated = [...previous];
      if (updated[index]) {
        updated[index] = {
          ...updated[index],
          imageUri,
          imageCrop: imageUri ? normalizeNoteImageCrop(imageCrop) : undefined,
        };
      }
      noteQueueRef.current = updated;
      return updated;
    });
  }, []);

  const handleNoteInsertNext = useCallback((entry: PracticeEntry) => {
    const currentIndex = noteCurrentIndexRef.current;
    setNoteQueue((previous) => {
      const result = applyQueueInsert(
        previous,
        currentIndex,
        noteShuffledIndicesRef.current,
        noteShuffledPosRef.current,
        notePlayModeRef.current,
        Math.max(0, currentIndex + 1),
        entry,
      );
      noteQueueRef.current = result.queue;
      noteShuffledIndicesRef.current = result.shuffledIndices;
      if (result.currentIndex !== noteCurrentIndexRef.current) {
        noteCurrentIndexRef.current = result.currentIndex;
        setNoteCurrentIndex(result.currentIndex);
      }
      return result.queue;
    });
  }, []);

  const handleNoteLoadPracticeSources = useCallback(async () => {
    const book = await loadPracticeBook();
    return book.filter(isNoteSourceEntry);
  }, []);

  const handleNoteSourceSelectionChange = useCallback((entries: PracticeEntry[]) => {
    const seen = new Set<string>();
    setNoteBarEntries(entries.filter((entry) => {
      if (!isNoteSourceEntry(entry) || seen.has(entry.id)) return false;
      seen.add(entry.id);
      return true;
    }));
  }, []);

  const resetNoteQueue = useCallback(() => {
    finishNoteQueuePlayback("manual");
    noteQueueRef.current = [];
    setNoteQueue([]);
    noteCurrentIndexRef.current = -1;
    setNoteCurrentIndex(-1);
  }, [finishNoteQueuePlayback]);

  return {
    noteQueue, setNoteQueue, noteQueueRef,
    notePlayMode, setNotePlayMode, notePlayModeRef, handleNotePlayModeChange,
    noteCurrentIndex, setNoteCurrentIndex, noteCurrentIndexRef,
    noteIsPlaying, setNoteIsPlaying, noteIsPlayingRef,
    noteMeasureCount, setNoteMeasureCount, noteMeasureCountRef, noteFirstBeatFiredRef,
    noteBarEntries, setNoteBarEntries, noteAdvanceQueueRef,
    noteEntryTransitionEpochRef, noteShuffledIndicesRef, noteShuffledPosRef,
    handleNoteAddToQueue, handleNoteRemoveFromQueue, handleNoteReorderQueue,
    handleNoteQueueItemImageChange, handleNoteInsertNext,
    handleNoteLoadPracticeSources, handleNoteSourceSelectionChange, resetNoteQueue,
  };
}