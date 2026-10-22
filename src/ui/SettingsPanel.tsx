import React, {useState} from 'react';
import {Pressable, Text, TextInput, View} from 'react-native';
import type {Client, Snapshot} from '../core/types';
import type {Settings} from '../core/settings';
import {Button, Switch} from './Controls';
import {at, colors, font, mono, styles} from './theme';

function status(s: Snapshot): [string, string, string] {
  if (s.breaking) return ['СЕЙЧАС ПЕРЕРЫВ', 'Время для себя', 'Таймер уже запущен на основном экране.'];
  if (!s.settings.Enabled) return ['ПЕРЕРЫВЫ НА ПАУЗЕ', 'В вашем темпе', 'Включите переключатель, когда будете готовы.'];
  if (s.nextBreak === null) return ['НЕТ ПОДХОДЯЩЕГО ВРЕМЕНИ', 'Расширьте расписание', 'Рабочее окно должно быть длиннее интервала между перерывами.'];
  const date = new Date(s.nextBreak), now = new Date(), mins = Math.ceil((s.nextBreak - +now) / 60000), time = date.toLocaleTimeString('ru-RU', {hour: '2-digit', minute: '2-digit'});
  const detail = mins < 1 ? 'меньше чем через минуту' : mins < 60 ? `через ${mins} мин` : date.toDateString() === now.toDateString() ? `сегодня в ${time}` : `${date.toLocaleDateString('ru-RU', {weekday: 'short', day: '2-digit', month: 'short'})} · ${time}`;
  return ['ВАШ СЛЕДУЮЩИЙ ПЕРЕРЫВ', detail, `${time}  ·  ${s.settings.DurationMinutes} мин отдыха`];
}
function Input({value, onChange, label, accent, unit, width = 82}: {value: string; onChange(v: string): void; label: string; accent: string; unit?: string; width?: number}) {
  const [focus, setFocus] = useState(false);
  return <View style={[styles.shell, {width, height: 38, borderColor: focus ? accent : colors.border, paddingHorizontal: 12}]}><TextInput accessibilityLabel={label} value={value} onChangeText={onChange} maxLength={unit ? 3 : 5} selectTextOnFocus={false} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)} style={[styles.input, {width: unit ? 100 : undefined, textAlign: unit ? 'left' : 'center'}]} />{unit && <Text pointerEvents="none" style={[styles.muted, {position: 'absolute', right: 12}]}>{unit}</Text>}</View>;
}
export function SettingsPanel({state: s, client}: {state: Snapshot; client: Client}) {
  const [values, setValues] = useState([String(s.settings.IntervalMinutes), String(s.settings.DurationMinutes), s.settings.StartTime, s.settings.EndTime]);
  const [days, setDays] = useState([...s.settings.Days]);
  const [title, detail, note] = status(s), accent = s.accent;
  function change(index: number, value: string) {const next = values.map((v, i) => i === index ? value : v); setValues(next); edit(next, days);}
  function edit(v: string[], selected: number[]) {const integer = (s: string) => /^\d+$/.test(s.trim()) ? Number(s) : 0; const settings: Settings = {...s.settings, IntervalMinutes: integer(v[0]), DurationMinutes: integer(v[1]), StartTime: v[2].trim(), EndTime: v[3].trim(), Days: [...selected]}; client.command({type: 'edit', settings});}
  return <View style={[styles.root, {width: 634, height: 681}]} pointerEvents={s.paletteOpen ? 'none' : 'auto'}>
    <Text style={[styles.text, at(28, 22, 578, 34), {fontSize: 25, fontWeight: '600'}]}>Ваш спокойный ритм</Text>
    <Text style={[styles.muted, at(28, 60, 578, 20)]}>Работайте с фокусом. Отдыхайте вовремя.</Text>
    <View style={[at(28, 97, 578, 118), {borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card}]}>
      <Text style={[styles.muted, at(18, 14, 360, 28), {fontSize: 10, fontWeight: '600', lineHeight: 28}]}>{title}</Text>
      <Text style={[styles.text, at(18, 48, 358, 34), {fontSize: 25, fontWeight: '600'}]} numberOfLines={1}>{detail}</Text>
      <Text style={[styles.muted, at(18, 86, 358, 26)]}>{note}</Text>
      <Text style={[styles.muted, at(431, 15, 71, 28), {lineHeight: 28}]}>Перерывы</Text>
      <Switch value={s.settings.Enabled} onPress={() => client.command({type: 'toggleEnabled'})} accent={accent} label="Включить перерывы" style={at(511, 15, 48, 28)} />
      <Button label="Отдохнуть сейчас  →" onPress={() => client.command({type: 'startFromMain'})} accent={accent} primary style={at(392, 56, 167, 39)} />
    </View>
    <Text style={[styles.text, at(28, 233, 578, 23), {fontSize: 17, fontWeight: '600'}]}>Настройки перерывов</Text>
    {['Интервал', 'Длительность'].map((label, i) => <View key={label} style={[at(i ? 324 : 28, 266, 282, 128), {backgroundColor: colors.card, borderRadius: 12}]}>
      <Text style={[styles.text, at(12, 10, 258, 21), {fontWeight: '600'}]}>{label}</Text>
      <View style={at(12, 39, 258, 38)}><Input label={i ? 'Длительность перерыва в минутах' : 'Интервал в минутах'} value={values[i]} onChange={v => change(i, v)} unit={i ? 'минут отдыха' : 'минут работы'} width={258} accent={accent} /></View>
      {(i ? [3, 5, 10] : [30, 40, 60]).map((n, p) => <Button key={n} label={`${n} мин`} onPress={() => change(i, String(n))} accent={accent} small style={at(12 + p * 88, 87, 82, 29)} />)}
    </View>)}
    <Text style={[styles.text, at(28, 416, 320, 22), {fontWeight: '600'}]}>Расписание</Text>
    <Text style={[styles.muted, at(28, 438, 320, 20)]}>Только в нужные часы</Text>
    <View style={at(408, 418, 82, 38)}><Input label="Начало рабочего времени" value={values[2]} onChange={v => change(2, v)} accent={accent} /></View>
    <Text style={[styles.text, at(500, 418, 14, 38), {color: colors.muted, lineHeight: 38}]}>—</Text>
    <View style={at(524, 418, 82, 38)}><Input label="Конец рабочего времени" value={values[3]} onChange={v => change(3, v)} accent={accent} /></View>
    {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((label, i) => {const day = (i + 1) % 7, selected = days.includes(day), x = Math.round(28 + i * 586 / 7), right = Math.round(28 + (i + 1) * 586 / 7) - 8; return <Pressable key={day} accessibilityRole="checkbox" accessibilityLabel={label} accessibilityState={{checked: selected}} onPress={() => {const next = selected ? days.filter(d => d !== day) : [...days, day]; setDays(next); edit(values, next);}} style={({pressed}) => [at(x, 470, right - x, 40), styles.centered, {borderRadius: 10, borderWidth: 1, borderColor: selected ? accent : colors.border, backgroundColor: selected ? colors.button : colors.field, opacity: pressed ? .75 : 1}]}><Text style={[styles.text, {color: selected ? accent : colors.muted}]}>{label}</Text></Pressable>;})}
    <Text style={[styles.text, at(28, 534, 420, 38), {lineHeight: 38, fontWeight: '600'}]}>Акцентный цвет</Text>
    <Pressable accessibilityRole="button" accessibilityLabel="Выбрать акцентный цвет в палитре" onPress={() => client.command({type: 'openPalette'})} style={[at(480, 534, 126, 38), {backgroundColor: colors.button, borderWidth: 1, borderColor: colors.border, borderRadius: 10, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12}]}><View style={{width: 20, height: 20, borderRadius: 6, backgroundColor: accent, borderColor: '#FFFFFF60', borderWidth: 1, marginRight: 10}} /><Text style={[styles.text, {fontSize: 12}]}>{accent}</Text><View style={{width: 6, height: 6, borderRightWidth: 1.3, borderBottomWidth: 1.3, borderColor: colors.muted, transform: [{rotate: '45deg'}], marginLeft: 12, marginTop: -3}} /></Pressable>
    <Text style={[styles.text, at(28, 584, 500, 22), {fontWeight: '600'}]}>Запускать при включении компьютера</Text>
    <Text style={[styles.muted, at(28, 607, 500, 20)]}>В трее, без окна настроек</Text>
    <Switch value={s.startup} onPress={() => client.command({type: 'toggleStartup'})} accent={accent} label="Запускать при включении компьютера" style={at(558, 594, 48, 28)} />
    {!!s.error && <Text style={[styles.text, at(28, 632, 578, 20), {fontSize: 12, color: colors.error}]} numberOfLines={1}>{s.error}</Text>}
    <Text style={[styles.text, at(28, 653, 200, 14), {fontSize: 10, color: '#777777'}]}>TAKE BREAK</Text>
    <Text style={[styles.text, at(520, 653, 86, 14), {fontSize: 11, color: '#777777', textAlign: 'right'}]}>v0.8.0</Text>
  </View>;
}
