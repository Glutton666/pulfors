/**
 * Browser-only instrumentation. Never retain sources/buffers/players strongly:
 * doing so would make the memory test itself leak. No audio clock is modified.
 */
export function installAudioResourceProbe() {
  const buffers: WeakRef<AudioBuffer>[] = [];
  const players: WeakRef<HTMLMediaElement>[] = [];
  const contexts: WeakRef<AudioContext>[] = [];
  const seenBuffers = new WeakSet<AudioBuffer>();
  const seenPlayers = new WeakSet<HTMLMediaElement>();
  const active = new Map<number, { loop: boolean; hash: number }>();
  const blobs = new Set<string>();
  let starts = 0;
  let ends = 0;
  let maxActive = 0;
  let lastHash = 0;
  let lastDuration = 0;
  const AudioConstructor = window.Audio;
  window.Audio = new Proxy(AudioConstructor, {
    construct(target, args) {
      const player = new target(...args);
      seenPlayers.add(player);
      players.push(new WeakRef(player));
      return player;
    },
  });
  const ContextConstructor = window.AudioContext;
  window.AudioContext = new Proxy(ContextConstructor, {
    construct(target, args) {
      const context = new target(...args);
      contexts.push(new WeakRef(context));
      return context;
    },
  });
  const trackBuffer = (buffer: AudioBuffer) => {
    if (!seenBuffers.has(buffer)) {
      seenBuffers.add(buffer);
      buffers.push(new WeakRef(buffer));
    }
    return buffer;
  };
  const createBuffer = AudioContext.prototype.createBuffer;
  AudioContext.prototype.createBuffer = function (...args) {
    return trackBuffer(createBuffer.apply(this, args));
  };
  const decode = AudioContext.prototype.decodeAudioData;
  AudioContext.prototype.decodeAudioData = function (...args) {
    return decode.apply(this, args).then(trackBuffer);
  };
  const createSource = AudioContext.prototype.createBufferSource;
  AudioContext.prototype.createBufferSource = function () {
    const source = createSource.call(this);
    const start = source.start.bind(source);
    const stop = source.stop.bind(source);
    let id = 0;
    source.start = (...args) => {
      id = ++starts;
      const buffer = source.buffer;
      if (buffer) trackBuffer(buffer);
      // Full PCM fingerprint catches previous-language/overlay reuse, without
      // keeping the PCM or a growing list of captures.
      let hash = 2166136261;
      if (buffer) {
        for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
          for (const value of buffer.getChannelData(ch)) {
            hash = Math.imul(hash ^ Math.round(value * 32767), 16777619);
          }
        }
      }
      if (source.loop) {
        lastHash = hash >>> 0;
        lastDuration = buffer?.duration ?? 0;
      }
      active.set(id, { loop: source.loop, hash: hash >>> 0 });
      maxActive = Math.max(maxActive, active.size);
      source.addEventListener("ended", () => { active.delete(id); ends++; }, { once: true });
      return start(...args);
    };
    source.stop = (...args) => {
      const result = stop(...args);
      // Future handoffs remain live until ended; immediate stops leave no output.
      if ((args[0] ?? 0) <= source.context.currentTime) active.delete(id);
      return result;
    };
    return source;
  };
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    if (!seenPlayers.has(this)) {
      seenPlayers.add(this);
      players.push(new WeakRef(this));
    }
    return play.call(this);
  };
  const createURL = URL.createObjectURL;
  const revokeURL = URL.revokeObjectURL;
  URL.createObjectURL = function (blob) {
    const url = createURL.call(this, blob);
    blobs.add(url);
    return url;
  };
  URL.revokeObjectURL = function (url) {
    blobs.delete(url);
    return revokeURL.call(this, url);
  };
  (window as any).__audioResources = () => {
    // Prune dead weak references, keeping the probe bounded as well.
    let bufferBytes = 0;
    for (let i = buffers.length - 1; i >= 0; i--) {
      const buffer = buffers[i].deref();
      if (!buffer) buffers.splice(i, 1);
      else bufferBytes += buffer.length * buffer.numberOfChannels * 4;
    }
    let playingPlayers = 0;
    for (let i = players.length - 1; i >= 0; i--) {
      const player = players[i].deref();
      if (!player) players.splice(i, 1);
      else if (!player.paused && !player.ended) playingPlayers++;
    }
    for (let i = contexts.length - 1; i >= 0; i--) {
      if (!contexts[i].deref()) contexts.splice(i, 1);
    }
    // Read an already-initialized dev module, never require cold Metro modules.
    const modules = (window as any).__r?.getModules?.();
    const pcm = modules && [...modules.values()]
      .map((m: any) => m.publicModule?.exports)
      .find((exports: any) => typeof exports?.getPCMCacheStats === "function")
      ?.getPCMCacheStats();
    return {
      starts, ends, active: active.size,
      loops: [...active.values()].filter(s => s.loop).length,
      maxActive, lastHash, lastDuration,
      buffers: buffers.length, bufferBytes, players: players.length,
      contexts: contexts.length, playingPlayers, blobs: blobs.size, pcm,
    };
  };
}
