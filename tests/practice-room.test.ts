import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  loadPracticeRooms,
  savePracticeRooms,
  deletePracticeRoom,
  renamePracticeRoom,
  findNearbyRoom,
  type PracticeRoom,
} from "../lib/practice-room";

const AsyncStorage = require("./_stubs/async-storage");

const r = (id: string, lat: number, lon: number, name = "room"): PracticeRoom => ({
  id,
  name,
  latitude: lat,
  longitude: lon,
  createdAt: 0,
});

beforeEach(() => {
  AsyncStorage.__reset();
});

test("findNearbyRoom: 같은 좌표 → 매치", () => {
  const room = r("a", 37.5, 127.0);
  const found = findNearbyRoom(37.5, 127.0, [room]);
  assert.equal(found?.id, "a");
});

test("findNearbyRoom: 20m 이내(약 0.0001도) 매치", () => {
  const room = r("a", 37.5, 127.0);
  const found = findNearbyRoom(37.50005, 127.00005, [room]);
  assert.equal(found?.id, "a");
});

test("findNearbyRoom: 200m 밖이면 null (기본 반경 20m)", () => {
  const room = r("a", 37.5, 127.0);
  assert.equal(findNearbyRoom(37.502, 127.002, [room]), null);
});

test("findNearbyRoom: 사용자 지정 반경 적용", () => {
  const room = r("a", 37.5, 127.0);
  assert.equal(findNearbyRoom(37.502, 127.002, [room], 500), room);
  assert.equal(findNearbyRoom(37.502, 127.002, [room], 50), null);
});

test("findNearbyRoom: 빈 배열 → null", () => {
  assert.equal(findNearbyRoom(0, 0, []), null);
});

test("findNearbyRoom: 첫 번째 매치 반환", () => {
  const a = r("a", 37.5, 127.0);
  const b = r("b", 37.5, 127.0);
  assert.equal(findNearbyRoom(37.5, 127.0, [a, b])?.id, "a");
});

test("loadPracticeRooms: 빈 storage → []", async () => {
  assert.deepEqual(await loadPracticeRooms(), []);
});

test("savePracticeRooms/loadPracticeRooms: 라운드트립", async () => {
  const rooms = [r("a", 1, 2, "스튜디오"), r("b", 3, 4, "교실")];
  await savePracticeRooms(rooms);
  assert.deepEqual(await loadPracticeRooms(), rooms);
});

test("loadPracticeRooms: 손상 JSON → []", async () => {
  await AsyncStorage.setItem("metronome_practice_rooms", "}}}");
  assert.deepEqual(await loadPracticeRooms(), []);
});

test("deletePracticeRoom: id 일치만 삭제", async () => {
  await savePracticeRooms([r("a", 0, 0), r("b", 0, 0), r("c", 0, 0)]);
  await deletePracticeRoom("b");
  const rooms = await loadPracticeRooms();
  assert.deepEqual(rooms.map((x) => x.id), ["a", "c"]);
});

test("renamePracticeRoom: 이름만 변경, 좌표는 보존", async () => {
  await savePracticeRooms([r("a", 37.5, 127.0, "old")]);
  await renamePracticeRoom("a", "new");
  const rooms = await loadPracticeRooms();
  assert.equal(rooms[0].name, "new");
  assert.equal(rooms[0].latitude, 37.5);
});

test("renamePracticeRoom: 미존재 id는 무동작", async () => {
  await savePracticeRooms([r("a", 0, 0, "x")]);
  await renamePracticeRoom("zzz", "y");
  const rooms = await loadPracticeRooms();
  assert.equal(rooms[0].name, "x");
});
