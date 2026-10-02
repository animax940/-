import json, sys, base64, urllib.request, urllib.error
model, out, ratio, size, pfile = sys.argv[1:6]
prompt = open(pfile).read().strip()
cfg = {"aspectRatio": ratio}
if size != "-": cfg["imageSize"] = size
body = {"contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"responseModalities": ["IMAGE"], "imageConfig": cfg}}
req = urllib.request.Request(f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
        data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
try:
    r = json.load(urllib.request.urlopen(req, timeout=240))
except urllib.error.HTTPError as e:
    print("HTTP", e.code, e.read().decode()[:600]); sys.exit(1)
for c in r.get("candidates", []):
    for p in c.get("content", {}).get("parts", []):
        d = p.get("inlineData") or p.get("inline_data")
        if d:
            ext = "png" if "png" in d.get("mimeType", "") else "jpg"
            open(f"{out}.{ext}", "wb").write(base64.b64decode(d["data"])); print("saved", f"{out}.{ext}", d.get("mimeType")); sys.exit(0)
        if "text" in p: print("TEXT:", p["text"][:300])
print("no image; finish:", [c.get("finishReason") for c in r.get("candidates", [])], str(r.get("promptFeedback"))[:300]); sys.exit(2)
