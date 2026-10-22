const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');
module.exports = mergeConfig(getDefaultConfig(__dirname), {
  resolver: {sourceExts: ['windows.tsx', 'macos.tsx', 'native.tsx', 'tsx', 'ts', 'jsx', 'js', 'json']},
});
