var fs = require('fs')
var glob = require('glob')
var browserify = require('browserify')
var removeCheck = require('./remove-check')
var ncp = require('ncp')
var mkdirp = require('mkdirp')
var ClosureCompiler = require('google-closure-compiler').compiler

function pageName (file) {
  return file.replace('example', 'www/gallery') + '.html'
}

function jsName (file) {
  return file.replace('example', 'www/gallery') + '.js'
}

function imgName (file) {
  return file.replace('example', 'gallery/img').replace('.js', '.png')
}

var stylesheet = `

body {
    margin: 0 auto;
    max-width: 860px;
}

li a {
  text-decoration: none;
  color: #000;
}

li a:hover {
  color: #666;
}

p a {
  text-decoration: none;
  color: #00C;
}

p a:visited {
  color: #009;
}

p a:hover {
  color: #00F;
}


* {margin: 0; padding: 0;}

div {
  margin: 20px;
}

ul {
  list-style-type: none;
}

h3 {
  font: 700 1.27em verdana;
  margin-top: 50px;
  margin-bottom: 20px;
}

h1 {
  font: 700 3.27em verdana;
  max-width: 600px;
  margin: 0 auto;
}

li img {
  float: right;
  margin: 40px 15px 0 0;
}

li iframe {
  float: right;
  margin: 40px 15px 0 0;
}

li p {
  font: 95%/1.3 verdana;
  max-width: 390px;
  padding-bottom: 16px;
}

li {
  padding: 50px;
  overflow: auto;
  list-style-type: none;
}
`

function generateGallery (files) {
  var html = `<!DOCTYPE html>
    <html>
      <head>
        <title>regl gallery</title>
        <meta content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=0" name="viewport" />
        <meta charset=utf-8>
        <style>` +
        stylesheet +
`       </style>
      </head>
    <body>`

  html += '<h1>Example Gallery</h1>'

  html += '<ul>'

  html += files.map(function (file) {
    var li = '<li>' // begin list item

    var link = file.replace('example', 'gallery') + '.html'

    function getEmbedTag (id) {
      return '<iframe width="332" height="187" src="https://www.youtube.com/embed/' +
        id +
      '?rel=0" frameborder="0" allowfullscreen" frameborder="0" allowfullscreen></iframe>'
    }

    li += '<a href="' + link + '">'
    var img = imgName(file)

    var s = file.replace('example/', '').replace('.js', '')

    if (fs.existsSync('example/img/' + s + '.txt')) {
      li += getEmbedTag(
        fs.readFileSync('example/img/' + s + '.txt') + '')
    } else if (fs.existsSync('example/img/' + s + '.png')) {
      li += '<img src="' + img + '" width="332" height="208" alt="' + file + '" >'
    } else {
      throw new Error(
        'You need to provide either a youtube link or an image for the example ' +
      file)
    }
    li += '</a>'

    li += '<a href="' + link + '"><h3>' + file.replace('example/', '') + '</h3></a>'

    var fileSrc = fs.readFileSync(file) + ''
    var beg = fileSrc.search('/\\*')
    var end = fileSrc.search('\\*/')

    if (beg !== 0 || end === 0) {
      throw new Error(
        'The example ' + file +
          ' must begin with a description commment')
    }
    var desc = fileSrc.substring(beg + 2, end - 1)
    li += desc

    li += '<p>' +
      '<a href="' +
      link +
      '">Run Example</a>' +
      '</p>'

    li += '<p>' +
      '<a href="' +
      'https://github.com/mikolalysenko/regl/blob/gh-pages/' + file +
      '">Source Code</a>' +
      '</p>'

    li += '</li>'

    return li
  }).join('\n')

  html += '</ul>'

  html += `
      </body>
    </html>`

  fs.writeFile('www/gallery.html', html)
}

mkdirp('www/gallery', function (err) {
  if (err) {
    return
  }
  ncp('example/assets', 'www/gallery/assets', function (err) {
    console.log(err)
  })
  ncp('example/img', 'www/gallery/img', function (err) {
    console.log(err)
  })
  glob('example/*.js', {}, function (err, files) {
    if (err) {
      throw err
    }
    files.forEach(function (file) {
      var b = browserify({
        debug: true
      })
      b.add(file)
      b.transform(removeCheck)
      b.bundle(function (err, bundle) {
        if (err) {
          throw err
        }
        console.log('bundled', file)
        minifyAndGenPage(file, bundle)
      })
    })
    generateGallery(files)
  })
})

function minifyAndGenPage (file, bundle) {
  var jsFile = jsName(file)
  var minFile = jsFile.replace('.js', '.min.js')

  fs.writeFile(jsFile, bundle, function (err) {
    if (err) {
      throw err
    }

    console.log('minify ', jsFile, ' -> ', minFile)

    var closureCompiler = new ClosureCompiler({
      js: jsFile,
      compilation_level: 'SIMPLE',
      js_output_file: minFile
    })

    closureCompiler.run(function (exitCode, stdOut, stdErr) {
      fs.readFile(minFile, function (err, data) {
        if (err) {
          throw err
        }
        console.log('minified ', minFile)
        console.log('stdout: ', stdOut)
        console.log('stderr: ', stdErr)
        writePage(file, data)
      })
    })
  })
}

function writePage (file, bundle) {
  fs.writeFile(pageName(file),
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
      </html>`,
    function (err) {
      if (err) {
        throw err
      }
      console.log('wrote page', pageName(file))
    })
}
