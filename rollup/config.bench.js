var commonjs = require('rollup-plugin-commonjs')
var nodeResolve = require('rollup-plugin-node-resolve')
var json = require('rollup-plugin-json')
var htmlWrap = require('./plugins/html-wrap')
var removeCheck = require('./plugins/remove-check.js')

module.exports = {
  input: 'bench/bench.js',
  output: {
    file: 'www/bench.html',
    format: 'iife',
    moduleName: 'bundle',
    plugins: [
      json(),
      nodeResolve({ browser: true }),
      commonjs(),
      removeCheck(),
      htmlWrap()
    ],
    external: ['fs', 'path'],
    globals: {
      fs: '{}',
      path: '{}'
    }
  }
}
