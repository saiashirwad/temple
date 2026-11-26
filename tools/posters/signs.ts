// Paints the forest path's signs into one atlas, 4 by 4, as a layer of the texture array: the
// Forest Department's board at the foot of the path, the distance stones every hundred metres,
// a warning about wild animals, and the bungalow's nameboard.
//
//   npx tsx tools/posters/signs.ts
import { createCanvas, GlobalFonts, type SKRSContext2D } from '@napi-rs/canvas';
import { execFileSync } from 'node:child_process';
import { writeColourTiers } from '../tex/write-maps.ts';

const A = new URL('./assets/', import.meta.url).pathname;
const OUT = new URL('../../public/tex/', import.meta.url).pathname;

GlobalFonts.registerFromPath(A + 'NotoSansMalayalam.ttf', 'Mal');

GlobalFonts.registerFromPath(A + 'Anton.ttf', 'Anton');

GlobalFonts.registerFromPath(A + 'Oswald.ttf', 'Oswald');

const S = 1024;
const N = 4;
const C = S / N;
const canvas = createCanvas(S, S);
const g = canvas.getContext('2d');

let seed = 11;
const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

const text = (x: SKRSContext2D, t: string, y: number, font: string, fill: string, max = C - 20) => {
  x.font = font;
  x.textAlign = 'center';
  x.fillStyle = fill;
  x.fillText(t, C / 2, y, max);
};

/** Weathered paint: grime, streaks and flecks of it gone. */
const weather = (x: SKRSContext2D, k: number) => {
  for (let i = 0; i < 18; i++) {
    x.fillStyle = `rgba(30,24,16,${0.05 + r() * 0.08 * k})`;
    x.fillRect(r() * C, r() * C * 0.3, 1 + r() * 2, 30 + r() * 120);
  }

  for (let i = 0; i < 40 * k; i++) {
    x.fillStyle = `rgba(60,50,40,${0.2 + r() * 0.4})`;
    x.beginPath();
    x.arc(r() * C, r() * C, 0.5 + r() * 2.5, 0, Math.PI * 2);
    x.fill();
  }

  const moss = x.createLinearGradient(0, C, 0, C * 0.6);
  moss.addColorStop(0, `rgba(40,60,20,${0.35 * k})`);
  moss.addColorStop(1, 'rgba(40,60,20,0)');
  x.fillStyle = moss;
  x.fillRect(0, 0, C, C);
};

const SIGNS: ((x: SKRSContext2D) => void)[] = [
  // 0: the Forest Department's board at the foot of the path
  (x) => {
    x.fillStyle = '#1f5a32';
    x.fillRect(0, 0, C, C);
    x.strokeStyle = '#f0e8c8';
    x.lineWidth = 5;
    x.strokeRect(9, 9, C - 18, C - 18);
    text(x, 'കേരള വനം വകുപ്പ്', 52, 'bold 26px Mal', '#f0e8c8');
    text(x, 'KERALA FOREST DEPARTMENT', 78, '17px Oswald', '#f0e8c8');
    x.fillStyle = '#f0e8c8';
    x.fillRect(30, 92, C - 60, 2);
    text(x, 'വന വിശ്രമ മന്ദിരം', 132, 'bold 24px Mal', '#f8e070');
    text(x, 'FOREST BUNGALOW', 162, '28px Anton', '#ffffff');
    text(x, '1 km', 214, '46px Anton', '#f8e070');
    weather(x, 0.6);
  },
  // 1-9: distance stones, 900 m down to 100 m left, black on white with a yellow top
  ...[900, 800, 700, 600, 500, 400, 300, 200, 100].map((m) => (x: SKRSContext2D) => {
    x.fillStyle = '#e8e2d4';
    x.fillRect(0, 0, C, C);
    x.fillStyle = '#e0b020';
    x.fillRect(0, 0, C, 70);
    text(x, 'F.B.', 52, '40px Anton', '#1a1a1a');
    text(x, `${m}`, 160, '84px Anton', '#1a1a1a');
    text(x, 'മീ.', 214, 'bold 30px Mal', '#1a1a1a');
    weather(x, 1);
  }),
  // 10: the bungalow's nameboard, white letters on black
  (x) => {
    x.fillStyle = '#141210';
    x.fillRect(0, 0, C, C);
    text(x, 'FOREST', 70, '52px Anton', '#e8e0c8');
    text(x, 'INSPECTION', 128, '44px Anton', '#e8e0c8');
    text(x, 'BUNGALOW', 186, '48px Anton', '#e8e0c8');
    text(x, 'വനം വകുപ്പ് · 1912', 232, 'bold 20px Mal', '#c8b070');
    weather(x, 0.4);
  },
  // 11: a warning about wild animals, red on white
  (x) => {
    x.fillStyle = '#efe9da';
    x.fillRect(0, 0, C, C);
    x.strokeStyle = '#b81810';
    x.lineWidth = 10;
    x.strokeRect(10, 10, C - 20, C - 20);
    text(x, 'വന്യമൃഗങ്ങൾ', 76, 'bold 34px Mal', '#b81810');
    text(x, 'ഉള്ള പ്രദേശം', 122, 'bold 30px Mal', '#b81810');
    text(x, 'BEWARE OF', 172, '30px Anton', '#1a1a1a');
    text(x, 'WILD ANIMALS', 212, '30px Anton', '#1a1a1a');
    weather(x, 0.9);
  },
  // 12: a serpent stone, a cobra rearing with its hood spread, carved in low relief and worn
  (x) => {
    const stone = x.createLinearGradient(0, 0, C, C);
    stone.addColorStop(0, '#77736a');
    stone.addColorStop(1, '#5a564e');
    x.fillStyle = stone;
    x.fillRect(0, 0, C, C);

    for (let i = 0; i < 900; i++) {
      x.fillStyle = `rgba(${r() < 0.5 ? '30,28,24' : '200,195,180'},${0.05 + r() * 0.1})`;
      x.fillRect(r() * C, r() * C, 1 + r() * 2, 1 + r() * 2);
    }

    // Relief: draw the shape lit from the top left, a shadow under it to the bottom right
    const cobra = (dx: number, dy: number, fill: string) => {
      x.save();
      x.translate(dx, dy);
      x.fillStyle = fill;
      x.beginPath();
      // The hood, a broad rounded fan
      x.ellipse(C / 2, 78, 52, 62, 0, 0, Math.PI * 2);
      x.fill();
      // The body coiling below in loops
      x.lineWidth = 26;
      x.strokeStyle = fill;
      x.lineCap = 'round';
      x.beginPath();
      x.moveTo(C / 2, 130);
      x.bezierCurveTo(C / 2 + 60, 160, C / 2 + 50, 200, C / 2, 200);
      x.bezierCurveTo(C / 2 - 60, 200, C / 2 - 70, 236, C / 2, 240);
      x.bezierCurveTo(C / 2 + 50, 244, C / 2 + 70, 230, C / 2 + 80, 220);
      x.stroke();
      x.restore();
    };

    cobra(5, 6, 'rgba(20,18,14,0.55)');
    cobra(-3, -3, 'rgba(210,205,190,0.35)');
    cobra(0, 0, '#6e6a60');
    // The hood's spectacle mark, cut in, and the head on top
    x.strokeStyle = 'rgba(25,22,18,0.55)';
    x.lineWidth = 3;

    for (const u of [-1, 1]) {
      x.beginPath();
      x.arc(C / 2 + u * 13, 88, 10, 0, Math.PI * 2);
      x.stroke();
    }

    x.fillStyle = '#6e6a60';
    x.beginPath();
    x.ellipse(C / 2, 26, 16, 12, 0, 0, Math.PI * 2);
    x.fill();
    // Turmeric smeared across the hood
    x.fillStyle = 'rgba(210,150,20,0.6)';
    x.beginPath();
    x.ellipse(C / 2 + 8, 110, 22, 9, 0.4, 0, Math.PI * 2);
    x.fill();
    weather(x, 1.4);
  },
];

for (const [i, sign] of SIGNS.entries()) {
  g.save();
  g.translate((i % N) * C, Math.floor(i / N) * C);
  g.beginPath();
  g.rect(0, 0, C, C);
  g.clip();
  sign(g);
  g.restore();
}

await writeColourTiers('signs', S, canvas.data(), 88);

execFileSync('ffmpeg', [
  '-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=0x8080a0:s=512x512',
  '-frames:v', '1', '-pix_fmt', 'yuvj444p', '-q:v', '4', `${OUT}signs_512_d.jpg`,
]);

console.log('signs', SIGNS.length);
