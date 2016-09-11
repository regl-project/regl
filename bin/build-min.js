var path = require('path')
var fs = require('fs')
var browserify = require('browserify')
var ClosureCompiler = require('google-closure-compiler').compiler

var INPUT_FILE = path.join(__dirname, '../regl.js')
var UNCHECKED_FILE = path.join(__dirname, '../dist/regl.unchecked.js')
var OUTPUT_FILE = path.join(__dirname, '../dist/regl.min.js')

console.log('removing checks from ', INPUT_FILE)
console.log('writing to ', UNCHECKED_FILE)

browserify(INPUT_FILE, {
  standalone: 'createREGL',
  debug: true
})
  .transform(require('./remove-check'))
  .bundle()
  .pipe(fs.createWriteStream(UNCHECKED_FILE))
  .on('close', function () {
    console.log('minifying script: ', UNCHECKED_FILE)

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
  })
