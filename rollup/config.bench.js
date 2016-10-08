var commonjs = require('rollup-plugin-commonjs')
var nodeResolve = require('rollup-plugin-node-resolve')
var json = require('rollup-plugin-json')
var htmlWrap = require('./plugins/html-wrap')

module.exports = {
  entry: 'bench/bench.js',
  dest: 'www/bench.html',
  format: 'iife',
  moduleName: 'bundle',
  plugins: [
    json(),
    nodeResolve({ browser: true }),
    commonjs(),
    htmlWrap()
  ],
  external: ['fs', 'path'],
  globals: {
    fs: '{}',
    path: '{}'
  }
}
