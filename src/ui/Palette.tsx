import React, {useMemo, useState} from 'react';
import {Image, Pressable, Text, TextInput, View, type GestureResponderEvent} from 'react-native';
import {colorPlane, hsv, hueTrack, toHex, toHSV} from '../core/color';
import {validColor} from '../core/settings';
import type {Client, Snapshot} from '../core/types';
import {Button} from './Controls';
import {at, colors, styles} from './theme';
const presets = ['#B8CDB5', '#A5FF6D', '#C4B8DB', '#DCC8A3', '#D9B4B5', '#C8C8C8'];
const rainbow = hueTrack();
export function Palette({state: state, client}: {state: Snapshot; client: Client}) {
  const [selected, setSelected] = useState(state.accent), [value, setValue] = useState(state.accent), [channels, setChannels] = useState(toHSV(state.accent)), [focus, setFocus] = useState(false);
  const [h, s, v] = channels, error = validColor(value) ? state.error : 'Введите цвет в формате #RRGGBB', shift = error ? -23 : 0, planeHeight = 177 + shift;
  const plane = useMemo(() => colorPlane(h, 304, planeHeight), [h, planeHeight]);
  function preview(hex: string) {setSelected(hex); setValue(hex); client.command({type: 'previewColor', color: hex});}
  function changeHex(hex: string) {
    setValue(hex);
    if (!validColor(hex)) return;
    const next = toHSV(hex); if (!next[1]) next[0] = h;
    setChannels(next); setSelected(hex.toUpperCase()); client.command({type: 'previewColor', color: hex});
  }
  function pick(e: GestureResponderEvent, hue: boolean) {const {locationX: x, locationY: y} = e.nativeEvent; const next: [number, number, number] = hue ? [Math.max(0, Math.min(359.99, (x - 6) / 292 * 359.99)), s, v] : [h, Math.max(0, Math.min(1, x / 304)), 1 - Math.max(0, Math.min(1, y / planeHeight))]; setChannels(next); preview(toHex(hsv(...next)));}
  const responder = (hue: boolean) => ({onStartShouldSetResponder: () => true, onMoveShouldSetResponder: () => true, onResponderGrant: (e: GestureResponderEvent) => pick(e, hue), onResponderMove: (e: GestureResponderEvent) => pick(e, hue), onResponderRelease: (e: GestureResponderEvent) => pick(e, hue)});
  return <View style={[styles.root, {width: 344, height: 451}]}>
    <Text style={[styles.text, at(20, 20, 304, 25), {fontSize: 18, fontWeight: '600'}]}>Выберите оттенок</Text>
    <View accessibilityLabel="Насыщенность и яркость цвета" {...responder(false)} style={[at(20, 61, 304, planeHeight), {overflow: 'hidden'}]}><Image source={{uri: plane}} style={{width: 304, height: planeHeight}} /><View pointerEvents="none" style={[at(Math.max(0, Math.min(292, s * 304 - 6)), Math.max(0, Math.min(planeHeight - 12, (1 - v) * planeHeight - 6)), 12, 12), {borderRadius: 6, borderWidth: 2, borderColor: '#FFF', shadowColor: '#000', shadowOpacity: .8, shadowRadius: 3}]} /></View>
    <View accessibilityLabel="Цветовой тон" {...responder(true)} style={at(20, 254 + shift, 304, 24)}><Image source={{uri: rainbow}} style={[at(0, 5, 304, 14), {borderRadius: 6}]} /><View pointerEvents="none" style={[at(h / 359.99 * 292, 0, 12, 24), {borderRadius: 5, borderColor: '#FFF', borderWidth: 2, backgroundColor: '#333'}]} /></View>
    <View style={[at(20, 294 + shift, 38, 38), {borderRadius: 9, borderColor: '#FFFFFF60', borderWidth: 1, backgroundColor: selected}]} />
    <Text style={[styles.muted, at(70, 294 + shift, 80, 38), {lineHeight: 38}]}>HEX</Text>
    <View style={[styles.shell, at(196, 294 + shift, 128, 38), {paddingHorizontal: 12, borderColor: focus ? state.accent : colors.border}]}><TextInput accessibilityLabel="Цвет в формате HEX" value={value} onChangeText={changeHex} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)} maxLength={7} style={[styles.text, {fontSize: 15, padding: 0, height: 22}]} /></View>
    {presets.map((color, i) => <Pressable key={color} accessibilityRole="button" accessibilityLabel={`Применить цвет ${color}`} onPress={() => client.command({type: 'acceptColor', color})} style={[at(20 + i * 276 / 5, 348 + shift, 28, 28), {borderRadius: 10, backgroundColor: color, borderColor: '#FFFFFF60', borderWidth: 1}]} />)}
    {!!error && <Text style={[styles.text, at(20, 367, 304, 17), {fontSize: 11, color: colors.error}]} numberOfLines={1}>{error}</Text>}
    <Button label="Отмена" onPress={() => client.command({type: 'cancelColor'})} accent={state.accent} style={at(20, 392, 146, 40)} />
    <Button label="Выбрать" onPress={() => client.command({type: 'acceptColor', color: selected})} accent={state.accent} disabled={!validColor(value)} primary style={at(178, 392, 146, 40)} />
  </View>;
}
