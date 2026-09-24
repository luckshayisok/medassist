const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// No `inlineRem`: rem stays dynamic so the in-app Text Size setting can scale the whole UI via rem.set().
module.exports = withNativeWind(config, { input: './global.css' });
