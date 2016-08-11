var depCheck = require('dependency-check')
var deglob = require('deglob')
var path = require('path')

var ROOT = path.join(__dirname, '..')

// reference: https://github.com/flet/deglob
// Find all js files but exclude
// - patterns defined in `.gitignore`
// - ignore list defined in `package.json`
var option = {
  configKey: 'standard'
}

deglob('**/*.js', option, function (err, files) {
  if (err) throw err

  depCheck({
    path: ROOT,
    entries: files.map(path.relative.bind(null, ROOT)),
    noDefaultEntries: true
  }, function (err, data) {
    if (err) throw err

    // check missing dependencies
    var result = depCheck.missing(data.package, data.used)

    if (result.length) {
      console.error(['Dependencies not listed in package.json:'].concat(result).join('\n\t') + '\n')
    }
    process.exit(result.length)
  })
})
