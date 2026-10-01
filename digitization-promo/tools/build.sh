#!/usr/bin/env bash
# Full pipeline: render frames -> synth audio -> mux final MP4 (YouTube loudness -14 LUFS)
set -e
cd "$(dirname "$0")/.."
node tools/render.mjs video 4
python3 tools/audio.py
ffmpeg -y -v error -i out/video_noaudio.mp4 -i out/mix.wav -map 0:v -map 1:a -c:v copy \
  -af "loudnorm=I=-14:TP=-1.5:LRA=11" -c:a aac -b:a 256k -ar 48000 -shortest -movflags +faststart \
  out/digitization_promo_60s.mp4
