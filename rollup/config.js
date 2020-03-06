// config for base redistributable build

const json = require('rollup-plugin-json')
const es6 = require('./plugins/es6-convert')

module.exports = [
  {
    input: 'regl.js',
    output: {
      file: 'dist/regl.js',
      format: 'umd',
      moduleName: 'createREGL',
      plugins: [
        es6(),
        json()
      ],
      sourceMap: true
    }
  },
  {
    input: 'regl.js',
    output: {
      file: 'dist/regl.es.js',
      format: 'esm',
      moduleName: 'createREGL',
      plugins: [
        es6(),
        json()
      ],
      sourceMap: true
    }
  }
]
