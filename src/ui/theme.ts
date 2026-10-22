import {Platform, StyleSheet} from 'react-native';
export const colors = {background: '#181818', card: '#222222', border: '#3B3B3B', field: '#1B1B1B', muted: '#AAAAAA', text: '#F2F2F2', button: '#303030', error: '#FFB1A1'};
export const font = Platform.OS === 'windows' ? 'Segoe UI' : Platform.OS === 'macos' ? 'Helvetica Neue' : 'Segoe UI, Arial, sans-serif';
export const mono = Platform.OS === 'windows' ? 'Consolas' : Platform.OS === 'macos' ? 'Menlo' : 'Consolas, monospace';
export const at = (left: number, top: number, width: number, height: number) => ({position: 'absolute' as const, left, top, width, height});
export const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.background},
  text: {fontFamily: font, fontSize: 14, color: colors.text, includeFontPadding: false},
  muted: {fontFamily: font, fontSize: 12, color: colors.muted},
  centered: {alignItems: 'center', justifyContent: 'center'},
  shell: {backgroundColor: colors.field, borderWidth: 1, borderColor: colors.border, borderRadius: 9, justifyContent: 'center'},
  input: {fontFamily: mono, color: colors.text, fontSize: 17, padding: 0, margin: 0, borderWidth: 0, height: 22, lineHeight: 22},
});
