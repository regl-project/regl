const depCheck = require('dependency-check')
const deglob = require('deglob')
const path = require('path')

const ROOT = path.join(__dirname, '..')

// reference: https://github.com/flet/deglob
// Find all js files but exclude
// - patterns defined in `.gitignore`
// - ignore list defined in `package.json`
const option = {
  configKey: 'standard'
}

deglob('**/*.js', option, (err, files) => {
  if (err) throw err

  depCheck({
    path: ROOT,
    entries: files.map(path.relative.bind(null, ROOT)),
    noDefaultEntries: true
  }, (err, data) => {
    if (err) throw err

    // check missing dependencies
    var result = depCheck.missing(data.package, data.used)

    result.length && console.error(`
      Dependencies not listed in package.json:
        ${result.join('\n\t')}
    `)
    process.exit(result.length)
  })
})
