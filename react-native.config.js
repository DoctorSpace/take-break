const path = require('node:path');
const windows = require('react-native-windows/react-native.config');
const macos = require('react-native-macos/react-native.config');
module.exports = {
  reactNativePath: path.dirname(require.resolve(process.platform === 'darwin' ? 'react-native-macos/package.json' : 'react-native/package.json')),
  commands: [...windows.commands, ...macos.commands],
  platforms: {windows: windows.platforms.windows, ...(macos.platforms.macos ? {macos: macos.platforms.macos} : {})},
};
