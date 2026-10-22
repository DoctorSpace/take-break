import React, {useSyncExternalStore} from 'react';
import {View} from 'react-native';
import type {Client, WindowInfo} from './core/types';
import {SettingsPanel} from './ui/SettingsPanel';
import {BreakPanel, MiniPanel} from './ui/BreakPanel';
import {Palette} from './ui/Palette';
import {colors} from './ui/theme';
export function App({client, info}: {client: Client; info: WindowInfo}) {
  const state = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
  if (!state.ready) return <View style={{flex: 1, backgroundColor: colors.background}} />;
  if (info.scene === 'palette') return <Palette state={state} client={client} />;
  if (info.scene === 'break') return <BreakPanel state={state} client={client} info={info} />;
  if (info.scene === 'mini') return <MiniPanel state={state} client={client} />;
  return <SettingsPanel state={state} client={client} />;
}
