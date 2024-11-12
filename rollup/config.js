// config for base redistributable build

var json = require('@rollup/plugin-json')
var es6 = require('./plugins/es6-convert')

module.exports = {
  input: 'regl.js',
  output: {
    file: 'dist/regl.js',
    format: 'umd',
    name: 'createREGL',
    sourcemap: true
  },
  plugins: [
    es6(),
    json()
  ]
}
