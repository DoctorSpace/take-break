import UPNG from 'upng-js';
import {fromByteArray, toByteArray} from 'base64-js';
import {validColor} from './settings';
export function hsv(h: number, s: number, v: number): [number, number, number] {
  h = ((h % 360 + 360) % 360) / 60; s = Math.min(1, Math.max(0, s)); v = Math.min(1, Math.max(0, v));
  const c = v * s, x = c * (1 - Math.abs(h % 2 - 1)), m = v - c;
  const parts = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][Math.floor(h)];
  return parts.map(n => Math.round((n + m) * 255)) as [number, number, number];
}
export const toHex = (rgb: readonly number[]) => '#' + rgb.map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
export function toHSV(hex: string): [number, number, number] {
  if (!validColor(hex)) return [0, 0, 0];
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  const h = !d ? 0 : max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, max ? d / max : 0, max];
}
export function foreground(hex: string): string {
  const channels = [1, 3, 5].map(i => {const v = parseInt(hex.slice(i, i + 2), 16) / 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;});
  return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722 > .179 ? '#202020' : '#F2F2F2';
}
export function pngURI(data: Uint8Array, width: number, height: number): string {return 'data:image/png;base64,' + fromByteArray(new Uint8Array(UPNG.encode([data.buffer as ArrayBuffer], width, height, 0)));}
export function colorPlane(hue: number, width = 304, height = 177): string {
  const pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {pixels.set([...hsv(hue, x / (width - 1), 1 - y / (height - 1)), 255], (y * width + x) * 4);}
  return pngURI(pixels, width, height);
}
export function hueTrack(width = 304): string {const pixels = new Uint8Array(width * 4); for (let x = 0; x < width; x++) pixels.set([...hsv(x / (width - 1) * 360, 1, 1), 255], x * 4); return pngURI(pixels, width, 1);}

// Quarter-size images stay in memory. Three separable box passes approximate
// the original Gaussian blur; the same diagonal veil is applied on every OS.
export function blurCapture(uri: string): string {
  if (!uri) return '';
  const raw = toByteArray(uri.slice(uri.indexOf(',') + 1));
  const decoded = UPNG.decode(raw.buffer as ArrayBuffer), w = decoded.width, h = decoded.height;
  if (w * h > 16_777_216) throw Error('Слишком большой снимок экрана.');
  const pixels = new Uint8Array(UPNG.toRGBA8(decoded)[0]), gray = new Uint8Array(w * h), temp = new Uint8Array(w * h);
  for (let i = 0; i < gray.length; i++) gray[i] = (pixels[i * 4] * 77 + pixels[i * 4 + 1] * 150 + pixels[i * 4 + 2] * 29) >> 8;
  const clamp = (v: number, max: number) => Math.min(max - 1, Math.max(0, v));
  for (let pass = 0; pass < 3; pass++) {
    for (let y = 0; y < h; y++) {let sum = 0; for (let k = -2; k <= 2; k++) sum += gray[y * w + clamp(k, w)]; for (let x = 0; x < w; x++) {temp[y * w + x] = sum / 5; sum += gray[y * w + clamp(x + 3, w)] - gray[y * w + clamp(x - 2, w)];}}
    for (let x = 0; x < w; x++) {let sum = 0; for (let k = -2; k <= 2; k++) sum += temp[clamp(k, h) * w + x]; for (let y = 0; y < h; y++) {gray[y * w + x] = sum / 5; sum += temp[clamp(y + 3, h) * w + x] - temp[clamp(y - 2, h) * w + x];}}
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const t = (x * w + y * h) / (w * w + h * h), u = t < .5 ? t * 2 : (t - .5) * 2;
    const a = (t < .5 ? 197 + (174 - 197) * u : 174 + (213 - 174) * u) / 255;
    const veil = t < .5 ? 27 + (68 - 27) * u : 68 + (28 - 68) * u;
    const v = Math.round(gray[y * w + x] * (1 - a) + veil * a), i = (y * w + x) * 4;
    pixels.set([v, v, v, 255], i);
  }
  return pngURI(pixels, w, h);
}
