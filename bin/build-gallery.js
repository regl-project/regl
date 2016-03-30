var fs = require('fs')
var glob = require('glob')
var browserify = require('browserify')
var mkdirp = require('mkdirp')

function pageName (file) {
  return file.replace('example', 'www/gallery') + '.html'
}

function generateGallery (files) {
  fs.writeFile('www/gallery.html',
  `<!DOCTYPE html>
    <html>
      <head>
        <title>regl gallery</title>
        <meta content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=0" name="viewport" />
        <meta charset=utf-8>
      </head>
      <body>
        <ul>
        ${files.map(function (file) {
          return `
            <li><a href="${file.replace('example', 'gallery')}.html"'>
              ${file}
            </a></li>`
        }).join('\n')}
        </ul>
      </body>
    </html>`)
}

mkdirp('www/gallery', function (err) {
  if (err) {
    return
  }
  glob('example/*.js', {}, function (err, files) {
    if (err) {
      return
    }
    files.forEach(function (file) {
      var b = browserify({
        debug: true
      })
      b.add(file)
      b.bundle(function (err, bundle) {
        if (err) {
          return
        }
        var page = pageName(file)
        console.log('bundled', file, 'writing to  ', page)
        fs.writeFile(page,
          `<!DOCTYPE html>
            <html>
              <head>
                <title>${file}</title>
                <meta content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=0" name="viewport" />
                <meta charset=utf-8>
              </head>
              <body>
              <script type='text/javascript'>
              ${bundle.toString()}
              </script>
              </body>
            </html>`)
      })
    })
    generateGallery(files)
  })
})
