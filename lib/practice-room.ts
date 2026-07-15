import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import * as Crypto from "expo-crypto";
import { Platform } from "react-native";
import { logger } from "./logger";

const PRACTICE_ROOMS_KEY = "metronome_practice_rooms";
const PROXIMITY_RADIUS_METERS = 20;

export interface PracticeRoom {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  createdAt: number;
}

export async function loadPracticeRooms(): Promise<PracticeRoom[]> {
  try {
    const data = await AsyncStorage.getItem(PRACTICE_ROOMS_KEY);
    if (data) return JSON.parse(data);
  } catch (e) {
    logger.warn("Failed to load practice rooms:", e);
  }
  return [];
}

export async function savePracticeRooms(rooms: PracticeRoom[]): Promise<void> {
  try {
    await AsyncStorage.setItem(PRACTICE_ROOMS_KEY, JSON.stringify(rooms));
  } catch (e) {
    logger.warn("Failed to save practice rooms:", e);
  }
}

export async function addPracticeRoom(name: string): Promise<PracticeRoom | null> {
  try {
    const location = await getCurrentLocation();
    if (!location) return null;

    const room: PracticeRoom = {
      id: Crypto.randomUUID(),
      name,
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      createdAt: Date.now(),
    };

    const rooms = await loadPracticeRooms();
    rooms.push(room);
    await savePracticeRooms(rooms);
    return room;
  } catch (e) {
    logger.warn("Failed to add practice room:", e);
    return null;
  }
}

export async function deletePracticeRoom(id: string): Promise<void> {
  const rooms = await loadPracticeRooms();
  const updated = rooms.filter((r) => r.id !== id);
  await savePracticeRooms(updated);
}

export async function renamePracticeRoom(id: string, newName: string): Promise<void> {
  const rooms = await loadPracticeRooms();
  const idx = rooms.findIndex((r) => r.id === id);
  if (idx >= 0) {
    rooms[idx].name = newName;
    await savePracticeRooms(rooms);
  }
}

export async function requestLocationPermission(): Promise<boolean> {
  if (Platform.OS === "web") {
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
      });
      return !!pos;
    } catch {
      return false;
    }
  }
  const { status } = await Location.requestForegroundPermissionsAsync();
  return status === "granted";
}

export async function checkLocationPermission(): Promise<boolean> {
  if (Platform.OS === "web") return true;
  const { status } = await Location.getForegroundPermissionsAsync();
  return status === "granted";
}

export async function getCurrentLocation(): Promise<Location.LocationObject | null> {
  try {
    if (Platform.OS === "web") {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
        });
      });
      return {
        coords: {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          altitude: pos.coords.altitude,
          accuracy: pos.coords.accuracy,
          altitudeAccuracy: pos.coords.altitudeAccuracy,
          heading: pos.coords.heading,
          speed: pos.coords.speed,
        },
        timestamp: pos.timestamp,
      } as Location.LocationObject;
    }
    return await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
  } catch (e) {
    logger.warn("Failed to get current location:", e);
    return null;
  }
}

function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function findNearbyRoom(
  latitude: number,
  longitude: number,
  rooms: PracticeRoom[],
  radiusMeters: number = PROXIMITY_RADIUS_METERS
): PracticeRoom | null {
  for (const room of rooms) {
    const dist = haversineDistance(latitude, longitude, room.latitude, room.longitude);
    if (dist <= radiusMeters) return room;
  }
  return null;
}
