import React, {useState} from 'react';
import {Pressable, Text, View, type ViewStyle, type StyleProp} from 'react-native';
import {foreground} from '../core/color';
import {at, colors, styles} from './theme';

export function Button({label, onPress, accent, primary = false, disabled = false, style, small = false}: {label: string; onPress(): void; accent: string; primary?: boolean; disabled?: boolean; style?: StyleProp<ViewStyle>; small?: boolean}) {
  const [hover, setHover] = useState(false), [focus, setFocus] = useState(false);
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} onHoverIn={() => setHover(true)} onHoverOut={() => setHover(false)} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)} style={({pressed}) => [styles.centered, {backgroundColor: primary ? accent : colors.button, borderColor: primary || focus ? accent : colors.border, borderWidth: 1, borderRadius: 10, opacity: disabled ? .4 : pressed ? .6 : hover ? .8 : 1}, style]}><Text style={[styles.text, {fontSize: small ? 12 : 14, fontWeight: primary ? '600' : '400', color: primary ? foreground(accent) : '#E8E8E8'}]}>{label}</Text></Pressable>;
}
export function Switch({value, onPress, accent, label, style}: {value: boolean; onPress(): void; accent: string; label: string; style?: StyleProp<ViewStyle>}) {
  const [focus, setFocus] = useState(false);
  return <Pressable accessibilityRole="switch" accessibilityLabel={label} accessibilityState={{checked: value}} onPress={onPress} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)} style={[{width: 48, height: 28, borderRadius: 14, borderWidth: 1, borderColor: focus ? '#FFF' : 'transparent', backgroundColor: value ? accent : '#505050', padding: 3, justifyContent: 'center', alignItems: value ? 'flex-end' : 'flex-start'}, style]}><View style={{width: 20, height: 20, borderRadius: 10, backgroundColor: value ? foreground(accent) : colors.text}} /></Pressable>;
}
function Line({x, y, w, h = 1.5, rotate = 0, color}: {x: number; y: number; w: number; h?: number; rotate?: number; color: string}) {return <View style={[at(x, y, w, h), {backgroundColor: color, borderRadius: 1, transform: [{rotate: `${rotate}deg`}]}]} />;}
export function WindowIcon({restore = false, color}: {restore?: boolean; color: string}) {
  return <View style={{width: 16, height: 16}}>{restore ? <>{[[1, 1], [10, 1], [1, 14], [10, 14]].map(([x, y], i) => <React.Fragment key={i}><Line x={x} y={y} w={5} color={color} /><Line x={i % 2 ? 14 : 1} y={i < 2 ? 1 : 10} w={1.5} h={5} color={color} /></React.Fragment>)}</> : <><Line x={1} y={1} w={12} color={color} /><Line x={12} y={1} w={1.5} h={12} color={color} /><Line x={3.3} y={4.3} w={11.3} rotate={-45} color={color} /><Line x={1} y={13} w={4} color={color} /></>}</View>;
}
export function IconButton({restore = false, accent, onPress, style}: {restore?: boolean; accent: string; onPress(): void; style: StyleProp<ViewStyle>}) {
  const [hover, setHover] = useState(false);
  const label = restore ? 'Развернуть экран перерыва' : 'Свернуть в мини-панель';
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} onHoverIn={() => setHover(true)} onHoverOut={() => setHover(false)} style={[styles.centered, {borderRadius: 8, backgroundColor: hover ? '#FFFFFF0C' : 'transparent'}, style]}><WindowIcon restore={restore} color={accent} /></Pressable>;
}
