import json, sys, base64, urllib.request, urllib.error
model, out, ratio = sys.argv[1], sys.argv[2], sys.argv[3]
prompt = open('prompt.txt').read().strip()
body = {"contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"responseModalities": ["IMAGE"], "imageConfig": {"aspectRatio": ratio}}}
req = urllib.request.Request(f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
        data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
try:
    r = json.load(urllib.request.urlopen(req, timeout=180))
except urllib.error.HTTPError as e:
    print("HTTP", e.code, e.read().decode()[:600]); sys.exit(1)
for c in r.get("candidates", []):
    for p in c.get("content", {}).get("parts", []):
        d = p.get("inlineData") or p.get("inline_data")
        if d:
            open(out, "wb").write(base64.b64decode(d["data"])); print("saved", out, d.get("mimeType")); sys.exit(0)
        if "text" in p: print("TEXT:", p["text"][:300])
print("no image; finish:", [c.get("finishReason") for c in r.get("candidates", [])], str(r.get("promptFeedback"))[:300]); sys.exit(2)
