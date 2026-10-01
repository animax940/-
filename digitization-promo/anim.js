// Deterministic motion-graphics timeline: render(t) draws the frame at time t (seconds).
const FPS = 30, DURATION = 60;
const C = {cream:'#F3EFE7', navy:'#1E2A55', navy2:'#2E3D73', red:'#E8414A', red2:'#C9323B', yellow:'#F5B82E',
  orange:'#F08A2E', teal:'#1FA79A', plum:'#5A2A4A', mag:'#B0126E', blue:'#3D7BE0', grey:'#8A8FA3', line:'#E1DBCD', white:'#FFFFFF'};

// ---------- math / easing ----------
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, k) => a + (b - a) * k;
const E = {
  lin: x => x,
  out: x => 1 - Math.pow(1 - x, 3),
  in: x => x * x * x,
  io: x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2,
  expo: x => x >= 1 ? 1 : 1 - Math.pow(2, -10 * x),
  inExpo: x => x <= 0 ? 0 : Math.pow(2, 10 * x - 10),
  ioExpo: x => x <= 0 ? 0 : x >= 1 ? 1 : x < .5 ? Math.pow(2, 20 * x - 10) / 2 : (2 - Math.pow(2, -20 * x + 10)) / 2,
  back: x => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); },
  elastic: x => x <= 0 ? 0 : x >= 1 ? 1 : Math.pow(2, -10 * x) * Math.sin((x * 10 - .75) * (2 * Math.PI) / 3) + 1,
};
const P = (t, s, d, e = E.out) => e(clamp((t - s) / d));
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let r = Math.imul(seed ^ seed >>> 15, 1 | seed); r = r + Math.imul(r ^ r >>> 7, 61 | r) ^ r; return ((r ^ r >>> 14) >>> 0) / 4294967296; }; }

// ---------- DOM helpers ----------
const $ = id => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';
function svgIn(parent, html) { const g = document.createElementNS(NS, 'g'); g.innerHTML = html; parent.appendChild(g); return g; }
function tf(el, x, y, s = 1, r = 0, o = 1) {
  el.setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${r.toFixed(2)}) scale(${Math.max(0.0001, s).toFixed(4)})`);
  el.style.opacity = clamp(o);
}
function hf(el, x, y, s = 1, r = 0, o = 1) {
  el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) translate(-50%,-50%) rotate(${r}deg) scale(${Math.max(0.0001, s)})`;
  el.style.opacity = clamp(o);
}
const pop = (t, s, d = .55) => P(t, s, d, E.back);              // scale-in with overshoot
const fadeIn = (t, s, d = .3) => P(t, s, d, E.lin);
const revealRTL = (el, k) => el.style.clipPath = `inset(-20% 0 -20% ${((1 - k) * 100).toFixed(2)}%)`;

// ---------- audio cue sheet (consumed by tools/audio.py) ----------
const CUES = [];
const cue = (t, type, gain = 1) => CUES.push({t: +t.toFixed(3), type, gain});

// ---------- reusable drawings (each centred on 0,0) ----------
const D = {
  sheet: (w = 230, h = 30, fill = C.white) => `<rect x="${-w/2}" y="${-h/2}" width="${w}" height="${h}" rx="4" fill="${fill}" stroke="${C.navy}" stroke-width="3"/>`,
  page: (w = 120, h = 160, fill = C.white, lines = 5) => {
    let s = `<rect x="${-w/2}" y="${-h/2}" width="${w}" height="${h}" rx="8" fill="${fill}" stroke="${C.navy}" stroke-width="4"/>`;
    for (let i = 0; i < lines; i++) s += `<rect x="${-w/2 + 18}" y="${-h/2 + 26 + i * 24}" width="${(i % 3 === 2 ? .5 : .78) * w}" height="8" rx="4" fill="${i === 0 ? C.red : '#C9CCD8'}"/>`;
    return s;
  },
  folder: (fill = C.yellow, w = 240, h = 46) => `<path d="M${-w/2} ${-h/2} h70 l12 -12 h50 l12 12 H${w/2} v${h} H${-w/2} Z" fill="${fill}" stroke="${C.navy}" stroke-width="3"/>`,
  clock: () => `<circle r="92" fill="${C.red}"/><circle r="72" fill="${C.cream}" stroke="${C.navy}" stroke-width="5"/>` +
    [...Array(12)].map((_, i) => `<rect x="-3" y="-66" width="6" height="${i % 3 ? 8 : 14}" fill="${C.navy}" transform="rotate(${i * 30})"/>`).join('') +
    `<g class="hh"><rect x="-5" y="-40" width="10" height="44" rx="5" fill="${C.navy}"/></g><g class="mh"><rect x="-3" y="-60" width="6" height="64" rx="3" fill="${C.red}"/></g><circle r="9" fill="${C.navy}"/>
     <rect x="-14" y="-118" width="28" height="22" rx="5" fill="${C.navy}"/>`,
  magnifier: () => `<rect x="38" y="44" width="26" height="96" rx="12" fill="${C.navy}" transform="rotate(-45 0 0)"/><circle r="70" fill="#fff" fill-opacity=".55" stroke="${C.navy}" stroke-width="14"/><path d="M-40 -18 a46 46 0 0 1 30 -32" stroke="#fff" stroke-width="10" fill="none" stroke-linecap="round"/>`,
  qmark: (c = C.red) => `<text font-family="Cairo" font-weight="900" font-size="130" text-anchor="middle" dominant-baseline="central" fill="${c}">؟</text>`,
  cabinet: () => {
    let s = `<rect x="-150" y="-220" width="300" height="440" rx="16" fill="${C.navy}"/><rect x="-150" y="200" width="300" height="20" fill="#14204A"/>`;
    for (let i = 0; i < 3; i++) s += `<g class="drawer" data-i="${i}"><rect x="-128" y="${-200 + i * 136}" width="256" height="118" rx="10" fill="${C.navy2}" stroke="#14204A" stroke-width="4"/><rect x="-40" y="${-160 + i * 136}" width="80" height="18" rx="9" fill="${C.yellow}"/></g>`;
    return s;
  },
  hourglass: () => `<rect x="-80" y="-130" width="160" height="22" rx="8" fill="${C.plum}"/><rect x="-80" y="108" width="160" height="22" rx="8" fill="${C.plum}"/>
    <path d="M-62 -108 H62 C62 -40 14 -20 8 0 C14 20 62 40 62 108 H-62 C-62 40 -14 20 -8 0 C-14 -20 -62 -40 -62 -108 Z" fill="#fff" stroke="${C.navy}" stroke-width="6"/>
    <path class="sandTop" d="M-46 -80 H46 C40 -40 10 -24 0 -6 C-10 -24 -40 -40 -46 -80 Z" fill="${C.yellow}"/>
    <path class="sandBot" d="M-50 100 H50 C44 70 14 56 0 40 C-14 56 -44 70 -50 100 Z" fill="${C.orange}"/>`,
  logoIcon: () => {
    let s = `<rect x="-120" y="-120" width="240" height="240" rx="54" fill="${C.navy}"/>
      <path d="M-62 -84 H30 L66 -48 V84 H-62 Z" fill="#fff"/><path d="M30 -84 V-48 H66 Z" fill="${C.yellow}"/>
      <rect x="-40" y="-56" width="70" height="10" rx="5" fill="${C.red}"/><rect x="-40" y="-34" width="84" height="10" rx="5" fill="#C9CCD8"/>`;
    const cols = [C.red, C.yellow, C.teal, C.blue, C.orange];
    for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++)
      s += `<rect class="px" x="${-48 + c * 18}" y="${-6 + r * 20}" width="14" height="14" rx="3" fill="${cols[(r * 7 + c * 3) % 5]}" data-k="${(r * 6 + c)}"/>`;
    return s;
  },
  scanner: () => `<rect x="-190" y="-30" width="380" height="120" rx="20" fill="${C.navy}"/><rect x="-170" y="-50" width="340" height="40" rx="10" fill="${C.navy2}"/>
    <rect x="-150" y="30" width="300" height="14" rx="7" fill="#14204A"/><circle cx="140" cy="60" r="10" fill="${C.teal}"/><circle cx="110" cy="60" r="10" fill="${C.yellow}"/>
    <rect class="beam" x="-170" y="-44" width="340" height="10" rx="5" fill="#7FF3E5"/>`,
  tablet: () => `<rect x="-200" y="-150" width="400" height="300" rx="26" fill="${C.navy}"/><rect x="-176" y="-126" width="352" height="252" rx="12" fill="#EAF2FF"/><circle cx="188" cy="0" r="6" fill="#3B4A80"/>`,
  fileTile: (c) => `<rect x="-26" y="-32" width="52" height="64" rx="8" fill="#fff" stroke="${c}" stroke-width="4"/><rect x="-14" y="-14" width="28" height="6" rx="3" fill="${c}"/><rect x="-14" y="0" width="22" height="6" rx="3" fill="#C9CCD8"/><rect x="-14" y="13" width="26" height="6" rx="3" fill="#C9CCD8"/>`,
  iconScan: () => `<rect x="-62" y="-6" width="124" height="54" rx="12" fill="#fff"/><rect x="-50" y="-30" width="100" height="22" rx="6" fill="${C.navy}"/><rect x="-46" y="-80" width="70" height="56" rx="6" fill="#fff" stroke="${C.navy}" stroke-width="5"/><rect class="beam" x="-56" y="-2" width="112" height="8" rx="4" fill="${C.teal}"/>`,
  iconIndex: () => `<rect x="-62" y="-72" width="124" height="144" rx="14" fill="#fff"/>` + [0,1,2,3].map(i => `<circle cx="38" cy="${-40 + i * 28}" r="8" fill="${[C.red, C.teal, C.blue, C.orange][i]}"/><rect class="row" data-i="${i}" x="-44" y="${-45 + i * 28}" width="66" height="10" rx="5" fill="${C.navy}"/>`).join('') +
    `<g transform="translate(-50 54) rotate(-20)"><path d="M0 -20 H44 L64 0 L44 20 H0 Z" fill="${C.red}"/><circle cx="12" r="6" fill="#fff"/></g>`,
  iconCloud: () => `<path d="M-82 44 H78 A46 46 0 0 0 74 -46 A66 66 0 0 0 -50 -52 A48 48 0 0 0 -82 44 Z" fill="#fff"/>
    <g transform="translate(0 6)"><path d="M-18 -10 V-24 a18 18 0 0 1 36 0 V-10" fill="none" stroke="${C.navy}" stroke-width="8"/><rect x="-28" y="-12" width="56" height="44" rx="8" fill="${C.navy}"/><circle cy="8" r="6" fill="${C.yellow}"/></g>`,
  laptop: () => `<rect x="-470" y="-290" width="940" height="560" rx="28" fill="${C.navy}"/><rect x="-440" y="-260" width="880" height="500" rx="10" fill="#F9F8F5"/>
    <path d="M-560 270 H560 L520 310 H-520 Z" fill="#2E3D73"/><rect x="-80" y="270" width="160" height="14" rx="7" fill="#14204A"/>
    <rect x="-440" y="-260" width="880" height="52" fill="#E6E2D8"/><circle cx="400" cy="-234" r="10" fill="${C.red}"/><circle cx="370" cy="-234" r="10" fill="${C.yellow}"/><circle cx="340" cy="-234" r="10" fill="${C.teal}"/>
    <rect id="sbar" x="-360" y="-180" width="720" height="78" rx="39" fill="#fff" stroke="${C.navy}" stroke-width="4"/>
    <g transform="translate(316 -141)"><circle r="16" fill="none" stroke="${C.navy}" stroke-width="6"/><rect x="10" y="10" width="8" height="18" rx="4" fill="${C.navy}" transform="rotate(-45 10 10)"/></g>
    <g id="sbtn"><rect x="-356" y="-174" width="150" height="66" rx="33" fill="${C.red}"/><text x="-281" y="-131" text-anchor="middle" font-family="Tajawal" font-weight="700" font-size="30" fill="#fff">بحث</text></g>`,
  resultCard: (c) => `<rect x="-360" y="-36" width="720" height="72" rx="14" fill="#fff" stroke="#E2DED4" stroke-width="3"/>
    <g transform="translate(305 0) scale(.75)">${`<rect x="-26" y="-32" width="52" height="64" rx="8" fill="#fff" stroke="${c}" stroke-width="5"/><rect x="-14" y="-12" width="28" height="6" rx="3" fill="${c}"/><rect x="-14" y="4" width="22" height="6" rx="3" fill="#C9CCD8"/>`}</g>
    <rect x="-20" y="-20" width="270" height="14" rx="7" fill="${C.navy}"/><rect x="40" y="6" width="210" height="11" rx="5" fill="#C9CCD8"/><rect x="-200" y="6" width="120" height="11" rx="5" fill="#C9CCD8"/>`,
  phone: () => `<rect x="-120" y="-230" width="240" height="460" rx="36" fill="${C.navy}"/><rect x="-104" y="-200" width="208" height="400" rx="14" fill="#EAF2FF"/><rect x="-30" y="-218" width="60" height="8" rx="4" fill="#3B4A80"/>
    <g transform="translate(0 -60)"><rect x="-60" y="-78" width="120" height="156" rx="10" fill="#fff" stroke="${C.teal}" stroke-width="5"/><rect x="-40" y="-50" width="80" height="10" rx="5" fill="${C.teal}"/>` +
    [0,1,2,3].map(i => `<rect x="-40" y="${-26 + i * 22}" width="${i % 2 ? 54 : 80}" height="8" rx="4" fill="#C9CCD8"/>`).join('') + `</g>
    <rect x="-80" y="100" width="160" height="48" rx="24" fill="${C.teal}"/><path d="M-14 124 l10 10 l20 -20" stroke="#fff" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
  globe: () => `<circle r="56" fill="${C.blue}"/><ellipse rx="24" ry="56" fill="none" stroke="#fff" stroke-width="5"/><path d="M-56 0 H56 M-48 -28 H48 M-48 28 H48" stroke="#fff" stroke-width="5"/><circle r="56" fill="none" stroke="#fff" stroke-width="5"/>`,
  shield: () => `<path d="M0 -200 L160 -140 V-10 C160 90 90 160 0 205 C-90 160 -160 90 -160 -10 V-140 Z" fill="${C.navy}"/>
    <path d="M0 -168 L130 -120 V-12 C130 70 74 128 0 168 Z" fill="${C.navy2}"/>
    <g class="lock" transform="translate(0 10)"><path class="shackle" d="M-44 -20 V-62 a44 44 0 0 1 88 0 V-20" fill="none" stroke="${C.yellow}" stroke-width="20" stroke-linecap="round"/>
    <rect x="-70" y="-26" width="140" height="112" rx="20" fill="${C.yellow}"/><circle cy="18" r="14" fill="${C.navy}"/><rect x="-6" y="22" width="12" height="34" rx="6" fill="${C.navy}"/></g>`,
  orbit: (c, glyph) => `<circle r="44" fill="${c}"/>${glyph}`,
  plane: () => `<path d="M-70 10 L80 -50 L20 60 L0 22 Z" fill="#fff" stroke="${C.navy}" stroke-width="5" stroke-linejoin="round"/><path d="M0 22 L80 -50 L-10 40 Z" fill="#DADCE6" stroke="${C.navy}" stroke-width="5" stroke-linejoin="round"/>`,
  card: (w = 400, h = 430, accent = C.red) => `<rect x="${-w/2 + 14}" y="${-h/2 + 14}" width="${w}" height="${h}" rx="34" fill="${C.navy}" opacity=".12"/><rect x="${-w/2}" y="${-h/2}" width="${w}" height="${h}" rx="34" fill="#fff"/><rect x="${-w/2}" y="${-h/2}" width="${w}" height="16" rx="8" fill="${accent}"/>`,
  burst: (n, r1, r2, c) => [...Array(n)].map((_, i) => `<rect x="${r1}" y="-5" width="${r2 - r1}" height="10" rx="5" fill="${c}" transform="rotate(${i * 360 / n})"/>`).join(''),
};

// ---------- scene construction ----------
let BG, S = {}, FX;
function build() {
  // background: faint circuit lines + floating rings
  const bg = $('bg'), R = rng(7);
  let paths = '';
  for (let i = 0; i < 26; i++) {
    let x = R() * 2200 - 140, y = R() * 1300 - 110, d = `M${x.toFixed(0)} ${y.toFixed(0)}`;
    for (let k = 0; k < 4; k++) { if (k % 2) y += (R() - .5) * 600; else x += (R() - .5) * 700; d += ` L${x.toFixed(0)} ${y.toFixed(0)}`; }
    paths += `<path d="${d}" stroke="${C.line}" stroke-width="3" fill="none"/>`;
    if (R() > .5) paths += `<rect x="${x - 9}" y="${y - 9}" width="18" height="18" fill="none" stroke="${C.line}" stroke-width="3"/>`;
  }
  BG = {lines: svgIn(bg, paths), dots: []};
  for (let i = 0; i < 16; i++) {
    const g = svgIn(bg, R() > .4 ? `<circle r="${6 + R() * 6}" fill="none" stroke="${C.navy}" stroke-width="4"/>` : `<circle r="${3 + R() * 3}" fill="${C.navy}"/>`);
    BG.dots.push({g, x: R() * 1920, y: R() * 1080, a: R() * 6.28, sp: .2 + R() * .4, amp: 10 + R() * 22});
  }
  BG.clouds = [0, 1, 2].map(i => ({g: svgIn(bg, `<path d="M-40 10 H40 A18 18 0 0 0 30 -18 A26 26 0 0 0 -16 -20 A20 20 0 0 0 -40 10 Z" fill="#fff"/>`), y: 130 + i * 290, x0: i * 700 + 200, sp: 14 + i * 5}));

  for (let i = 1; i <= 8; i++) S[i] = {el: $('s' + i), svg: $('s' + i).querySelector('svg')};

  // S1 — paper chaos
  const s1 = S[1], R1 = rng(11);
  s1.stacks = [];
  [[650, 13], [960, 17], [1270, 11]].forEach(([x, n], si) => {
    const sheets = [];
    for (let k = 0; k < n; k++) {
      const isFolder = R1() < .2, w = 220 + R1() * 30;
      const g = svgIn(s1.svg, isFolder ? D.folder([C.yellow, C.red, C.blue][k % 3], w, 30) : D.sheet(w, 26, k % 6 === 3 ? '#FFF6DE' : '#fff'));
      sheets.push({g, x: x + (R1() - .5) * 26, y: 905 - k * 26, r: (R1() - .5) * 6, d: .9 + si * .12 + k * .05});
    }
    s1.stacks.push(sheets);
  });
  s1.flying = [...Array(7)].map((_, i) => ({g: svgIn(s1.svg, D.page(90, 120, '#fff', 4)), x: 300 + R1() * 1320, y: 360 + R1() * 280, r: R1() * 360, sp: (R1() - .5) * 60, d: 1.6 + i * .12}));
  s1.mag = svgIn(s1.svg, D.magnifier());
  s1.q = [0, 1, 2].map(() => svgIn(s1.svg, D.qmark()));
  s1.clock = svgIn(s1.svg, D.clock());

  // S2 — old way
  const s2 = S[2];
  s2.papersOut = [...Array(6)].map((_, i) => svgIn(s2.svg, D.page(100, 130, '#fff', 4)));
  s2.cab = svgIn(s2.svg, D.cabinet());
  s2.drawers = [...s2.cab.querySelectorAll('.drawer')];
  s2.hg = svgIn(s2.svg, D.hourglass());
  s2.x = svgIn(s2.svg, `<circle r="46" fill="${C.red}"/><path d="M-18 -18 L18 18 M18 -18 L-18 18" stroke="#fff" stroke-width="10" stroke-linecap="round"/>`);

  // S3 — logo reveal + transformation
  const s3 = S[3];
  s3.burst = svgIn(s3.svg, D.burst(12, 175, 215, C.yellow));
  s3.ring = svgIn(s3.svg, `<circle r="175" fill="none" stroke="${C.red}" stroke-width="6" stroke-dasharray="14 18"/>`);
  s3.logo = svgIn(s3.svg, D.logoIcon());
  s3.px = [...s3.logo.querySelectorAll('.px')];
  s3.conf = [...Array(14)].map((_, i) => svgIn(s3.svg, i % 3 === 0 ? `<polygon points="0,-14 13,10 -13,10" fill="${C.red}"/>` : i % 3 === 1 ? `<rect x="-6" y="-14" width="12" height="28" rx="3" fill="${C.navy}"/>` : `<circle r="9" fill="${C.orange}"/>`));
  s3.stack = [...Array(6)].map((_, k) => svgIn(s3.svg, D.sheet(200, 26)));
  s3.flyP = [...Array(5)].map(() => svgIn(s3.svg, D.page(100, 130, '#fff', 4)));
  s3.scanner = svgIn(s3.svg, D.scanner());
  s3.beam = s3.scanner.querySelector('.beam');
  s3.tablet = svgIn(s3.svg, D.tablet());
  s3.bits = [...Array(18)].map((_, i) => svgIn(s3.svg, `<rect x="-9" y="-9" width="18" height="18" rx="4" fill="${[C.red, C.yellow, C.teal, C.blue][i % 4]}"/>`));
  s3.tiles = [...Array(12)].map((_, i) => svgIn(s3.svg, D.fileTile([C.red, C.teal, C.blue, C.orange][i % 4])));
  s3.arrow = svgIn(s3.svg, `<path d="M0 0 H-120" stroke="${C.navy}" stroke-width="8" stroke-dasharray="16 14" stroke-linecap="round"/><path d="M-120 -18 L-146 0 L-120 18 Z" fill="${C.navy}"/>`);

  // S4 — 3 steps
  const s4 = S[4];
  s4.X = [1460, 960, 460];
  s4.links = [0, 1].map(i => svgIn(s4.svg, `<path d="M${s4.X[i] - 190} 470 H${s4.X[i + 1] + 190}" stroke="${C.navy}" stroke-width="7" stroke-dasharray="4 18" stroke-linecap="round"/>`));
  s4.packets = [0, 1, 2, 3].map(i => svgIn(s4.svg, `<rect x="-11" y="-11" width="22" height="22" rx="5" fill="${[C.red, C.yellow, C.teal, C.blue][i]}"/>`));
  const cols = [C.red, C.orange, C.teal], icons = [D.iconScan(), D.iconIndex(), D.iconCloud()];
  s4.steps = [0, 1, 2].map(i => {
    const ring = svgIn(s4.svg, `<circle r="186" fill="none" stroke="${cols[i]}" stroke-width="5" stroke-dasharray="10 16"/>`);
    const disc = svgIn(s4.svg, `<circle r="160" fill="${cols[i]}"/><circle r="160" fill="none" stroke="${C.navy}" stroke-width="0"/><g transform="scale(1.35)">${icons[i]}</g>
      <g transform="translate(110 -112)"><circle r="40" fill="${C.navy}"/><text text-anchor="middle" dominant-baseline="central" font-family="Cairo" font-weight="900" font-size="44" fill="#fff" y="2">${'١٢٣'[i]}</text></g>`);
    return {ring, disc, beam: disc.querySelector('.beam'), rows: [...disc.querySelectorAll('.row')]};
  });

  // S5 — search
  const s5 = S[5];
  s5.laptop = svgIn(s5.svg, D.laptop());
  s5.btn = s5.laptop.querySelector('#sbtn');
  s5.cards = [0, 1, 2, 3].map(i => svgIn(s5.svg, D.resultCard([C.teal, C.red, C.blue, C.orange][i])));
  s5.hl = svgIn(s5.svg, `<rect x="-372" y="-48" width="744" height="96" rx="20" fill="none" stroke="${C.teal}" stroke-width="7"/><g transform="translate(-372 -48)"><circle r="30" fill="${C.teal}"/><path d="M-12 0 l8 9 l16 -18" stroke="#fff" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g>`);
  s5.cursor = svgIn(s5.svg, `<path d="M0 0 L0 46 L12 34 L22 56 L32 51 L22 30 L38 30 Z" fill="#fff" stroke="${C.navy}" stroke-width="4" stroke-linejoin="round"/>`);
  s5.phone = svgIn(s5.svg, D.phone());
  s5.globe = svgIn(s5.svg, D.globe());
  s5.clock = svgIn(s5.svg, D.clock());

  // S6 — security
  const s6 = S[6];
  s6.links = [[1380, 330], [520, 540], [1380, 760]].map(([x, y]) => svgIn(s6.svg, `<path d="M960 520 L${x} ${y}" stroke="${C.navy}" stroke-width="5" stroke-dasharray="6 14" stroke-linecap="round" fill="none"/>`));
  s6.ring1 = svgIn(s6.svg, `<circle r="290" fill="none" stroke="${C.navy}" stroke-width="4" stroke-dasharray="6 16"/>`);
  s6.ring2 = svgIn(s6.svg, `<path d="M-250 0 A250 250 0 0 1 177 -177" fill="none" stroke="${C.red}" stroke-width="14" stroke-linecap="round"/><path d="M250 0 A250 250 0 0 1 -60 243" fill="none" stroke="${C.yellow}" stroke-width="14" stroke-linecap="round"/>`);
  s6.disc = svgIn(s6.svg, `<circle r="235" fill="#fff"/>`);
  s6.shield = svgIn(s6.svg, D.shield());
  s6.shackle = s6.shield.querySelector('.shackle');
  s6.orbits = [
    D.orbit(C.red, `<circle cy="-10" r="12" fill="#fff"/><path d="M-22 22 a22 18 0 0 1 44 0 Z" fill="#fff"/>`),
    D.orbit(C.teal, `<path d="M-18 -4 a18 18 0 1 1 6 16" stroke="#fff" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M-30 -6 L-18 8 L-6 -6 Z" fill="#fff"/>`),
    D.orbit(C.orange, `<circle cx="-10" r="13" fill="none" stroke="#fff" stroke-width="7"/><path d="M2 0 H26 M18 0 V12" stroke="#fff" stroke-width="7" stroke-linecap="round"/>`),
  ].map(h => svgIn(s6.svg, h));
  s6.check = svgIn(s6.svg, `<circle r="40" fill="${C.teal}"/><path d="M-16 0 l11 12 l22 -24" stroke="#fff" stroke-width="9" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`);

  // S7 — benefits
  const s7 = S[7];
  s7.X = [1440, 960, 480];
  s7.cards = [C.teal, C.blue, C.red].map(c => svgIn(s7.svg, D.card(400, 440, c)));
  s7.icons = [
    `<circle r="52" fill="${C.teal}"/><path d="M-22 -26 H10 L24 -12 V28 H-22 Z" fill="#fff"/><rect x="-12" y="-6" width="26" height="6" rx="3" fill="${C.teal}"/><rect x="-12" y="8" width="18" height="6" rx="3" fill="${C.teal}"/>`,
    `<circle r="52" fill="${C.blue}"/><circle r="28" fill="none" stroke="#fff" stroke-width="7"/><path d="M0 -14 V0 L12 8" stroke="#fff" stroke-width="6" fill="none" stroke-linecap="round"/>`,
    `<circle r="52" fill="${C.red}"/><path d="M-20 -26 H20 V26 H-20 Z" fill="#fff"/><path d="M-30 30 L30 -30" stroke="${C.navy}" stroke-width="8" stroke-linecap="round"/>`,
  ].map(h => svgIn(s7.svg, h));
  s7.plane = svgIn(s7.svg, D.plane());
  s7.trail = svgIn(s7.svg, `<path id="trail" d="" stroke="${C.navy}" stroke-width="5" stroke-dasharray="4 16" stroke-linecap="round" fill="none"/>`).firstChild;

  // S8 — end card
  const s8 = S[8];
  s8.burst = svgIn(s8.svg, D.burst(16, 150, 182, C.yellow));
  s8.logo = svgIn(s8.svg, D.logoIcon());
  const soc = [
    `<text y="12" text-anchor="middle" font-family="Cairo" font-weight="900" font-size="40" fill="#fff">f</text>`,
    `<text y="12" text-anchor="middle" font-family="Cairo" font-weight="900" font-size="34" fill="#fff">X</text>`,
    `<rect x="-17" y="-17" width="34" height="34" rx="10" fill="none" stroke="#fff" stroke-width="5"/><circle r="8" fill="none" stroke="#fff" stroke-width="5"/><circle cx="10" cy="-10" r="3" fill="#fff"/>`,
    `<text y="12" text-anchor="middle" font-family="Cairo" font-weight="900" font-size="32" fill="#fff">in</text>`,
    `<path d="M-18 0 L18 -14 L10 16 L2 6 Z" fill="#fff"/>`,
  ];
  s8.soc = soc.map(g => svgIn(s8.svg, `<circle r="36" fill="#6B6F80"/>${g}`));
  s8.dots = [...Array(10)].map((_, i) => svgIn(s8.svg, i % 2 ? `<circle r="10" fill="none" stroke="${C.navy}" stroke-width="5"/>` : `<rect x="-7" y="-7" width="14" height="14" fill="${[C.red, C.yellow, C.teal][i % 3]}" transform="rotate(20)"/>`));

  // FX layer (transitions)
  FX = {
    panels: [C.red, C.navy, C.yellow].map(c => svgIn($('fx'), `<rect x="0" y="0" width="1920" height="1080" fill="${c}"/>`)),
    diag: [C.red, C.navy].map(c => svgIn($('fx'), `<rect x="-1400" y="-1600" width="2800" height="3200" fill="${c}"/>`)),
    iris: svgIn($('fx'), `<circle r="1" fill="${C.plum}"/>`),
    irisHole: svgIn($('fx'), `<circle r="1" fill="${C.cream}"/>`),
    push: svgIn($('fx'), `<rect x="-1000" y="0" width="1000" height="1080" fill="${C.navy}"/><rect x="-1300" y="0" width="300" height="1080" fill="${C.yellow}"/>`),
    circ: svgIn($('fx'), `<circle r="1" fill="${C.red}"/>`),
    circHole: svgIn($('fx'), `<circle r="1" fill="${C.cream}"/>`),
    stripes: [C.yellow, C.navy, C.red, C.teal].map((c, i) => svgIn($('fx'), `<rect x="${i * 480}" y="0" width="482" height="1080" fill="${c}"/>`)),
    ring: svgIn($('fx'), `<path fill="${C.plum}" fill-rule="evenodd" d=""/>`),
  };
  FX.ringPath = FX.ring.firstChild;

  // audio cues, aligned to the visual beats below
  [0.05, 0.25].forEach(t => cue(t, 'whoosh', .8));
  for (let k = 0; k < 9; k++) cue(1.0 + k * .16, 'pop', .35);
  cue(2.75, 'pop'); cue(3.0, 'pop', .6); cue(3.2, 'pop', .6); cue(5.25, 'pop'); cue(5.3, 'tick', .7);
  cue(7.15, 'whoosh'); cue(8.3, 'pop'); cue(8.6, 'drawer'); cue(9.0, 'drawer'); cue(9.4, 'drawer'); cue(11.3, 'swish', .7); cue(12.0, 'pop');
  cue(12.2, 'riser'); cue(12.8, 'whoosh'); cue(13.75, 'impact'); cue(14.3, 'swish', .6); cue(15.0, 'pop', .6);
  cue(16.6, 'whoosh', .6); cue(17.0, 'pop', .5); cue(17.3, 'pop', .5); for (let k = 0; k < 5; k++) cue(17.4 + k * .3, 'swish', .35);
  cue(18.2, 'scan'); for (let k = 0; k < 12; k++) cue(19.0 + k * .11, 'blip', .4);
  cue(20.55, 'whoosh'); cue(21.3, 'pop', .6); cue(21.6, 'pop'); cue(22.4, 'scan', .6); cue(25.2, 'pop'); cue(26.6, 'pop'); cue(27.2, 'ding', .6);
  cue(29.7, 'whoosh'); cue(30.5, 'pop', .6);
  for (let k = 0; k < 16; k++) cue(30.9 + k * .075, 'type', .55);
  cue(32.25, 'click'); for (let k = 0; k < 4; k++) cue(32.5 + k * .15, 'pop', .45); cue(33.3, 'ding'); cue(33.4, 'whoosh', .5); cue(33.6, 'pop'); cue(34.7, 'pop');
  cue(36.0, 'whoosh'); cue(37.2, 'impact', .7); cue(37.5, 'pop', .6); cue(38.15, 'lock'); cue(39.0, 'pop', .6); cue(40.9, 'pop', .6); cue(41.4, 'ding', .5);
  cue(43.2, 'whoosh'); cue(44.4, 'pop', .5); cue(44.8, 'pop'); cue(45.3, 'pop'); cue(45.8, 'pop');
  for (let k = 0; k < 14; k++) cue(45.0 + k * .1, 'blip', .25);
  cue(47.7, 'swish', .8); cue(48.2, 'pop', .6);
  cue(50.85, 'whoosh'); cue(51.85, 'impact'); cue(52.3, 'swish', .5);
  for (let k = 0; k < 10; k++) cue(53.5 + k * .09, 'type', .4);
  cue(55.0, 'pop', .5); for (let k = 0; k < 5; k++) cue(55.6 + k * .14, 'pop', .45); cue(57.0, 'ding', .5);
}

// ---------- scene windows ----------
const WIN = {1: [0, 7.62], 2: [7.58, 13.25], 3: [13.2, 21.15], 4: [20.85, 30.2], 5: [30.0, 36.6], 6: [36.55, 43.75], 7: [43.7, 51.45], 8: [51.35, 60.1]};

function render(t) {
  // background drift
  tf(BG.lines, -t * 6, Math.sin(t * .2) * 10);
  BG.dots.forEach(d => tf(d.g, d.x + Math.cos(t * d.sp + d.a) * d.amp - t * 4, d.y + Math.sin(t * d.sp * 1.3 + d.a) * d.amp));
  BG.clouds.forEach(c => tf(c.g, ((c.x0 - t * c.sp) % 2200 + 2200) % 2200 - 140, c.y));

  for (let i = 1; i <= 8; i++) {
    const on = t >= WIN[i][0] && t < WIN[i][1];
    S[i].el.style.display = on ? 'block' : 'none';
    S[i].el.style.transform = ''; S[i].el.style.opacity = 1; S[i].el.style.filter = '';
    if (on) SC[i](t);
  }
  renderFX(t);
}

const SC = {};

SC[1] = t => {
  const s = S[1];
  s.stacks.forEach(st => st.forEach(sh => {
    const k = P(t, sh.d, .4, E.back), wob = P(t, 6.6, .9, E.lin);
    tf(sh.g, sh.x + Math.sin(t * 3 + sh.y) * 4 * wob, lerp(sh.y - 500, sh.y, k), 1, sh.r + Math.sin(t * 9 + sh.x) * 3 * wob, fadeIn(t, sh.d, .1));
  }));
  s.flying.forEach((f, i) => {
    const k = P(t, f.d, .6, E.back);
    tf(f.g, f.x + Math.sin(t * .9 + i) * 30, f.y + Math.cos(t * 1.1 + i * 2) * 26 - 40 * k, k * .9, f.r + t * f.sp, k * .9);
  });
  const mk = pop(t, 2.7);
  tf(s.mag, 470 + Math.sin(t * 1.6) * 60, 470 + Math.cos(t * 2.1) * 40, mk, -10 + Math.sin(t * 2) * 8, mk);
  [[350, 330], [600, 300], [420, 640]].forEach(([x, y], i) => { const k = pop(t, 2.95 + i * .2); tf(s.q[i], x, y + Math.sin(t * 4 + i) * 8, k * (.8 + i * .15), (i - 1) * 14, k); });
  const ck = pop(t, 5.25, .6);
  tf(s.clock, 1500, 420, ck * (1 + .05 * Math.sin(t * 20) * P(t, 5.4, .2)), Math.sin(t * 30) * 4 * P(t, 5.4, .3), ck);
  s.clock.querySelector('.mh').setAttribute('transform', `rotate(${t * 520})`);
  s.clock.querySelector('.hh').setAttribute('transform', `rotate(${t * 43})`);
  // kinetic headline swaps
  const ts = [1.0, 2.9, 5.2], txt = $('s1txt');
  hf(txt, 960, 190);
  ts.forEach((st, i) => {
    const el = $('s1w' + i), ki = P(t, st, .55, E.expo), ko = i < 2 ? P(t, ts[i + 1] - .1, .4, E.in) : 0;
    el.style.transform = `translateY(${(1 - ki) * 130 - ko * 130}px)`; el.style.opacity = t >= st ? 1 : 0;
  });
};

SC[2] = t => {
  const s = S[2];
  const ck = pop(t, 8.2, .6);
  tf(s.cab, 520, 600, ck, 0, ck);
  s.drawers.forEach((d, i) => { const k = P(t, 8.6 + i * .4, .35, E.back); d.setAttribute('transform', `translate(${-k * 70} 0)`); });
  s.papersOut.forEach((p, i) => {
    const st = 8.8 + i * .22, k = P(t, st, 1.1, E.out), lane = i % 3;
    tf(p, 450 - k * (90 + i * 30), 480 + lane * 136 - Math.sin(k * Math.PI) * 160 + k * 120, .7 * fadeIn(t, st, .1), -k * (60 + i * 25), t > st ? 1 : 0);
  });
  const hk = pop(t, 9.3);
  tf(s.hg, 860, 790, hk * .7, P(t, 10.0, .8, E.io) * 180, hk);
  const sand = P(t, 9.3, 3.5, E.lin);
  s.hg.querySelector('.sandTop').setAttribute('transform', `translate(0 ${-80 * 0}) scale(1 ${1 - sand * .6})`);
  const xk = pop(t, 12.0);
  tf(s.x, 690, 370, xk, 0, xk);
  const l1 = $('s2l1'), l2 = $('s2l2');
  hf(l1, 1370, 430, 1, 0, 1); revealRTL(l1, P(t, 8.2, .7, E.io));
  hf(l2, 1370, 560, 1, 0, 1); revealRTL(l2, P(t, 8.6, .8, E.io));
  $('s2bar').style.transform = `scaleX(${P(t, 11.3, .5, E.io)})`;
};

SC[3] = t => {
  const s = S[3];
  // phase A: logo
  const out = P(t, 16.4, .6, E.io);         // logo moves to top
  const lk = pop(t, 13.65, .7);
  const ly = lerp(400, 150, out), ls = lerp(1, .42, out);
  tf(s.logo, 960, ly, lk * ls, lerp(-12, 0, P(t, 13.65, .7)), lk);
  s.px.forEach(p => { const k = +p.dataset.k; p.style.opacity = P(t, 13.9 + k * .03, .1, E.lin); });
  tf(s.ring, 960, ly, (.3 + .7 * P(t, 13.7, .8, E.expo)) * ls, t * 25, (1 - P(t, 15.6, .6)) * fadeIn(t, 13.7, .2));
  const bk = P(t, 13.75, .7, E.expo);
  tf(s.burst, 960, 400, .7 + bk * .5, 15, bk < 1 ? (1 - bk) * 1.5 : 0);
  s.conf.forEach((c, i) => {
    const a = i / 14 * 6.28 + .3, k = P(t, 13.75, 1.2, E.expo), r = 120 + k * (260 + (i % 4) * 70);
    tf(c, 960 + Math.cos(a) * r, 400 + Math.sin(a) * r + k * k * 60, 1, k * 300, k > 0 ? 1 - P(t, 14.6, .5) : 0);
  });
  const title = $('s3title'), sub = $('s3sub');
  hf(title, 960, 680, 1, 0, 1 - out); revealRTL(title, P(t, 14.2, .7, E.io));
  hf(sub, 960, 800, 1, 0, fadeIn(t, 14.9, .4) * (1 - out)); revealRTL(sub, P(t, 14.9, .8, E.io));
  // phase B: paper -> scanner -> tablet (right to left)
  const bIn = P(t, 16.8, .6, E.back);
  s.stack.forEach((g, k) => { const kk = pop(t, 16.9 + k * .05, .4); const left = P(t, 17.4 + (5 - k) * .3, .3, E.in); tf(g, 1540, 800 - k * 30, kk * 1.2, (k % 2 ? 2 : -2), kk * (1 - left)); });
  s.flyP.forEach((g, i) => {
    const st = 17.4 + i * .3, k = P(t, st, .55, E.io);
    tf(g, lerp(1540, 980, k), 650 - Math.sin(k * Math.PI) * 230 + k * 20, .8 * (1 - .4 * k), lerp(-10, 90, k), t > st && k < 1 ? 1 : 0);
  });
  tf(s.scanner, 960, 700, bIn * 1.25, 0, bIn);
  s.beam.setAttribute('transform', `translate(0 ${Math.abs(Math.sin(t * 5)) * 70 * P(t, 17.6, .2)})`);
  s.beam.style.opacity = t > 17.6 && t < 20.4 ? 1 : 0;
  const tk = pop(t, 17.1, .6);
  tf(s.tablet, 400, 640, tk * 1.2, -4 + 4 * tk, tk);
  s.bits.forEach((b, i) => {
    const st = 18.7 + i * .09, k = P(t, st, .55, E.io);
    tf(b, lerp(880, 400, k), 640 - Math.sin(k * Math.PI) * (140 + (i % 5) * 30), 1 - .4 * k, k * 180, t > st && k < 1 ? 1 : 0);
  });
  s.tiles.forEach((g, i) => { const k = pop(t, 19.0 + i * .11, .45); tf(g, 400 + ((i % 4) - 1.5) * 92, 640 + (Math.floor(i / 4) - 1) * 96, k * 1.15, 0, k); });
  const ak = P(t, 17.2, .5, E.out);
  tf(s.arrow, 1330, 560, 1, 0, ak);
  const la = $('s3a'), lb = $('s3b');
  hf(la, 1540, 900, 1, 0, fadeIn(t, 17.1, .4)); hf(lb, 400, 870, 1, 0, fadeIn(t, 19.4, .4));
  // exit: zoom-through into the tablet
  const z = P(t, 20.55, .6, E.inExpo);
  if (z > 0) { const el = S[3].el; el.style.transformOrigin = '400px 640px'; el.style.transform = `scale(${1 + z * 5})`; el.style.opacity = 1 - P(t, 20.85, .3); }
  else S[3].el.style.transformOrigin = '960px 540px';
};

SC[4] = t => {
  const s = S[4], el = S[4].el;
  const zin = P(t, 20.85, .6, E.expo);
  el.style.transform = `scale(${lerp(.55, 1, zin)})`; el.style.opacity = zin;
  const title = $('s4title'); hf(title, 960, 170, 1, 0, 1); revealRTL(title, P(t, 21.2, .6, E.io));
  const starts = [21.5, 25.2, 26.6];
  s.steps.forEach((st, i) => {
    const k = pop(t, starts[i], .7), x = s.X[i];
    tf(st.disc, x, 470, k, lerp(-30, 0, P(t, starts[i], .7)), k);
    tf(st.ring, x, 470, k * (1 + .03 * Math.sin(t * 3 + i)), t * 30 * (i % 2 ? -1 : 1), k);
    const lab = $('s4l' + i); hf(lab, x, 730, 1, 0, fadeIn(t, starts[i] + .2, .3)); revealRTL(lab, P(t, starts[i] + .2, .5, E.io));
    if (st.beam) st.beam.setAttribute('transform', `translate(0 ${-Math.abs(Math.sin(t * 4)) * 70})`);
    st.rows.forEach((r, j) => r.setAttribute('transform', `translate(${(1 - P(t, starts[i] + .3 + j * .15, .35, E.back)) * 40} 0)`));
  });
  s.links.forEach((l, i) => {
    const k = P(t, starts[i + 1] - .5, .5, E.io);
    l.style.clipPath = `inset(0 0 0 ${(1 - k) * 100}%)`;
  });
  s.packets.forEach((p, i) => {
    const ph = ((t - 25.8) * .55 + i * .25) % 1, on = t > 26 + i * .1;
    const x = lerp(1460 - 190, 460 + 190, ph);
    tf(p, x, 470 + Math.sin(ph * 12) * 4, on ? 1 : 0, ph * 360, on ? Math.sin(ph * Math.PI) : 0);
  });
  // exit push
  const ex = P(t, 29.7, .5, E.inExpo);
  if (ex > 0) { el.style.transform = `translateX(${ex * 1400}px)`; el.style.filter = `blur(${ex * 10}px)`; }
};

SC[5] = t => {
  const s = S[5], el = S[5].el;
  const ein = 1 - P(t, 30.0, .6, E.expo);
  el.style.transform = `translateX(${-ein * 1300}px)`;
  const title = $('s5title'); hf(title, 960, 115, 1, 0, 1); revealRTL(title, P(t, 30.4, .6, E.io));
  const lk = P(t, 30.2, .7, E.expo);
  const lx = lerp(820, 760, P(t, 33.4, .6, E.io));
  tf(s.laptop, lx, 600, .82 * (.9 + .1 * lk), 0, lk);
  const q = 'عقد التوريد 2024', n = Math.floor(clamp((t - 30.9) / 1.2) * q.length);
  const qe = $('s5query'); qe.textContent = q.slice(0, n) + (Math.floor(t * 3) % 2 && t < 32.3 ? '|' : '');
  qe.style.transform = `translate(${lx + 0.82 * 280}px, ${600 + .82 * -141}px) translate(-100%,-50%)`; qe.style.opacity = lk;
  const press = 1 - .12 * Math.sin(clamp((t - 32.15) / .25) * Math.PI);
  s.btn.setAttribute('transform', `translate(-281 -141) scale(${press}) translate(281 141)`);
  // cursor travels to button
  const ck = P(t, 31.6, .6, E.io);
  tf(s.cursor, lerp(lx + 200, lx + .82 * -281, ck), lerp(860, 600 + .82 * -141, ck), 1, 0, fadeIn(t, 31.6, .2) * (1 - P(t, 33, .3)));
  s.cards.forEach((c, i) => { const k = pop(t, 32.5 + i * .15, .5); tf(c, lx, 600 + .82 * (-50 + i * 80), .82 * k, 0, k); });
  const hk = pop(t, 33.25, .5); tf(s.hl, lx, 600 + .82 * -50, .82 * (1 + .2 * (1 - hk)), 0, hk);
  const fk = pop(t, 33.4, .5); hf($('s5found'), lx, 975, fk, 0, fk);
  const pk = P(t, 33.4, .6, E.back); tf(s.phone, lerp(2150, 1560, pk), 600, .95, lerp(20, 6, pk), 1);
  const gk = pop(t, 33.6); tf(s.globe, 1760, 360, gk, Math.sin(t * 2) * 10, gk); hf($('s5any1'), 1600, 280, gk, 0, gk);
  const k2 = pop(t, 34.7); tf(s.clock, 1770, 880, k2 * .62, 0, k2); hf($('s5any2'), 1590, 960, k2, 0, k2);
  s.clock.querySelector('.mh').setAttribute('transform', `rotate(${t * 360})`); s.clock.querySelector('.hh').setAttribute('transform', `rotate(${t * 30})`);
};

SC[6] = t => {
  const s = S[6];
  const k = pop(t, 37.15, .8), cx = 960, cy = 520;
  tf(s.disc, cx, cy, k, 0, k);
  tf(s.shield, cx, cy + 6, k * .95, lerp(-20, 0, P(t, 37.15, .8)), k);
  tf(s.ring1, cx, cy, P(t, 37.3, .8, E.expo), t * 20, k);
  tf(s.ring2, cx, cy, P(t, 37.4, .8, E.expo), -t * 45, k);
  const lock = P(t, 38.0, .3, E.back);
  s.shackle.setAttribute('transform', `translate(0 ${lerp(-26, 0, lock)})`);
  s.orbits.forEach((o, i) => { const a = t * .7 + i * 2.094, ok = pop(t, 37.6 + i * .2); tf(o, cx + Math.cos(a) * 290, cy + Math.sin(a) * 290, ok, 0, ok); });
  const chk = pop(t, 41.4); tf(s.check, cx + 120, cy + 150, chk, 0, chk);
  [[1430, 330, 37.5], [500, 540, 39.0], [1440, 760, 40.9]].forEach(([x, y, st], i) => {
    const ck = pop(t, st, .55);
    hf($('s6c' + i), x, y + Math.sin(t * 2 + i) * 6, ck, 0, ck);
    s.links[i].style.opacity = P(t, st - .2, .4, E.lin);
  });
};

SC[7] = t => {
  const s = S[7];
  const title = $('s7title'); hf(title, 960, 150, 1, 0, 1); revealRTL(title, P(t, 44.3, .9, E.io));
  const up = P(t, 47.7, .7, E.io);
  [44.8, 45.3, 45.8].forEach((st, i) => {
    const k = pop(t, st, .6), x = s.X[i], y = 560 - up * 50;
    tf(s.cards[i], x, y + (1 - k) * 80, k, 0, k);
    tf(s.icons[i], x, y - 120, pop(t, st + .15), 0, k);
    hf($('s7n' + i), x, y + 20, k, 0, k);
    hf($('s7l' + i), x, y + 130, k, 0, k);
  });
  const c1 = P(t, 45.0, 1.4, E.out); $('s7v0').textContent = Math.round(c1 * 100) + '%';
  const c3 = P(t, 45.8, 1.6, E.out); $('s7v2').textContent = String(Math.round((1 - c3) * 1000));
  $('s7n0').style.color = C.teal; $('s7n1').style.color = C.blue; $('s7n2').style.color = C.red;
  // paper plane flight
  const pk = P(t, 47.7, 2.2, E.io);
  const px = lerp(1900, 120, pk), py = 900 - Math.sin(pk * Math.PI) * 120 + pk * 40;
  tf(s.plane, px, py, 1, -10 + Math.cos(pk * Math.PI) * 18, t > 47.7 && pk < 1 ? 1 : 0);
  if (t > 47.7) { let d = ''; for (let j = 0; j <= 40; j++) { const kk = pk * j / 40, x = lerp(1900, 120, kk), y = 900 - Math.sin(kk * Math.PI) * 120 + kk * 40; d += (j ? 'L' : 'M') + (x + 60).toFixed(0) + ' ' + (y + 10).toFixed(0); } s.trail.setAttribute('d', d); }
  else s.trail.setAttribute('d', '');
  const f = $('s7f'); hf(f, 960, 960, 1, 0, fadeIn(t, 48.2, .3)); revealRTL(f, P(t, 48.2, .8, E.io));
};

SC[8] = t => {
  const s = S[8];
  const lk = pop(t, 51.8, .8);
  tf(s.logo, 960, 330, lk * .9, lerp(-15, 0, P(t, 51.8, .8)), lk);
  const bk = P(t, 51.85, .8, E.expo); tf(s.burst, 960, 330, .8 + bk * .4, 0, bk < 1 ? (1 - bk) * 1.6 : 0);
  const ti = $('s8title'); hf(ti, 960, 585, 1, 0, 1); revealRTL(ti, P(t, 52.3, .8, E.io));
  ti.style.letterSpacing = lerp(30, 0, P(t, 52.3, 1.2, E.expo)) + 'px';
  const tag = 'خطوتك الأولى نحو المستقبل', n = Math.floor(clamp((t - 53.5) / .9) * tag.length);
  const te = $('s8tag'); te.textContent = tag.slice(0, n); hf(te, 960, 705, 1, 0, 1);
  const ck = fadeIn(t, 55.0, .4); hf($('s8contact'), 960, 800, 1, 0, ck); revealRTL($('s8contact'), P(t, 55.0, .7, E.io));
  s.soc.forEach((g, i) => { const k = pop(t, 55.6 + i * .14, .5); tf(g, 960 + (i - 2) * 96, 905, k, 0, k); });
  s.dots.forEach((d, i) => { const a = i * .63 + t * .15, r = 470 + (i % 3) * 80, k = pop(t, 52 + i * .08); tf(d, 960 + Math.cos(a) * r * 1.5, 520 + Math.sin(a) * r * .9, k, t * 40, k * .9); });
};

function ringPath(R, r) { // annulus centred on stage
  const c = (rad) => `M${960 - rad} 540 a${rad} ${rad} 0 1 0 ${2 * rad} 0 a${rad} ${rad} 0 1 0 ${-2 * rad} 0 Z`;
  return R <= 0 ? '' : c(R) + ' ' + (r > 0 ? c(Math.min(r, R)) : '');
}

function renderFX(t) {
  // intro: three panels sweep right->left
  FX.panels.forEach((p, i) => { const k = P(t, .0 + i * .12, .9, E.ioExpo); tf(p, lerp(0, -2000, k) + (i ? 0 : 0), 0, 1, 0, t < 1.3 ? 1 : 0); });
  FX.panels.forEach((p, i) => p.style.display = t < 1.3 ? '' : 'none');
  // S1->S2 diagonal wipes
  FX.diag.forEach((p, i) => { const k = P(t, 7.1 + i * .1, .95, E.ioExpo); tf(p, lerp(3200, -1300, k), 540, 1, 28, k > 0 && k < 1 ? 1 : 0); });
  // S2->S3 plum iris ring (grow) then hole opens
  const ig = P(t, 12.7, .5, E.io), ih = P(t, 13.25, .6, E.io);
  tf(FX.iris, 960, 540, ig * 1150, 0, ig > 0 && ih < 1 ? 1 : 0);
  tf(FX.irisHole, 960, 540, ih * 1150, 0, 0); // hole drawn via ringPath instead
  FX.ringPath.setAttribute('d', '');
  if (ig > 0 && t < 13.8) { FX.iris.style.opacity = 0; FX.ringPath.setAttribute('d', ringPath(ig * 1150, ih * 1160)); }
  // S4->S5 navy/yellow push
  const pk = P(t, 29.65, .8, E.ioExpo); tf(FX.push, lerp(0, 3300, pk), 0, 1, 0, pk > 0 && pk < 1 ? 1 : 0);
  // S5->S6 red circle from found card
  const cg = P(t, 35.95, .55, E.inExpo), ch = P(t, 36.5, .6, E.expo), cx = lerp(760, 960, ch), cy = lerp(580, 540, ch);
  tf(FX.circ, cx, cy, cg * 1300, 0, cg > 0 && ch < 1 ? 1 : 0);
  tf(FX.circHole, cx, cy, ch * 1320, 0, cg > 0 && ch < 1 ? 1 : 0);
  // S6->S7 vertical stripes drop then lift
  FX.stripes.forEach((p, i) => { const a = P(t, 43.15 + i * .06, .45, E.inExpo), b = P(t, 43.75 + i * .06, .5, E.expo); tf(p, 0, lerp(-1100, 0, a) + lerp(0, 1100, b), 1, 0, a > 0 && b < 1 ? 1 : 0); });
  // S7->S8 plum ring closes to a point, then bursts open
  const rc = P(t, 50.75, .6, E.io), ro = P(t, 51.45, .7, E.io);
  if (rc > 0 && ro < 1) {
    const inner = rc < 1 ? lerp(1200, 0, rc) : lerp(0, 1250, ro);
    const outer = rc < 1 ? 1300 : 1300;
    FX.ringPath.setAttribute('d', ringPath(outer, inner));
  }
}

// ---------- boot ----------
window.__ready = (async () => { await document.fonts.ready; await Promise.all([...document.fonts].map(f => f.load().catch(() => 0))); build(); render(0); return true; })();
window.render = render; window.CUES = CUES; window.DURATION = DURATION; window.FPS = FPS;
if (new URLSearchParams(location.search).has('play')) window.__ready.then(() => { const t0 = performance.now(); const loop = () => { render(((performance.now() - t0) / 1000) % DURATION); requestAnimationFrame(loop); }; loop(); });
