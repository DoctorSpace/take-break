import React, {useEffect, useState} from 'react';
import {Text, View} from 'react-native';
import {App} from './App';
import {nativeClient} from './native/client';
import type {Client, WindowInfo} from './core/types';
import {colors, styles} from './ui/theme';
export function NativeApp(props: Partial<WindowInfo>) {
  const [client, setClient] = useState<Client>(), [error, setError] = useState('');
  const [info] = useState<WindowInfo>({scene: props.scene || 'settings', capture: props.capture});
  useEffect(() => {let active = true; nativeClient(info).then(client => {if (active) setClient(client);}, e => {if (active) setError(String(e));}); return () => {active = false;};}, [info]);
  if (client) return <App client={client} info={info} />;
  return <View style={{flex: 1, backgroundColor: colors.background}}>{!!error && <Text style={[styles.text, {color: colors.error, margin: 28}]}>{error}</Text>}</View>;
}
