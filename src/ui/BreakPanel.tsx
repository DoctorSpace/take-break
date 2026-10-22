import React, {useState} from 'react';
import {Image, Pressable, Text, View} from 'react-native';
import {countdown, remaining} from '../core/settings';
import type {Client, Snapshot, WindowInfo} from '../core/types';
import {IconButton} from './Controls';
import {at, colors, styles} from './theme';

function Ring({fraction, accent}: {fraction: number; accent: string}) {
  const count = Math.max(2, Math.ceil(Math.max(0, Math.min(.99999, fraction)) * 180));
  return <View style={{width: 220, height: 220}} pointerEvents="none"><View style={[at(8, 8, 204, 204), {borderRadius: 102, borderWidth: 4, borderColor: '#494949'}]} />{Array.from({length: count}, (_, i) => {const a = i / (count - 1) * Math.min(.99999, fraction) * Math.PI * 2; return <View key={i} style={[at(110 + Math.sin(a) * 102 - 2, 110 - Math.cos(a) * 102 - 2.5, 4, 5), {borderRadius: 2, backgroundColor: accent, transform: [{rotate: `${a * 180 / Math.PI + 90}deg`}]}]} />;})}</View>;
}
export function BreakPanel({state: s, client, info}: {state: Snapshot; client: Client; info: WindowInfo}) {
  const [size, setSize] = useState({width: 1280, height: 720}), [focused, setFocused] = useState(false), [hover, setHover] = useState(false);
  const scale = Math.min(1, (size.width - 48) / 560, (size.height - 48) / 537), accent = s.accent;
  return <View style={[styles.root, {backgroundColor: '#202020'}]} onLayout={e => setSize(e.nativeEvent.layout)}>
    {!!info.capture?.image && <Image source={{uri: info.capture.image}} style={{position: 'absolute', width: '100%', height: '100%'}} resizeMode="stretch" />}
    {info.capture?.primary !== false ? <View style={[at((size.width - 560) / 2, (size.height - 537) / 2, 560, 537), {borderRadius: 28, borderWidth: 1, borderColor: '#6F6F6F48', backgroundColor: '#242424DB', shadowColor: '#000', shadowOpacity: .22, shadowRadius: 30, shadowOffset: {width: 0, height: 12}, transform: [{scale}]}]}>
      <Text style={[styles.muted, at(40, 24, 478, 36), {fontSize: 10, fontWeight: '600', lineHeight: 36, textAlign: 'center'}]}>ПЕРЕРЫВ</Text>
      <IconButton accent={accent} onPress={() => client.command({type: 'collapse'})} style={at(482, 24, 36, 36)} />
      <Text style={[styles.text, at(40, 76, 478, 43), {fontSize: 32, fontWeight: '600', textAlign: 'center'}]}>{s.heading}</Text>
      <View style={at(169, 149, 220, 220)}><Ring fraction={s.durationMs ? s.remainingMs / s.durationMs : 0} accent={accent} /><View pointerEvents="none" style={[{position: 'absolute', width: 220, height: 220}, styles.centered]}><Text style={[styles.text, {fontSize: 49, fontWeight: '300', color: accent, fontVariant: ['tabular-nums']}]}>{countdown(s.remainingMs)}</Text></View></View>
      <Text style={[styles.muted, at(40, 387, 478, 18), {fontSize: 13, textAlign: 'center'}]}>{remaining(s.remainingMs)}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Завершить перерыв — удерживайте 1,2 секунды" onPressIn={() => client.command({type: 'holdStart'})} onPressOut={() => client.command({type: 'holdCancel'})} onHoverIn={() => setHover(true)} onHoverOut={() => {setHover(false); client.command({type: 'holdCancel'});}} onFocus={() => setFocused(true)} onBlur={() => {setFocused(false); client.command({type: 'holdCancel'});}} style={[at(161, 432, 236, 48), styles.centered, {borderRadius: 10, borderColor: accent, borderWidth: focused ? 2 : 1, overflow: 'hidden', backgroundColor: hover ? '#FFFFFF0C' : 'transparent'}]}>
        <View pointerEvents="none" style={{position: 'absolute', left: 0, top: 0, bottom: 0, width: `${s.holdProgress * 100}%`, borderRadius: 9, backgroundColor: accent, opacity: .24}} /><Text style={[styles.text, {color: accent}]}>Завершить перерыв</Text>
      </Pressable>
      <Text style={[styles.text, at(40, 490, 478, 15), {fontSize: 11, color: '#8F8F8F', textAlign: 'center'}]}>Удерживайте, чтобы завершить</Text>
    </View> : <View style={[{flex: 1}, styles.centered]}><Text style={[styles.text, {fontSize: 48, color: '#D0D0D0', opacity: .6}]}>Ⅱ</Text></View>}
    <Text style={[styles.text, {position: 'absolute', bottom: 22, width: '100%', textAlign: 'center', fontSize: 10, color: '#929292'}]}>TAKE BREAK</Text>
  </View>;
}
export function MiniPanel({state: s, client}: {state: Snapshot; client: Client}) {
  return <View style={{width: 520, height: 72, backgroundColor: 'transparent'}}><View style={[at(12, 6, 496, 54), {borderRadius: 18, borderColor: '#595959', borderWidth: 1, backgroundColor: '#272727F0', shadowColor: '#000', shadowOpacity: .3, shadowRadius: 9, shadowOffset: {width: 0, height: 5}}]}>
    <Text style={[styles.text, at(20, 6, 180, 40), {fontSize: 22, fontWeight: '600', lineHeight: 40, color: '#E6E6E6'}]}>Перерыв</Text>
    <Text style={[styles.text, at(200, 6, 92, 40), {fontSize: 22, fontWeight: '600', lineHeight: 40, color: s.accent, textAlign: 'center', fontVariant: ['tabular-nums']}]}>{countdown(s.remainingMs)}</Text>
    <Text style={[styles.muted, at(292, 6, 146, 40), {fontSize: 11, lineHeight: 40, textAlign: 'center'}]}>Завершится в {new Date(s.endAt ?? Date.now()).toLocaleTimeString('ru-RU')}</Text>
    <IconButton accent={s.accent} restore onPress={() => client.command({type: 'restore'})} style={at(438, 8, 36, 36)} />
  </View></View>;
}
