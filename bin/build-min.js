var ClosureCompiler = require('google-closure-compiler').compiler

var closureCompiler = new ClosureCompiler({
  js: 'dist/regl.js',
  compilation_level: 'ADVANCED',
  js_output_file: 'dist/regl.min.js'
})

closureCompiler.run(function (exitCode, stdOut, stdErr) {
  console.log('closure stdout:', stdOut)
  console.log('closure stderr:', stdErr)
  process.exit(exitCode)
})
