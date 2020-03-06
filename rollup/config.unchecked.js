var config = require('./config')
var removeCheck = require('./plugins/remove-check')

config[0].output.file = 'dist/regl.unchecked.js'
config[1].output.file = 'dist/regl.es,unchecked.js'
config[0].output.sourceMap = false
config[1].output.sourceMap = false
config.forEach(bundle => bundle.output.plugins.push(removeCheck()))

module.exports = config
