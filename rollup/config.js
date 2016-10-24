// config for base redistributable build

var json = require('rollup-plugin-json')
var es6 = require('./plugins/es6-convert')

module.exports = {
  entry: 'regl.js',
  dest: 'dist/regl.js',
  format: 'umd',
  moduleName: 'createREGL',
  plugins: [
    es6(),
    json()
  ],
  sourceMap: true
}
