// Jest stand-in for the FormatJS Intl polyfills (see package.json moduleNameMapper):
// Node ships full ICU, so the polyfills (which exist for Hermes) are unnecessary in
// tests, and their ESM entrypoints would need transform-whitelist surgery to parse.
module.exports = {};
