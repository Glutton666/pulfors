import { useCallback, useEffect, useRef, useState } from "react";
import {
  loadPracticeRooms,
  getCurrentLocation,
  requestLocationPermission,
  findNearbyRoom,
} from "@/lib/practice-room";
import { addActivityLog } from "@/lib/activity-log";

/**
 * app/index.tsx에서 분리한 "연습실 GPS 추적" 상태 및 로직.
 * 15초 간격으로 위치를 확인해 등록된 연습실 반경을 벗어나면 자동으로
 * 추적을 종료하고 활동 로그를 기록한다. 동작은 원본과 동일하다.
 */
export function usePracticeRoomTracking(onTracked?: () => void, loggingEnabled: boolean = false) {
  const [roomTrackingActive, setRoomTrackingActive] = useState(false);
  const [trackingRoomName, setTrackingRoomName] = useState<string | null>(null);
  const roomTrackRef = useRef<{ roomId: string; roomName: string; start: number } | null>(null);
  const locationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onTrackedRef = useRef(onTracked);
  const loggingEnabledRef = useRef(loggingEnabled);
  useEffect(() => { onTrackedRef.current = onTracked; }, [onTracked]);
  useEffect(() => { loggingEnabledRef.current = loggingEnabled; }, [loggingEnabled]);

  const startRoomTracking = useCallback(async (room: { id: string; name: string }) => {
    if (!loggingEnabledRef.current) return;
    const granted = await requestLocationPermission();
    if (!granted) return;
    roomTrackRef.current = { roomId: room.id, roomName: room.name, start: Date.now() };
    setRoomTrackingActive(true);
    setTrackingRoomName(room.name);

    if (locationIntervalRef.current) clearInterval(locationIntervalRef.current);
    locationIntervalRef.current = setInterval(async () => {
      try {
        const loc = await getCurrentLocation();
        if (!loc || !roomTrackRef.current) return;
        const rooms = await loadPracticeRooms();
        const trackedRoom = rooms.find(r => r.id === roomTrackRef.current!.roomId);
        if (!trackedRoom) return;
        const dist = findNearbyRoom(loc.coords.latitude, loc.coords.longitude, [trackedRoom], 20);
        if (!dist) {
          const dur = Math.round((Date.now() - roomTrackRef.current.start) / 1000);
          if (loggingEnabledRef.current && dur >= 10) {
            addActivityLog({
              type: "practice_room_visit",
              data: { roomId: roomTrackRef.current.roomId, roomName: roomTrackRef.current.roomName, duration: dur },
            }).then(() => onTrackedRef.current?.());
          }
          roomTrackRef.current = null;
          setRoomTrackingActive(false);
          setTrackingRoomName(null);
          if (locationIntervalRef.current) {
            clearInterval(locationIntervalRef.current);
            locationIntervalRef.current = null;
          }
        }
      } catch (e) {}
    }, 15000);
  }, []);

  const stopRoomTracking = useCallback(() => {
    if (locationIntervalRef.current) {
      clearInterval(locationIntervalRef.current);
      locationIntervalRef.current = null;
    }
    if (roomTrackRef.current) {
      const dur = Math.round((Date.now() - roomTrackRef.current.start) / 1000);
      if (loggingEnabledRef.current && dur >= 10) {
        addActivityLog({
          type: "practice_room_visit",
          data: { roomId: roomTrackRef.current.roomId, roomName: roomTrackRef.current.roomName, duration: dur },
        }).then(() => onTrackedRef.current?.());
      }
      roomTrackRef.current = null;
    }
    setRoomTrackingActive(false);
    setTrackingRoomName(null);
  }, []);

  /** Stops location tracking without creating a final activity record. */
  const discardRoomTracking = useCallback(() => {
    if (locationIntervalRef.current) {
      clearInterval(locationIntervalRef.current);
      locationIntervalRef.current = null;
    }
    roomTrackRef.current = null;
    setRoomTrackingActive(false);
    setTrackingRoomName(null);
  }, []);

  useEffect(() => {
    return () => {
      stopRoomTracking();
    };
  }, [stopRoomTracking]);

  return {
    roomTrackingActive,
    setRoomTrackingActive,
    trackingRoomName,
    setTrackingRoomName,
    startRoomTracking,
    stopRoomTracking,
    discardRoomTracking,
  };
}

export type PracticeRoomTracking = ReturnType<typeof usePracticeRoomTracking>;
