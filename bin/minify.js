var path = require('path')
var ClosureCompiler = require('google-closure-compiler').compiler

var UNCHECKED_FILE = path.join(__dirname, '../dist/regl.unchecked.js')
var OUTPUT_FILE = path.join(__dirname, '../dist/regl.min.js')

var closureCompiler = new ClosureCompiler({
  js: UNCHECKED_FILE,
  compilation_level: 'SIMPLE',
  js_output_file: OUTPUT_FILE
})

closureCompiler.run(function (exitCode, stdOut, stdErr) {
  console.log('closure stdout:', stdOut)
  console.log('closure stderr:', stdErr)
  process.exit(exitCode)
})
