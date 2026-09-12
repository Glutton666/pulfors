#!/usr/bin/env python3
"""Raise bundled metronome loudness consistently without changing role balance."""

from __future__ import annotations

import json
import math
import statistics
import struct
import subprocess
import tempfile
import wave
from pathlib import Path

SOUND_DIR = Path(__file__).resolve().parents[1] / "assets" / "sounds"
REPORT_PATH = SOUND_DIR / "loudness-report.json"
SETS = (
    "click", "woodblock", "cowbell", "digital", "jamblock", "sine",
    "blip", "clave", "cajon", "marimba", "stick",
)
TARGET_MEDIAN_RMS_DB = -8.0
MAX_GAIN_DB = 4.5
PEAK_CEILING = 0.95


def measure(path: Path) -> dict[str, float]:
    with wave.open(str(path), "rb") as source:
        frames = source.readframes(source.getnframes())
        width = source.getsampwidth()
        if width != 2:
            raise ValueError(f"{path.name}: expected 16-bit PCM, got {width * 8}-bit")
        values = struct.unpack(f"<{len(frames) // 2}h", frames)
        peak = max((abs(value) for value in values), default=0) / 32768
        rms = math.sqrt(sum(value * value for value in values) / max(1, len(values))) / 32768
        return {
            "peak": round(peak, 6),
            "rmsDb": round(20 * math.log10(rms), 3) if rms else -120,
            "durationMs": round(source.getnframes() * 1000 / source.getframerate(), 3),
        }

def committed_source(path: Path, destination: Path) -> Path:
    """Use the checked-in WAV as the repeatable source when available."""
    relative = path.relative_to(SOUND_DIR.parents[1]).as_posix()
    try:
        destination.write_bytes(subprocess.check_output(["git", "show", f"HEAD:{relative}"]))
        return destination
    except subprocess.CalledProcessError:
        destination.write_bytes(path.read_bytes())
        return destination


def main() -> None:
    sources: dict[str, Path] = {}
    source_dir = Path(tempfile.mkdtemp(prefix="metronome-source-"))
    for name in SETS:
        for path in SOUND_DIR.glob(f"{name}-*.wav"):
            sources[path.name] = committed_source(path, source_dir / path.name)
    before = {filename: measure(path) for filename, path in sources.items()}
    gains: dict[str, float] = {}
    for name in SETS:
        levels = [entry["rmsDb"] for filename, entry in before.items() if filename.startswith(f"{name}-")]
        gains[name] = round(max(0, min(MAX_GAIN_DB, TARGET_MEDIAN_RMS_DB - statistics.median(levels))), 3)

    for name in SETS:
        gain_linear = 10 ** (gains[name] / 20)
        for path in SOUND_DIR.glob(f"{name}-*.wav"):
            with tempfile.NamedTemporaryFile(suffix=".wav", dir=path.parent, delete=False) as tmp:
                output = Path(tmp.name)
            try:
                subprocess.run(
                    [
                        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(sources[path.name]),
                        "-af", (
                            f"alimiter=limit={PEAK_CEILING}:level_in={gain_linear}:"
                            "level_out=1:attack=0.1:release=10:latency=1:level=false"
                        ),
                        "-c:a", "pcm_s16le", str(output),
                    ],
                    check=True,
                )
                output.replace(path)
            finally:
                output.unlink(missing_ok=True)

    after = {path.name: measure(path) for name in SETS for path in SOUND_DIR.glob(f"{name}-*.wav")}
    REPORT_PATH.write_text(
        json.dumps(
            {
                "policy": {
                    "targetMedianRmsDb": TARGET_MEDIAN_RMS_DB,
                    "maxGainDb": MAX_GAIN_DB,
                    "peakCeiling": PEAK_CEILING,
                    "sameGainWithinSoundSet": True,
                },
                "gainDbBySet": gains,
                "before": before,
                "after": after,
            },
            indent=2,
            sort_keys=True,
        ) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()