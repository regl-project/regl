var config = require('./rollup.config.js')
var removeCheck = require('./bin/remove-check.js')

config.dest = 'dist/regl.unchecked.js'
config.plugins.push( removeCheck() );

export default config;
