import {describe, expect, it} from 'vitest';
import {defaults, decodeSettings, validate, nextBreak, isAllowed, countdown, remaining, pickHeading, headings} from '../src/core/settings';
import {foreground, hsv, toHSV, toHex} from '../src/core/color';
const monday = (h: number, m = 0, day = 12) => +new Date(2026, 9, day, h, m);
describe('original settings and schedule', () => {
  it('migrates the previous JSON without losing defaults', () => {expect(decodeSettings('{"IntervalMinutes":30}')).toEqual({...defaults(), IntervalMinutes: 30}); expect(validate(defaults())).toBe('');});
  it.each(['null', '[]', '{"AccentColor":null}', '{"Days":null}', '{"Enabled":null}', '{"IntervalMinutes":0}'])('rejects invalid settings: %s', json => {expect(() => decodeSettings(json)).toThrow();});
  it.each([[10, 0, 12, 10, 40, 12], [8, 50, 12, 9, 40, 12], [17, 50, 12, 9, 40, 13], [17, 50, 16, 9, 40, 19]])('respects a full interval', (h, m, d, eh, em, ed) => {expect(nextBreak(defaults(), monday(h, m, d))).toBe(monday(eh, em, ed));});
  it('uses inclusive opening and exclusive closing', () => {expect(isAllowed(defaults(), monday(9))).toBe(true); expect(isAllowed(defaults(), monday(18))).toBe(false);});
  it('attributes overnight shifts to their starting day', () => {const s = {...defaults(), StartTime: '22:00', EndTime: '06:00', Days: [1]}; expect(isAllowed(s, monday(2, 0, 13))).toBe(true); expect(isAllowed(s, monday(2))).toBe(false); expect(nextBreak(s, monday(23, 50))).toBe(monday(0, 30, 13));});
  it('supports full days and impossible intervals', () => {expect(isAllowed({...defaults(), StartTime: '09:00', EndTime: '09:00', Days: [1]}, monday(5, 0, 13))).toBe(true); expect(nextBreak({...defaults(), EndTime: '09:30'}, monday(8))).toBeNull();});
  it('formats the original countdown and text', () => {expect(countdown(1)).toBe('00:01'); expect(countdown(-1)).toBe('00:00'); expect(remaining(180000)).toBe('Осталось 3 минуты');});
  it('never repeats headings consecutively', () => {let previous = -1; for (let i = 0; i < 1000; i++) {const n = pickHeading(previous); expect(n).not.toBe(previous); expect(headings[n]).toBeTruthy(); previous = n;}});
});
describe('original HSV picker', () => {
  it.each(['#B8CDB5', '#C4B8DB', '#000000', '#FFFFFF', '#123456'])('round trips %s', color => {expect(toHex(hsv(...toHSV(color)))).toBe(color);});
  it('chooses readable text', () => {expect(foreground('#000000')).toBe('#F2F2F2'); expect(foreground('#FFFFFF')).toBe('#202020');});
});
