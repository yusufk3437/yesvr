"""20 s seamless ambient loop: A=432 lofi piano @60bpm, 432/639 Hz tones, deep brown noise,
fireplace crackle (left), close low drizzle + drops on glass (right).
Everything is rendered circularly (events wrap, filters/reverb in the FFT domain),
so sample N follows sample N-1 exactly -> gapless loop."""
import numpy as np, soundfile as sf
from scipy.signal import butter, sosfilt

SR = 48000
DUR = 20.0
N = int(SR * DUR)
rng = np.random.default_rng(432)
t = np.arange(N) / SR
freqs = np.fft.rfftfreq(N, 1 / SR)
TAU = 2 * np.pi

# ---------------------------------------------------------------- helpers
def fft_shape(x, mag):
    return np.fft.irfft(np.fft.rfft(x) * mag, N)

def colored_noise(shape_fn):
    spec = (rng.standard_normal(len(freqs)) + 1j * rng.standard_normal(len(freqs))) * shape_fn(freqs)
    spec[0] = 0
    x = np.fft.irfft(spec, N)
    return x / (np.abs(x).max() + 1e-12)

def lp(f, fc, order=2):  # smooth magnitude responses for FFT filtering
    return 1 / np.sqrt(1 + (f / fc) ** (2 * order))

def hp(f, fc, order=2):
    with np.errstate(divide='ignore'):
        return 1 / np.sqrt(1 + (fc / np.maximum(f, 1e-3)) ** (2 * order))

def add_circ(buf, sig, pos):
    pos = int(pos) % N
    L = len(sig)
    end = pos + L
    if end <= N:
        buf[pos:end] += sig
    else:
        k = N - pos
        buf[pos:] += sig[:k]
        rem = sig[k:]
        while len(rem):
            m = min(len(rem), N)
            buf[:m] += rem[:m]
            rem = rem[m:]

def pan(mono, p):  # p: -1 left .. +1 right, constant power
    a = (p + 1) * np.pi / 4
    return np.stack([mono * np.cos(a), mono * np.sin(a)], 1)

def circ_conv(x, ir):
    return np.fft.irfft(np.fft.rfft(x) * np.fft.rfft(ir, N), N)

def burst_filter(sig, lo, hi):
    sos = butter(2, [lo, min(hi, SR / 2 - 100)], 'bandpass', fs=SR, output='sos')
    return sosfilt(sos, sig)

def lowpass(sig, fc, order=2):
    return sosfilt(butter(order, fc, 'lowpass', fs=SR, output='sos'), sig)

# ---------------------------------------------------------------- piano (A4 = 432 Hz)
def mfreq(m):
    return 432.0 * 2 ** ((m - 69) / 12)

def piano_note(m, vel, hold):
    f0 = mfreq(m)
    T1 = np.interp(m, [30, 60, 84], [7.0, 4.5, 2.2])
    L = int(SR * (hold + 2.5))
    tt = np.arange(L) / SR
    B = 0.00025 * (1 + (m - 30) / 40)
    out = np.zeros(L)
    bright = 1.6 + (1 - vel) * 1.2           # soft touch -> fewer highs
    for n in range(1, 12):
        fn = n * f0 * np.sqrt(1 + B * n * n)
        if fn > 5000:
            break
        a = 1 / n ** bright
        Tn = T1 / (1 + 0.45 * (n - 1))
        env = 0.55 * np.exp(-tt / (Tn * 0.18)) + 0.45 * np.exp(-tt / Tn)
        det = 1 + rng.uniform(0.2, 0.7) * 1e-3 * 0.6   # two slightly detuned strings
        ph = rng.uniform(0, TAU)
        out += a * env * (np.sin(TAU * fn * tt + ph) + 0.8 * np.sin(TAU * fn * det * tt + ph))
    att = np.clip(tt / 0.006, 0, 1)            # felt hammer, soft attack
    rel = np.clip((hold + 0.6 - tt) / 0.6, 0, 1) ** 2   # pedal release
    out *= att * (0.35 + 0.65 * rel)
    thump = rng.standard_normal(int(SR * 0.03)) * np.exp(-np.arange(int(SR * 0.03)) / (SR * 0.006))
    thump = lowpass(thump, 400) * 0.25
    out[:len(thump)] += thump
    return out * vel / 3.0

BEAT = 1.0   # 60 bpm
# 5 bars x 4 beats = 20 beats = 20 s
# Am9 | Fmaj9 | Cmaj9 | Dm9 | Esus4 -> E7   (no E5 so nothing beats against 639 Hz)
bars = [
    (45, [52, 55, 59, 60]),
    (41, [52, 55, 57, 60]),
    (36, [52, 55, 59, 62]),
    (38, [53, 57, 60, 64]),
    (40, [50, 57, 59, 62]),
]
piano = np.zeros(N)
def swing(b):
    return b + (0.12 if (b * 2) % 2 == 1 else 0.0)

for bi, (bass, chord) in enumerate(bars):
    t0 = bi * 4 * BEAT
    add_circ(piano, piano_note(bass - 12, 0.55, 3.8) + 0, (t0 + 0.0) * SR)
    add_circ(piano, piano_note(bass, 0.35, 3.8), (t0 + 0.02) * SR)
    for k, m in enumerate(chord):               # slow lazy roll
        add_circ(piano, piano_note(m, 0.32 + 0.04 * rng.random(), 3.6), (t0 + 0.09 + 0.055 * k) * SR)
    # soft re-touch of the top of the chord on beat 3
    for k, m in enumerate(chord[1:3]):
        add_circ(piano, piano_note(m, 0.18, 1.6), (t0 + 2.0 + 0.04 * k + 0.08) * SR)
    if bi == 4:   # E7: G# instead of A on beat 3 to lead home
        add_circ(piano, piano_note(56, 0.24, 1.8), (t0 + 2.06) * SR)

melody = [  # (beat, midi, vel)  A-minor pentatonic, sparse, no E5
    (1.5, 64, 0.28), (2.5, 72, 0.33), (3.5, 71, 0.27),
    (5.0, 69, 0.30), (6.5, 67, 0.26), (7.5, 64, 0.22),
    (9.5, 67, 0.28), (10.5, 74, 0.30), (11.5, 71, 0.24),
    (13.0, 72, 0.30), (14.5, 69, 0.27), (15.5, 65, 0.22),
    (17.5, 71, 0.28), (18.5, 68, 0.26), (19.5, 71, 0.18),
]
for b, m, v in melody:
    add_circ(piano, piano_note(m, v, 1.4), swing(b) * BEAT * SR + rng.uniform(0, 0.02) * SR)

# deep / muffled lofi colour
piano = fft_shape(piano, lp(freqs, 1500, 2) * hp(freqs, 45, 2) * (1 + 0.6 * np.exp(-((freqs - 180) / 120) ** 2)))
# tape wow & flutter (periodic: 10 and 70 cycles per loop)
idx = np.arange(N) + 42 * np.sin(TAU * 10 * t / DUR) + 2.5 * np.sin(TAU * 70 * t / DUR + 1.0)
i0 = np.floor(idx).astype(int); fr = idx - i0
piano = piano[i0 % N] * (1 - fr) + piano[(i0 + 1) % N] * fr

# reverb (circular conv with synthetic stereo IR)
def reverb_ir(rt, seed):
    r = np.random.default_rng(seed)
    L = int(SR * rt * 1.2)
    tt = np.arange(L) / SR
    ir = r.standard_normal(L) * np.exp(-6.9 * tt / rt)
    ir = lowpass(ir, 3500)
    ir[:int(0.012 * SR)] = 0
    return ir / np.sqrt((ir ** 2).sum())
irL, irR = reverb_ir(2.8, 1), reverb_ir(2.8, 2)
pianoS = np.stack([piano + 0.55 * circ_conv(piano, irL), piano + 0.55 * circ_conv(piano, irR)], 1)

# ---------------------------------------------------------------- 432 + 639 Hz tones
sw1 = 0.75 + 0.25 * np.sin(TAU * 1 * t / DUR)
sw2 = 0.75 + 0.25 * np.sin(TAU * 1 * t / DUR + np.pi * 0.7)
tone432 = (np.sin(TAU * 432 * t) * 1.0 + np.sin(TAU * 216 * t) * 0.8 + np.sin(TAU * 108 * t) * 0.6) * sw1
tone639 = np.sin(TAU * 639 * t) * sw2
# gentle stereo shimmer: tiny phase offset per side (both exactly periodic in 20 s)
tones = np.stack([tone432 * 1.0 + tone639 * 0.85, tone432 * 0.95 + np.sin(TAU * 639 * t + 0.6) * sw2 * 0.9], 1)

# ---------------------------------------------------------------- deep brown noise
def brown_shape(f):
    return hp(f, 18, 2) * lp(f, 260, 2) / np.maximum(f, 15)
brown = np.stack([colored_noise(brown_shape), colored_noise(brown_shape)], 1)

# ---------------------------------------------------------------- fireplace (left)
fire = np.zeros(N)
def crackle(amp):
    L = int(SR * rng.uniform(0.0015, 0.008))
    s = rng.standard_normal(L) * np.exp(-np.arange(L) / (L * 0.25))
    c = rng.uniform(1200, 5000)
    s = burst_filter(s, c * 0.5, c * 1.6)
    return s / (np.abs(s).max() + 1e-9) * amp

def pop(amp):
    L = int(SR * 0.06)
    tt = np.arange(L) / SR
    body = np.sin(TAU * rng.uniform(140, 320) * tt) * np.exp(-tt / 0.012)   # woody knock
    s = crackle(1.0)
    out = body * 0.6
    out[:len(s)] += s
    return out * amp

nev = int(DUR * 5.5)
for _ in range(nev):
    add_circ(fire, crackle(rng.pareto(2.5) * 0.12 + 0.03), rng.uniform(0, N))
# clusters of tiny crackles + a few pops (the "çıt çıt")
for _ in range(9):
    p0 = rng.uniform(0, N)
    add_circ(fire, pop(rng.uniform(0.3, 0.55)), p0)
    for k in range(rng.integers(3, 9)):
        add_circ(fire, crackle(rng.uniform(0.05, 0.22)), p0 + rng.exponential(0.09) * SR * (k + 1))
fire = fft_shape(fire, lp(freqs, 6000, 2) * hp(freqs, 120, 1))
# soft flame breath / roar
roar = colored_noise(lambda f: hp(f, 40, 2) * lp(f, 380, 2) / np.maximum(f, 20) ** 0.5)
roar *= 0.75 + 0.25 * np.sin(TAU * 3 * t / DUR) + 0.1 * np.sin(TAU * 11 * t / DUR + 1)
fire = fire / np.abs(fire).max()
roar = roar / np.sqrt(np.mean(roar ** 2))
fireS = pan(fire * 10 ** (-15 / 20), -0.6) + pan(roar * 10 ** (-33 / 20), -0.45)
fireS[:, 0] += circ_conv(fire, irL) * 10 ** (-27 / 20)      # a little room

# ---------------------------------------------------------------- close, low drizzle (right)
def rain_shape(f):
    return hp(f, 90, 2) * lp(f, 2600, 2) / np.maximum(f, 50) ** 0.6 * (1 + 0.8 * np.exp(-((f - 260) / 220) ** 2))
rainL, rainR = colored_noise(rain_shape), colored_noise(rain_shape)
renv = 0.8 + 0.12 * np.sin(TAU * 2 * t / DUR + 0.4) + 0.08 * np.sin(TAU * 5 * t / DUR)
rainBed = np.stack([rainL * 0.55, rainR * 0.8], 1) * renv[:, None]

drip = np.zeros((N, 2))
def soft_drop(amp):
    L = int(SR * 0.035)
    tt = np.arange(L) / SR
    tick = rng.standard_normal(L) * np.exp(-tt / 0.0012)
    tick = burst_filter(tick, 500, rng.uniform(2000, 3500))
    thud = np.sin(TAU * rng.uniform(90, 220) * tt) * np.exp(-tt / 0.009)   # low, close patter
    return (tick * 0.6 + thud) * amp
for _ in range(int(DUR * 45)):
    s = soft_drop(rng.uniform(0.01, 0.05))
    p = rng.uniform(0, N)
    pv = rng.uniform(-0.1, 1.0)
    st = pan(s, pv)
    add_circ(drip[:, 0], st[:, 0], p); add_circ(drip[:, 1], st[:, 1], p)

glass = np.zeros((N, 2))
def glass_tap(amp):
    L = int(SR * 0.05)
    tt = np.arange(L) / SR
    f1 = rng.uniform(1600, 2900)
    ring = np.sin(TAU * f1 * tt) * np.exp(-tt / rng.uniform(0.004, 0.009))
    ring += 0.4 * np.sin(TAU * f1 * 1.57 * tt) * np.exp(-tt / 0.003)
    click = rng.standard_normal(L) * np.exp(-tt / 0.0006)
    knock = np.sin(TAU * rng.uniform(250, 420) * tt) * np.exp(-tt / 0.006)
    return lowpass(ring * 0.5 + click * 0.15 + knock * 0.6, 4500) * amp
for _ in range(int(DUR * 6)):
    st = pan(glass_tap(rng.uniform(0.03, 0.11)), rng.uniform(0.35, 0.9))
    p = rng.uniform(0, N)
    add_circ(glass[:, 0], st[:, 0], p); add_circ(glass[:, 1], st[:, 1], p)
glass[:, 0] = circ_conv(glass[:, 0], irL) * 0.25 + glass[:, 0]
glass[:, 1] = circ_conv(glass[:, 1], irR) * 0.25 + glass[:, 1]

# ---------------------------------------------------------------- mix
def rms(x):
    return np.sqrt(np.mean(x ** 2))
def at(x, db):
    return x / (rms(x) + 1e-12) * 10 ** (db / 20)

def atp(x, db):
    return x / (np.abs(x).max() + 1e-12) * 10 ** (db / 20)

mix = (at(pianoS, -20.0) + at(tones, -32.0) + at(brown, -28.5) + fireS
       + at(rainBed, -29.5) + atp(drip, -21.0) + atp(glass, -18.0))
mix[:, 0] = fft_shape(mix[:, 0], lp(freqs, 9000, 1))
mix[:, 1] = fft_shape(mix[:, 1], lp(freqs, 9000, 1))
GAIN_DB = 0.0
mix = mix * 10 ** (GAIN_DB / 20)
mix = np.tanh(mix * 1.05) / 1.05      # only touches rare peaks

if __name__ == '__main__':
    sf.write('ses_loop_20s.wav', mix.astype(np.float32), SR, subtype='PCM_24')
    print('rms dB', 20 * np.log10(rms(mix)), 'peak', np.abs(mix).max())
    for name, x in [('piano', pianoS), ('tones', tones), ('brown', brown), ('fire', fireS), ('rain', rainBed), ('drip', drip), ('glass', glass)]:
        sf.write(f'stem_{name}.wav', (x / np.abs(x).max() * 0.8).astype(np.float32), SR)
