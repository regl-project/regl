var config = require('./config.js')
var removeCheck = require('./plugins/remove-check.js')

config.dest = 'dist/regl.unchecked.js'
config.plugins.push(removeCheck())

export default config
