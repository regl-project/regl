var ClosureCompiler = require('google-closure-compiler').compiler

var UNCHECKED_FILE = process.argv[2]
var OUTPUT_FILE = process.argv[3]

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
