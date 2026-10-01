import sherpa_onnx, soundfile as sf, sys, json
d = "tools/vits-piper-ar_JO-kareem-medium"
cfg = sherpa_onnx.OfflineTtsConfig(model=sherpa_onnx.OfflineTtsModelConfig(
    vits=sherpa_onnx.OfflineTtsVitsModelConfig(model=f"{d}/ar_JO-kareem-medium.onnx", tokens=f"{d}/tokens.txt", data_dir=f"{d}/espeak-ng-data",
        noise_scale=0.6, noise_scale_w=0.7, length_scale=1.0), num_threads=4))
tts = sherpa_onnx.OfflineTts(cfg)
lines = json.load(open(sys.argv[1]))
for i, (text, speed) in enumerate(lines):
    a = tts.generate(text, sid=0, speed=speed)
    sf.write(f"assets/audio/vo_{i+1:02d}.wav", a.samples, a.sample_rate)
    print(i+1, round(len(a.samples)/a.sample_rate, 2))
