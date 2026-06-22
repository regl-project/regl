var config = require('./config')
var removeCheck = require('./plugins/remove-check')

config.output.file = 'dist/regl.unchecked.js'
config.output.sourcemap = false
config.plugins.push(removeCheck())

module.exports = config
