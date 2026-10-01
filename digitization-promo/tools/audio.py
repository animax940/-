"""Synthesises the music bed + SFX from out/cues.json, lays the voice-over, ducks and masters.
Output: out/mix.wav (44.1 kHz stereo)."""
import json, numpy as np, soundfile as sf
from scipy import signal

SR, DUR = 44100, 60.0
N = int(SR * DUR)
rs = np.random.default_rng(3)
t_all = np.arange(N) / SR

def env_ad(n, a, d):  # attack/decay exponential envelope (seconds)
    t = np.arange(n) / SR
    return np.minimum(1, t / max(a, 1e-4)) * np.exp(-np.maximum(0, t - a) / d)

def bp(x, lo, hi, order=2):
    return signal.sosfilt(signal.butter(order, [lo, hi], 'bandpass', fs=SR, output='sos'), x)

def lp(x, f, order=2):
    return signal.sosfilt(signal.butter(order, f, 'lowpass', fs=SR, output='sos'), x)

def hp(x, f, order=2):
    return signal.sosfilt(signal.butter(order, f, 'highpass', fs=SR, output='sos'), x)

def sweep(f0, f1, dur, curve=2.0):
    n = int(SR * dur); k = np.linspace(0, 1, n) ** curve
    f = f0 + (f1 - f0) * k
    return np.sin(2 * np.pi * np.cumsum(f) / SR)

def add(buf, x, at, gain=1.0, pan=0.0):
    i = int(at * SR)
    if i >= len(buf): return
    x = x[:len(buf) - i]
    l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    buf[i:i + len(x), 0] += x * gain * l * 1.414
    buf[i:i + len(x), 1] += x * gain * r * 1.414

# ---------------- music ----------------
BPM = 112; BEAT = 60 / BPM; BAR = 4 * BEAT
def hz(m): return 440 * 2 ** ((m - 69) / 12)
# Am - F - C - G   (uplifting corporate loop)
CHORDS = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]
ROOTS = [45, 41, 48, 43]

def kick():
    n = int(.35 * SR); return sweep(130, 42, .35, .35) * env_ad(n, .002, .12) + .3 * rs.standard_normal(n) * env_ad(n, .0005, .004)
def clap():
    n = int(.25 * SR); x = bp(rs.standard_normal(n), 900, 3500) * env_ad(n, .001, .06)
    return x * 1.6
def hat(open_=False):
    n = int((.18 if open_ else .05) * SR); return hp(rs.standard_normal(n), 7000) * env_ad(n, .0005, .06 if open_ else .015)
def pluck(m, dur=.45):
    n = int(dur * SR); tt = np.arange(n) / SR; f = hz(m)
    x = np.sin(2 * np.pi * f * tt) + .45 * np.sin(4 * np.pi * f * tt) + .2 * np.sin(6 * np.pi * f * tt)
    return x * env_ad(n, .003, .16)
def bass(m, dur):
    n = int(dur * SR); tt = np.arange(n) / SR; f = hz(m)
    x = np.tanh(1.8 * (np.sin(2 * np.pi * f * tt) + .3 * np.sin(4 * np.pi * f * tt)))
    e = np.minimum(1, tt / .01) * np.minimum(1, (dur - tt) / .04)
    return lp(x, 900) * e
def pad(ch, dur):
    n = int(dur * SR); tt = np.arange(n) / SR; x = np.zeros(n)
    for m in ch + [ch[0] + 12]:
        for det in (-.12, .12):
            x += signal.sawtooth(2 * np.pi * hz(m + det) * tt)
    x = lp(x, 1400, 2) / 8
    e = np.minimum(1, tt / .5) * np.minimum(1, (dur - tt) / .5)
    return x * e

music = np.zeros((N, 2))
drums_on = lambda t: (1.0 <= t < 7.3) or (13.75 <= t < 50.7) or (51.85 <= t < 57.2)
half = lambda t: 7.3 <= t < 13.75
bar_idx = 0
start = 0.0
while start < DUR:
    ch, root = CHORDS[bar_idx % 4], ROOTS[bar_idx % 4]
    if start < 57.2:
        add(music, pad(ch, BAR + .5), start, .55)
    else:
        add(music, pad(CHORDS[0], 3.2), start, .6)
    for b in range(8):  # 8th notes
        tt = start + b * BEAT / 2
        if tt >= DUR: break
        if drums_on(tt):
            if b % 2 == 0: add(music, kick(), tt, .9)
            if b in (2, 6): add(music, clap(), tt, .35, .1)
            add(music, hat(b % 2 == 1), tt, .22 if b % 2 else .12, -.3)
            arp = [ch[0] + 12, ch[1] + 12, ch[2] + 12, ch[1] + 24][b % 4]
            add(music, pluck(arp), tt, .28, .35 if b % 2 else -.35)
            add(music, bass(root, BEAT / 2 - .02), tt, .32)
        elif half(tt):
            if b == 0: add(music, kick(), tt, .7)
            if b in (0, 4): add(music, bass(root, BEAT * 2 - .05), tt, .25)
            if b % 2 == 1: add(music, pluck(ch[b % 3] + 12, .6), tt, .14, .4)
    start += BAR; bar_idx += 1
# final sting
add(music, sum(pluck(m, 2.0) for m in [57 + 12, 60 + 12, 64 + 12]), 57.2, .35)
add(music, kick(), 57.2, .9)

# ---------------- SFX ----------------
def whoosh(d=.7):
    n = int(d * SR); x = rs.standard_normal(n)
    lo = bp(x, 250, 1200); hi = bp(x, 1200, 5000)
    k = np.linspace(0, 1, n); mixk = np.sin(np.pi * k) ** 2
    e = np.sin(np.pi * k ** .7) ** 3
    return (lo * (1 - mixk) + hi * mixk) * e * 1.8
def swish(): return whoosh(.35) * .8
def popx():
    n = int(.12 * SR); return sweep(900, 260, .12, .5) * env_ad(n, .001, .035) + .4 * hp(rs.standard_normal(n), 3000) * env_ad(n, .0003, .003)
def tick():
    n = int(.04 * SR); return bp(rs.standard_normal(n), 2500, 6000) * env_ad(n, .0003, .006) * 2
def drawer():
    n = int(.25 * SR); return lp(rs.standard_normal(n), 600) * env_ad(n, .005, .06) * 2 + sweep(140, 70, .25) * env_ad(n, .002, .05)
def riser(d=1.55):
    n = int(d * SR); k = np.linspace(0, 1, n)
    return (bp(rs.standard_normal(n), 400, 6000) * .6 + sweep(220, 1400, d, 2.2) * .3) * k ** 2.5
def impact():
    n = int(1.6 * SR); boom = sweep(90, 32, 1.6, .4) * env_ad(n, .002, .45)
    crack = lp(rs.standard_normal(n), 3000) * env_ad(n, .0005, .08)
    return boom * 1.1 + crack * .7
def scan():
    n = int(1.2 * SR); tt = np.arange(n) / SR
    x = np.sin(2 * np.pi * 1100 * tt) * (.5 + .5 * np.sin(2 * np.pi * 9 * tt)) * .25 + bp(rs.standard_normal(n), 2000, 5000) * .25
    return x * np.sin(np.pi * tt / 1.2)
def blip():
    n = int(.06 * SR); f = rs.uniform(1400, 2400); tt = np.arange(n) / SR
    return np.sin(2 * np.pi * f * tt) * env_ad(n, .001, .02)
def typ():
    n = int(.035 * SR); return bp(rs.standard_normal(n), 1500, 7000) * env_ad(n, .0003, .007) * 1.8 + sweep(300, 120, .035) * env_ad(n, .0005, .01) * .5
def click():
    a = typ(); return np.concatenate([a, np.zeros(int(.05 * SR)), a * .7])
def ding():
    n = int(1.4 * SR); tt = np.arange(n) / SR
    x = sum(a * np.sin(2 * np.pi * f * tt) * np.exp(-tt / d) for f, a, d in [(1318.5, .6, .5), (1975.5, .35, .35), (2637, .2, .2), (3951, .1, .12)])
    return x * np.minimum(1, tt / .002)
def lock():
    n = int(.2 * SR); return bp(rs.standard_normal(n), 1800, 5000) * env_ad(n, .0005, .02) * 2 + sweep(200, 90, .2) * env_ad(n, .001, .05)
SFX = dict(whoosh=whoosh, swish=swish, pop=popx, tick=tick, drawer=drawer, riser=riser, impact=impact, scan=scan, blip=blip, type=typ, click=click, ding=ding, lock=lock)
LEVEL = dict(whoosh=.45, swish=.3, pop=.35, tick=.3, drawer=.4, riser=.35, impact=.75, scan=.18, blip=.15, type=.22, click=.35, ding=.25, lock=.4)

sfx = np.zeros((N, 2))
cues = json.load(open('out/cues.json'))
for c in cues:
    f = SFX[c['type']]
    off = -.35 if c['type'] in ('whoosh',) else 0
    add(sfx, f(), max(0, c['t'] + off), LEVEL[c['type']] * c['gain'], rs.uniform(-.4, .4))
# ticking clock bed during scene 1 & 2 (time wasting)
for k in range(30):
    tt = 5.3 + k * .5
    if tt < 12.6: add(sfx, tick(), tt, .18 if tt < 7.4 else .12, .3)
# short reverb on SFX
ir_n = int(.7 * SR); ir = rs.standard_normal(ir_n) * np.exp(-np.arange(ir_n) / SR / .18); ir /= np.abs(ir).sum() / 6
for ch in range(2): sfx[:, ch] += .25 * signal.fftconvolve(sfx[:, ch], ir)[:N]

# ---------------- voice-over ----------------
VO_AT = [0.9, 8.1, 13.8, 21.5, 30.6, 37.0, 44.2, 52.2]
vo = np.zeros(N); active = np.zeros(N)
for i, at in enumerate(VO_AT):
    x, sr = sf.read(f'assets/audio/vo_{i + 1:02d}.wav')
    if x.ndim > 1: x = x.mean(1)
    x = signal.resample_poly(x, SR, sr)
    x = hp(x, 90)
    # presence lift + gentle compression
    x = x + .35 * bp(x, 2500, 6000)
    x = x / (np.abs(x).max() + 1e-9)
    x = np.tanh(x * 1.6) / np.tanh(1.6)
    j = int(at * SR); x = x[:N - j]
    vo[j:j + len(x)] += x; active[j:j + len(x)] = 1
# ducking envelope (smooth)
duck = 1 - .68 * active
duck = signal.sosfiltfilt(signal.butter(1, 3, 'lowpass', fs=SR, output='sos'), duck)

mix = music * (.55 * duck)[:, None] + sfx * .9
mix[:, 0] += vo * .78; mix[:, 1] += vo * .78
# fades
fade = np.ones(N); fade[:int(.05 * SR)] = np.linspace(0, 1, int(.05 * SR)); fade[-int(1.2 * SR):] = np.linspace(1, 0, int(1.2 * SR)) ** 2
mix *= fade[:, None]
mix = np.tanh(mix / (np.abs(mix).max() + 1e-9) * 1.25) * .89
sf.write('out/mix.wav', mix.astype(np.float32), SR, subtype='PCM_16')
sf.write('out/music_only.wav', (music * .55).astype(np.float32) / (np.abs(music).max() * .55 + 1e-9) * .8, SR, subtype='PCM_16')
print('ok', len(cues), 'cues')
if __name__ == '__main__':
    r = lambda a, s, e: 20 * np.log10(np.sqrt(np.mean(a[int(s * SR):int(e * SR)] ** 2)) + 1e-9)
    mb = (music * (.55 * duck)[:, None]).mean(1)
    for s, e in [(2, 4), (14, 16), (25, 27), (45, 47)]:
        print(f'{s}-{e}s  voice {r(vo * .78, s, e):.1f} dB  music {r(mb, s, e):.1f} dB  sfx {r(sfx.mean(1) * .9, s, e):.1f} dB')
