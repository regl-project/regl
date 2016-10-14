var json = require('rollup-plugin-json')

module.exports = {
  entry: 'regl.js',
  dest: 'dist/regl.js',
  format: 'umd',
  moduleName: 'createREGL',
  plugins: [
    json()
  ],
  sourceMap: true
}
