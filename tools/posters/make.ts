// Paints the town's posters into one atlas, 4 across and 3 down, as a layer of the texture
// array: the walls of a Kerala town around 2005. Che in Fitzpatrick's red and black, the party's
// hammer, sickle and star, a conference notice, and film posters of heroes with big moustaches
// and dark glasses (made-up films, drawn here, not photographs). Pasted, faded and torn.
//
//   npx tsx tools/posters/make.ts
import { createCanvas, GlobalFonts, loadImage, type SKRSContext2D } from '@napi-rs/canvas';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const A = new URL('./assets/', import.meta.url).pathname;
const OUT = new URL('../../public/tex/', import.meta.url).pathname;
GlobalFonts.registerFromPath(A + 'NotoSansMalayalam.ttf', 'Mal');
GlobalFonts.registerFromPath(A + 'Anton.ttf', 'Anton');
GlobalFonts.registerFromPath(A + 'Oswald.ttf', 'Oswald');

export const COLS = 4;
export const ROWS = 3;
const S = 1024;
const W = S / COLS;
const H = Math.floor(S / ROWS);

let seed = 7;
const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

const canvas = createCanvas(S, S);
const g = canvas.getContext('2d');
const che = await loadImage(A + 'che.png');
const star = await loadImage(A + 'hs.png');

/** The emblem tinted one colour: the art's own shape, any colour. */
const tinted = (img: Awaited<ReturnType<typeof loadImage>>, colour: string) => {
  const c = createCanvas(img.width, img.height);
  const x = c.getContext('2d');
  x.drawImage(img, 0, 0);
  x.globalCompositeOperation = 'source-in';
  x.fillStyle = colour;
  x.fillRect(0, 0, img.width, img.height);
  return c;
};

const centred = (x: SKRSContext2D, text: string, cx: number, y: number, font: string, fill: string, max = W - 16) => {
  x.font = font;
  x.textAlign = 'center';
  x.textBaseline = 'alphabetic';
  if (font.includes('bold') && parseInt(font.replace('bold ', '')) >= 36) {
    x.lineWidth = 5;
    x.strokeStyle = 'rgba(0,0,0,0.8)';
    x.lineJoin = 'round';
    x.strokeText(text, cx, y, max);
  }
  x.fillStyle = fill;
  x.fillText(text, cx, y, max);
};

/** Lines of small print, as a film poster's credits or a notice's details. */
const smallPrint = (x: SKRSContext2D, y0: number, rows: number, colour: string) => {
  x.fillStyle = colour;
  for (let i = 0; i < rows; i++) {
    const w = W * (0.5 + r() * 0.35);
    for (let k = 0; k < 6 + r() * 5; k++) {
      const wx = W / 2 - w / 2 + (k / 9) * w;
      x.fillRect(wx, y0 + i * 9, 4 + r() * 14, 4);
    }
  }
};

/**
 * A hero against the light, the way the posters cut them out: a black figure with a rim of
 * colour down one side, a thick moustache and dark glasses catching the glare.
 */
const hero = (x: SKRSContext2D, cx: number, cy: number, s: number, light: string, _shade: string, glasses: boolean) => {
  const figure = () => {
    x.beginPath();
    // Shoulders, neck, head, a full head of hair swept up
    x.moveTo(cx - 100 * s, cy + 175 * s);
    x.bezierCurveTo(cx - 95 * s, cy + 95 * s, cx - 50 * s, cy + 80 * s, cx - 20 * s, cy + 66 * s);
    x.lineTo(cx - 20 * s, cy + 44 * s);
    x.bezierCurveTo(cx - 40 * s, cy + 30 * s, cx - 44 * s, cy + 6 * s, cx - 42 * s, cy - 14 * s);
    x.bezierCurveTo(cx - 52 * s, cy - 50 * s, cx - 30 * s, cy - 74 * s, cx + 2 * s, cy - 72 * s);
    x.bezierCurveTo(cx + 36 * s, cy - 76 * s, cx + 54 * s, cy - 48 * s, cx + 42 * s, cy - 12 * s);
    x.bezierCurveTo(cx + 44 * s, cy + 8 * s, cx + 38 * s, cy + 30 * s, cx + 20 * s, cy + 44 * s);
    x.lineTo(cx + 20 * s, cy + 66 * s);
    x.bezierCurveTo(cx + 50 * s, cy + 80 * s, cx + 95 * s, cy + 95 * s, cx + 100 * s, cy + 175 * s);
    x.closePath();
  };
  // The rim: the figure in the light's colour, nudged toward it, then the black over it
  x.save();
  x.shadowColor = light;
  x.shadowBlur = 18 * s;
  x.fillStyle = light;
  x.translate(-4 * s, -2 * s);
  figure();
  x.fill();
  x.restore();
  x.fillStyle = '#060404';
  figure();
  x.fill();
  // A face just made out in the dark: cheekbone and jaw catching the light
  const face = x.createLinearGradient(cx - 44 * s, 0, cx + 10 * s, 0);
  face.addColorStop(0, light);
  face.addColorStop(1, 'rgba(0,0,0,0)');
  x.globalAlpha = 0.45;
  x.fillStyle = face;
  x.beginPath();
  x.ellipse(cx - 8 * s, cy + 4 * s, 34 * s, 40 * s, 0, 0, Math.PI * 2);
  x.fill();
  x.globalAlpha = 1;
  // The moustache, thick and turned down at the ends
  x.fillStyle = '#000';
  x.beginPath();
  x.moveTo(cx - 24 * s, cy + 28 * s);
  x.quadraticCurveTo(cx - 12 * s, cy + 14 * s, cx, cy + 18 * s);
  x.quadraticCurveTo(cx + 12 * s, cy + 14 * s, cx + 24 * s, cy + 28 * s);
  x.quadraticCurveTo(cx, cy + 22 * s, cx - 24 * s, cy + 28 * s);
  x.fill();
  if (glasses) {
    x.fillStyle = '#000';
    x.beginPath();
    x.roundRect(cx - 32 * s, cy - 10 * s, 28 * s, 14 * s, 5 * s);
    x.roundRect(cx + 4 * s, cy - 10 * s, 28 * s, 14 * s, 5 * s);
    x.fill();
    x.fillStyle = light;
    x.fillRect(cx - 28 * s, cy - 7 * s, 10 * s, 2.5 * s);
    x.fillRect(cx + 8 * s, cy - 7 * s, 10 * s, 2.5 * s);
  } else {
    // Eyes as two glints under a heavy brow
    x.fillStyle = light;
    x.fillRect(cx - 24 * s, cy - 4 * s, 9 * s, 2.5 * s);
    x.fillRect(cx + 12 * s, cy - 4 * s, 9 * s, 2.5 * s);
  }
};

/** A heroine in profile at the side, hair long, a jasmine string in it. */
const heroine = (x: SKRSContext2D, cx: number, cy: number, s: number, light: string) => {
  x.fillStyle = '#0a0606';
  x.beginPath();
  x.ellipse(cx + 8 * s, cy + 30 * s, 34 * s, 70 * s, 0, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = light;
  x.beginPath();
  x.ellipse(cx - 6 * s, cy, 26 * s, 34 * s, 0, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = '#f4efe0';
  for (let i = 0; i < 6; i++) {
    x.beginPath();
    x.arc(cx + 24 * s, cy - 10 * s + i * 9 * s, 3.5 * s, 0, Math.PI * 2);
    x.fill();
  }
  x.fillStyle = '#b01818';
  x.beginPath();
  x.arc(cx - 6 * s, cy - 14 * s, 2.5 * s, 0, Math.PI * 2);
  x.fill();
};

const flare = (x: SKRSContext2D, cx: number, cy: number, rad: number, colour: string) => {
  const f = x.createRadialGradient(cx, cy, 0, cx, cy, rad);
  f.addColorStop(0, colour);
  f.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = f;
  x.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
};

type Poster = (x: SKRSContext2D) => void;
const fill = (x: SKRSContext2D, c: string) => {
  x.fillStyle = c;
  x.fillRect(0, 0, W, H);
};

const POSTERS: Poster[] = [
  // Che, red and black, the way he's painted on every bus shelter
  (x) => {
    fill(x, '#c81810');
    x.drawImage(che, 18, 22, W - 36, (W - 36) * (che.height / che.width));
    centred(x, 'ചെ', W / 2, H - 14, 'bold 34px Mal', '#100c0a');
  },
  // Che again, black on yellow, with the year
  (x) => {
    fill(x, '#e8b818');
    x.drawImage(tinted(che, '#1a0c08'), 30, 40, W - 60, (W - 60) * (che.height / che.width));
    centred(x, 'ഹസ്താ ലാ വിക്ടോറിയ', W / 2, 30, 'bold 18px Mal', '#a01008', W - 40);
    centred(x, '1928 – 1967', W / 2, H - 14, '22px Oswald', '#1a0c08');
  },
  // The party: white hammer, sickle and star on red, the old slogan
  (x) => {
    fill(x, '#cc1a12');
    const e = tinted(star, '#f6f0e4');
    x.drawImage(e, W / 2 - 80, 34, 160, 160 * (star.height / star.width));
    centred(x, 'ഇൻക്വിലാബ്', W / 2, 258, 'bold 36px Mal', '#f6f0e4');
    centred(x, 'സിന്ദാബാദ്', W / 2, 300, 'bold 36px Mal', '#f6f0e4');
  },
  // A conference notice: red band, the emblem small, the date and the speakers
  (x) => {
    fill(x, '#f2ead6');
    x.fillStyle = '#c41810';
    x.fillRect(0, 0, W, 92);
    x.drawImage(tinted(star, '#f2ead6'), 14, 10, 52, 52 * (star.height / star.width));
    centred(x, 'ഏരിയ സമ്മേളനം', W / 2 + 26, 56, 'bold 26px Mal', '#f2ead6', W - 80);
    centred(x, '2005', W / 2, 150, '54px Anton', '#c41810');
    centred(x, 'മെയ് 14, 15', W / 2, 190, 'bold 24px Mal', '#201410');
    centred(x, 'പൊതുസമ്മേളനം', W / 2, 232, 'bold 22px Mal', '#c41810');
    smallPrint(x, 252, 8, '#3a2a20');
  },
  // Films: a hero in dark glasses over fire, the title in red and gold
  (x) => {
    const bg = x.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#140806');
    bg.addColorStop(0.6, '#8a1a08');
    bg.addColorStop(1, '#f0a020');
    x.fillStyle = bg;
    x.fillRect(0, 0, W, H);
    flare(x, 200, 70, 70, 'rgba(255,220,140,0.8)');
    hero(x, W / 2, 120, 1.25, '#e0a070', '#5a2a14', true);
    centred(x, 'കനൽക്കാറ്റ്', W / 2, 282, 'bold 40px Mal', '#ffd040');
    smallPrint(x, 300, 4, '#ffe0b0');
  },
  // A family film: hero, heroine, soft blue and gold
  (x) => {
    const bg = x.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#0c2a4a');
    bg.addColorStop(1, '#3a7a9a');
    x.fillStyle = bg;
    x.fillRect(0, 0, W, H);
    flare(x, 60, 60, 90, 'rgba(255,240,200,0.5)');
    heroine(x, 70, 130, 1.1, '#e8b888');
    hero(x, 160, 110, 1.05, '#e8b080', '#6a3a20', false);
    centred(x, 'ചന്ദനക്കുറി', W / 2, 272, 'bold 38px Mal', '#ffe070');
    centred(x, 'ഒരു കുടുംബ ചിത്രം', W / 2, 302, '18px Mal', '#e8f0f8');
    smallPrint(x, 314, 3, '#c8d8e8');
  },
  // An action film: the hero shouting through green, the title in white with a black edge
  (x) => {
    fill(x, '#0a140a');
    const bg = x.createRadialGradient(W / 2, 120, 10, W / 2, 120, 200);
    bg.addColorStop(0, '#3a8a2a');
    bg.addColorStop(1, '#081008');
    x.fillStyle = bg;
    x.fillRect(0, 0, W, H);
    hero(x, W / 2, 130, 1.35, '#d09060', '#3a2010', false);
    x.lineWidth = 6;
    x.strokeStyle = '#000';
    x.font = 'bold 44px Mal';
    x.textAlign = 'center';
    x.strokeText('ഒറ്റയാൻ', W / 2, 296);
    centred(x, 'ഒറ്റയാൻ', W / 2, 296, 'bold 44px Mal', '#f8f8f0');
    smallPrint(x, 312, 3, '#a8c8a0');
  },
  // A comedy: three faces in a row on yellow, red title
  (x) => {
    fill(x, '#f4d020');
    for (const [i, cx] of [70, 128, 190].entries()) hero(x, cx, 120 + (i % 2) * 16, 0.62, '#e0a070', '#8a5030', i === 1);
    centred(x, 'പഞ്ചവാദ്യം', W / 2, 262, 'bold 40px Mal', '#c81010');
    centred(x, 'ഇന്നു മുതൽ', W / 2, 296, 'bold 22px Mal', '#1a1008');
    smallPrint(x, 310, 3, '#4a3010');
  },
  // A thriller: a face half in shadow, a knife of light, the title cold blue
  (x) => {
    fill(x, '#04060c');
    flare(x, 60, 140, 140, 'rgba(60,90,160,0.6)');
    hero(x, 120, 130, 1.4, '#7088b0', '#04060c', false);
    x.fillStyle = 'rgba(200,220,255,0.85)';
    x.fillRect(0, 128, W, 3);
    centred(x, 'നിഴൽ', W / 2, 290, 'bold 52px Mal', '#a8c8ff');
    smallPrint(x, 306, 4, '#5a6a8a');
  },
  // An entrance-coaching ad, the kind on every lamp post
  (x) => {
    fill(x, '#f8f8f4');
    x.fillStyle = '#1838a8';
    x.fillRect(0, 0, W, 70);
    centred(x, 'ENTRANCE', W / 2, 52, '44px Anton', '#ffffff');
    centred(x, 'COACHING', W / 2, 112, '40px Anton', '#c81818');
    centred(x, 'MEDICAL · ENGINEERING', W / 2, 146, '18px Oswald', '#1838a8');
    centred(x, 'പുതിയ ബാച്ച്', W / 2, 192, 'bold 28px Mal', '#1a1a1a');
    x.fillStyle = '#e8c018';
    x.fillRect(16, 214, W - 32, 46);
    centred(x, '98470 •••••', W / 2, 248, '28px Oswald', '#1a1a1a');
    smallPrint(x, 280, 5, '#555');
  },
  // A red flag, waving, a sliver of the party's colour for the far walls
  (x) => {
    fill(x, '#2a0806');
    x.fillStyle = '#d01a10';
    x.beginPath();
    x.moveTo(30, 40);
    for (let i = 0; i <= 20; i++) x.lineTo(30 + i * 10, 40 + Math.sin(i * 0.5) * 12);
    for (let i = 20; i >= 0; i--) x.lineTo(30 + i * 10, 200 + Math.sin(i * 0.5 + 0.6) * 12);
    x.fill();
    x.fillStyle = '#c8b090';
    x.fillRect(22, 30, 8, H - 40);
    x.drawImage(tinted(star, '#f6f0e4'), 80, 70, 100, 100 * (star.height / star.width));
    centred(x, 'സി.പി.ഐ (എം)', W / 2, 290, 'bold 30px Mal', '#f6f0e4');
  },
  // A lottery ad: Kerala's own, the first prize in lakhs
  (x) => {
    fill(x, '#118a3a');
    x.fillStyle = '#f8e020';
    x.beginPath();
    x.arc(W / 2, 120, 84, 0, Math.PI * 2);
    x.fill();
    centred(x, 'ഒന്നാം സമ്മാനം', W / 2, 100, 'bold 18px Mal', '#118a3a', 140);
    centred(x, '25 ലക്ഷം', W / 2, 148, 'bold 30px Mal', '#c81010', 150);
    centred(x, 'KERALA LOTTERY', W / 2, 252, '28px Anton', '#f8f8f0');
    centred(x, 'ഭാഗ്യക്കുറി', W / 2, 292, 'bold 26px Mal', '#f8e020');
  },
];

// Each poster in its cell, then the weather: sun-fading, rain streaks, glue blotches, tears
for (const [i, poster] of POSTERS.entries()) {
  const cx = (i % COLS) * W;
  const cy = Math.floor(i / COLS) * H;
  g.save();
  g.translate(cx, cy);
  g.beginPath();
  g.rect(0, 0, W, H);
  g.clip();
  poster(g);
  // Faded by sun, more at the top
  const fade = g.createLinearGradient(0, 0, 0, H);
  fade.addColorStop(0, `rgba(240,230,210,${0.12 + r() * 0.1})`);
  fade.addColorStop(1, 'rgba(240,230,210,0.02)');
  g.fillStyle = fade;
  g.fillRect(0, 0, W, H);
  // Rain streaks running down
  for (let k = 0; k < 26; k++) {
    g.fillStyle = `rgba(40,30,20,${0.04 + r() * 0.06})`;
    g.fillRect(r() * W, r() * H * 0.4, 1 + r() * 2, 40 + r() * 160);
  }
  // Glue blotches where the paste soaked through
  for (let k = 0; k < 5; k++) {
    g.fillStyle = `rgba(90,70,30,${0.05 + r() * 0.06})`;
    g.beginPath();
    g.ellipse(r() * W, r() * H, 10 + r() * 30, 6 + r() * 20, r() * 3, 0, Math.PI * 2);
    g.fill();
  }
  // A torn corner or two, showing the grey wall paper beneath
  for (let k = 0; k < 2; k++) {
    if (r() < 0.4) continue;
    const corner = Math.floor(r() * 4);
    const ox = corner % 2 ? W : 0;
    const oy = corner > 1 ? H : 0;
    g.fillStyle = '#8a8478';
    g.beginPath();
    g.moveTo(ox, oy);
    const a = 20 + r() * 50;
    const b = 20 + r() * 60;
    g.lineTo(ox + (corner % 2 ? -a : a), oy);
    for (let j = 0; j < 5; j++) g.lineTo(ox + (corner % 2 ? -1 : 1) * a * (1 - j / 5) * (0.6 + r() * 0.5), oy + (corner > 1 ? -1 : 1) * b * (j / 5));
    g.lineTo(ox, oy + (corner > 1 ? -b : b));
    g.fill();
  }
  g.restore();
}

// Out as the texture array wants it: colour at 1024 and 512, and flat data (paper: no relief,
// fairly rough, a little glossier where the paste is)
const raw = '/tmp/posters_raw.rgba';
writeFileSync(raw, canvas.data());
const ff = (args: string[]) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args]);
for (const size of [1024, 512]) {
  const scale = size === S ? [] : ['-vf', `scale=${size}:${size}:flags=lanczos`];
  ff(['-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${S}x${S}`, '-i', raw, ...scale, '-c:v', 'libwebp', '-quality', '88', '-pix_fmt', 'yuva420p', `${OUT}posters_${size}_c.webp`]);
}
ff(['-f', 'lavfi', '-i', 'color=c=0x8080b0:s=512x512', '-frames:v', '1', '-pix_fmt', 'yuvj444p', '-q:v', '4', `${OUT}posters_512_d.jpg`]);
ff(['-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${S}x${S}`, '-i', raw, '-frames:v', '1', '/tmp/posters_atlas.png']);
console.log('posters', POSTERS.length);
