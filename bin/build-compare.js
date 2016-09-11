var fs = require('fs')
var os = require('os')
var path = require('path')
var glob = require('glob')
var browserify = require('browserify')
var removeCheck = require('./remove-check')
var ncp = require('ncp')
var mkdirp = require('mkdirp')
var es2020 = require('es2020')
var ClosureCompiler = require('google-closure-compiler').compiler

var ROOT_DIR = 'compare'
var WWW_DIR = 'www/compare'
var TMP_DIR = os.tmpdir()

mkdirp(WWW_DIR, function (err) {
  if (err) {
    throw err
  }
  glob(ROOT_DIR + '/*', {}, function (err, files) {
    if (err) {
      throw err
    }
    var comparisons = {}
    var counter = files.length
    files.forEach(function (caseDir) {
      var name = path.relative(ROOT_DIR, caseDir)
      var www = path.join(WWW_DIR, name)
      var root = path.join(ROOT_DIR, name)
      mkdirp(www, function (err) {
        if (err) {
          throw err
        }
        handleCase(name, www, root, handleFinish)
      })
    })

    function handleFinish (name, data) {
      comparisons[name] = {
        description: fs.readFileSync(path.join(ROOT_DIR, name, 'description.txt')).toString(),
        implementations: data
      }
      if (--counter > 0) {
        return
      }
      writeComparisonPage(comparisons)
    }
  })
})

function handleCase (name, www, root, onComplete) {
  var comparisons = {}
  var counter = 0

  glob(root + '/*', {}, function (err, files) {
    if (err) {
      throw err
    }
    counter = files.length
    files.forEach(function (fullPath) {
      var file = path.relative(root, fullPath)
      var target = path.join(www, file)
      if (/\.js$/.test(file)) {
        handleJS(
          file.replace(/_.*$/, ''),
          fullPath,
          target.replace(/\.js$/, '.html'),
          /^regl/.test(file))
      } else {
        if (/\.html$/i.test(file)) {
          ncp(fullPath, target, function (err) {
            if (err) {
              throw err
            }
            appendCase(file.replace(/_.*$/, ''), fullPath, target)
          })
        } else {
          ncp(fullPath, target)
          decrementCounter()
        }
      }
    })
  })

  function handleJS (name, sourcePath, htmlPath, needsTransform) {
    var b = browserify({
      debug: false
    })
    b.add(sourcePath)
    if (needsTransform) {
      b.transform(removeCheck)
      b.transform(es2020)
    }
    b.bundle(function (err, bundle) {
      if (err) {
        throw err
      }
      // run minification
      var bundlePath = path.join(TMP_DIR, name + '.bundle.js')
      var minPath = path.join(TMP_DIR, name + '.bundle.min.js')
      fs.writeFile(bundlePath, bundle, function (err) {
        if (err) {
          throw err
        }

        console.log('running closure compiler', bundlePath, '->', minPath)

        var closureCompiler = new ClosureCompiler({
          js: bundlePath,
          compilation_level: 'SIMPLE',
          js_output_file: minPath
        })

        closureCompiler.run(function (exitCode, stdOut, stdErr) {
          fs.readFile(minPath, function (err, data) {
            if (err) {
              throw err
            }
            writePage(name, htmlPath, data.toString(), function () {
              appendCase(name, sourcePath, htmlPath)
            })
          })
        })
      })
    })
  }

  function appendCase (name, sourcePath, htmlPath) {
    comparisons[name] = {
      source: sourcePath,
      html: htmlPath,
      suffix: /\.html$/.test(sourcePath) ? 'html' : 'js'
    }
    decrementCounter()
  }

  function decrementCounter () {
    if (--counter > 0) {
      return
    }
    console.log('built case:', name, comparisons)
    onComplete(name, comparisons)
  }
}

function writePage (name, htmlPath, data, cb) {
  fs.writeFile(htmlPath,
`<!DOCTYPE html>
<html>
  <head>
    <title>${name}</title>
    <meta content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=0" name="viewport" />
    <meta charset=utf-8>
  </head>
  <body>
  <script type='text/javascript'>${data}</script>
  </body>
</html>`, cb)
}

// Move webgl and regl to the top always
var IMPLEMENTATION_RANK = ['webgl', 'regl']
function implementationRank (b, a) {
  return IMPLEMENTATION_RANK.indexOf(a) - IMPLEMENTATION_RANK.indexOf(b)
}

function writeComparisonPage (comparisons) {
  // save sources
  fs.writeFile(
    path.join(WWW_DIR, 'manifest.json'),
    JSON.stringify(comparisons, null, '  '))

  var html = [
    `<!DOCTYPE html>
    <html>
      <head>
        <title>regl comparisons</title>
        <meta content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=0" name="viewport" />
        <meta charset=utf-8>
      </head>
      <body>
      <h1 class="header">Comparisons</h1>`
  ]
  Object.keys(comparisons).forEach(function (task) {
    var taskInfo = comparisons[task]
    html.push(
      `<div class="task">
        <h1 class="taskname">${task}</h1>
        <img src="compare/${task}/expected.png" />
        <div class="taskdescription">
        ${taskInfo.description}
        </div>`)
    var impl = taskInfo.implementations
    Object.keys(impl).sort(implementationRank).forEach(function (name) {
      var info = impl[name]
      html.push(
        `<div class="implementation">
          <h2><a class="implementationlink" href="${path.relative('www', info.html)}">${name}</a>:</h2>
          <pre class="implementationsource${impl.suffix}">
${fs.readFileSync(info.source).toString()
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')}
          </pre>
        </div>`)
    })
    html.push('</div>')
  })

  html.push(`
    </body>
  </html>`)

  fs.writeFile(
    path.join(WWW_DIR, '../compare.html'),
    html.join(''),
    function (err) {
      if (err) {
        throw err
      }
      console.log('done!')
    })
}
