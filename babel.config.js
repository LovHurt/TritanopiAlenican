module.exports = {
  presets: ['module:metro-react-native-babel-preset', '@babel/preset-flow'],
  plugins: [
    '@react-native/babel-plugin-codegen',

    'babel-plugin-syntax-hermes-parser',
    ['@babel/plugin-proposal-class-properties', {loose: true}],
    ['@babel/plugin-proposal-private-methods', {loose: true}],
    ['@babel/plugin-proposal-private-property-in-object', {loose: true}],
    ['react-native-worklets-core/plugin'],
    ['react-native-reanimated/plugin'],
  ],
};
