import commonjs from 'rollup-plugin-commonjs'
import json from 'rollup-plugin-json'

export default {
  entry: 'regl.js',
  dest: 'dist/regl.js',
  format: 'umd',
  moduleName: 'createREGL',
  plugins: [
    commonjs(),
    json()
  ]
}
