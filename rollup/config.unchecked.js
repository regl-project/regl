var config = require('./config')
var removeCheck = require('./plugins/remove-check')

config.dest = 'dist/regl.unchecked.js'
config.sourceMap = false
config.plugins.push(removeCheck())

module.exports = config
