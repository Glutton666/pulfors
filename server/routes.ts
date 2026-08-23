import type { Express } from "express";
import { createServer, type Server } from "node:http";

/**
 * The app's server intentionally has no audio-analysis endpoint. Sample BPM
 * measurement is decoded and analyzed locally so imported audio never leaves
 * the device.
 */
export async function registerRoutes(app: Express): Promise<Server> {
  app.get("/api/time", (_req, res) => {
    res.set("Cache-Control", "no-store");
    res.json({ now: Date.now() });
  });

  return createServer(app);
}