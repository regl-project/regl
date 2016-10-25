var fs = require('fs')
var glob = require('glob')
var browserify = require('browserify')
var removeCheck = require('./remove-check')
var ncp = require('ncp')
var mkdirp = require('mkdirp')
var es2020 = require('es2020')
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
h2 {
  font-size: 1.4em;

  margin-top: 50px;
  margin-bottom: 20px;
}

h1 {
  font-size: 3.0em;
  margin-top: 70px;
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

#exList > li img {
  float: right;
  margin: 40px 15px 0 0;
}

#container {
  margin: 0 auto;
  max-width: 760px;

  font-family: verdana;
  font-weight: 300;
  font-size: 1.0em;
}

#exList > li > a {
  text-decoration: none;
  color: #000;
}

#exList > li a:hover {
  color: #666;
}

#exList > li iframe {
  float: right;
  margin: 40px 15px 0 0;
}

#exList > li p {
  padding-bottom: 16px;
  max-width: 390px;
  line-height: 1.2em;
}

#exList > li {
  padding-top: 50px;
  padding-bottom: 50px;

  overflow: auto;
  list-style-type: none;
}

#tagList > li {
  padding: 0 10px;

  font-size: 1.25em;

  display: inline;
  border-right: 1px solid #333;
  line-height: 30px;
}

#tagList {
  margin:0;
  padding: 0;
  text-align: center;
}

.unselected > a {
  text-decoration: none;
  color: #555;
}

.unselected > a:hover {
  color: #600;
}

.selected > a {
  text-decoration: none;
  color: #C44;
}

.selected > a:hover {
  color: #C44;
}
`

function generateGallery (files) {
  var i
  var s
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

  html += '<div id="container">'

  html += '<h1>regl Example Gallery</h1>'

  html += '<h2>Filter Tags</h2>'



  var exListStr = '' // <ul> containing the example list.
  exListStr += '<ul id="exList">'

  // this set contains all the tags used in the gallery.
  var allTags = {}
  allTags['all'] = true // we have a tag 'all', which means we show all the examples.

  // parse all the necessary information from the example files:
  var pfiles = files.map(function (file, i) {
    var id = 'liId' + i
    var li = `\n<li id="${id}">` // begin list item

    var link = file.replace('example', 'gallery') + '.html'

    function getEmbedTag (id) {
      return '<iframe width="332" height="187" src="https://www.youtube.com/embed/' +
        id +
      '?rel=0" frameborder="0" allowfullscreen" frameborder="0" allowfullscreen></iframe>'
    }

    //
    // Inject link to image or video below:

    li += '<a href="' + link + '">'
    var img = imgName(file)

    s = file.replace('example/', '').replace('.js', '')

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

    //
    // Done injecting link to image or video.
    //

    // inject example title.
    li += '<a href="' + link + '"><h2>' + file.replace('example/', '') + '</h2></a>'

    //
    // Next, parse the example file, and extract the tags and the example description.

    var fileSrc = fs.readFileSync(file) + ''
    var beg = fileSrc.search('/\\*')
    var end = fileSrc.search('\\*/')

    if (beg !== 0 || end === 0) {
      throw new Error(
        'The example ' + file +
          ' must begin with a description commment')
    }
    var raw = fileSrc.substring(beg + 2, end - 1)

    var tagsIndex = raw.indexOf('tags:')
    if (tagsIndex === -1) {
      throw new Error(
        'The example ' + file +
          ' must supply tags')
    }
    var begTagsIndex = tagsIndex + 5 // skip after the 'tags:' string.
    var endTagsIndex = raw.indexOf('\n', begTagsIndex)

    var tagsString = raw.substring(begTagsIndex, endTagsIndex)
    var tags = tagsString.split(',') // now actually parse the tags.

    // For good measure, normalize the tag strings: trim, and convert to lowercase.
    for (i = 0; i < tags.length; i++) {
      s = tags[i]
      s = s.trim().toLowerCase()

      // also, add to list of tags.
      if (!(s in allTags)) {
        allTags[s] = true
      }

      tags[i] = s
    }

    // after the tags is the description comment.
    var desc = raw.substring(endTagsIndex).trim()
    li += desc

    // run example link
    li += '<p>' +
      '<a href="' +
      link +
      '">Run Example</a>' +
      '</p>'

    // source code link
    li += '<p>' +
      '<a href="' +
      'https://github.com/mikolalysenko/regl/blob/gh-pages/' + file +
      '">Source Code</a>' +
      '</p>'

    // tag list
    li += '<p>' +
      '<b>Tags: </b>' + tags.join(', ') +
      '</p>'

    li += '</li>'

    return {li: li, tags: tags, id: id}
  })

  // next, we'll make sure to put the basic examples first in the list.
  var laterStr = ''
  for (i = 0; i < pfiles.length; i++) {
    var pfile = pfiles[i]
    if (pfile.tags.indexOf('basic') >= 0) {
      exListStr += pfile.li + '\n'  // add basic first.
    } else {
      laterStr += pfile.li + '\n' // add later.
    }
  }
  exListStr += laterStr
  exListStr += '</ul>' // list of examples done.

  // now create a list that can be used to select tags.
  var tagList = ''
  tagList += '<ul id="tagList">'
  tagList += Object.keys(allTags).map(function (tag) {
    return `<li id="id_${tag}" class="unselected"><a href="#" onclick="selectTag('${tag}');return false;">${tag}</a></li>`
  }).join('\n')
  tagList += '</ul>'

  // now actually add the created html code of the two lists.
  html += tagList
  html += exListStr
  html += '</div>'

  // collect the list of tags and ids.
  var json = []
  for (i = 0; i < pfiles.length; i++) {
    var p = pfiles[i]
    json.push({tags: p.tags, id: p.id})
  }

  // next, we inject some javascript code that is used to implement the tag-filtering system.
  html += '<script>'

  // inject two variables into the code.
  html += 'var json = ' + JSON.stringify(json) + '\n'
  html += 'var allTags = ' + JSON.stringify(allTags)

  html += `
  function selectTag(tag) {
    for (var i = 0; i < json.length; i++) {
      var p = json[i]

      var elem = document.getElementById(p.id)

      if (tag === 'all') { // all tags pass!
        elem.style.display = 'list-item';
      } else { // else, do tag filtering.
        if (p.tags.indexOf(tag) >= 0) {
          elem.style.display = 'list-item';
        } else {
          elem.style.display = 'none';
        }
      }
      elem.style.lineHeight = '30px'
    }

    Object.keys(allTags).map(function (itag) {
      document.getElementById('id_' + itag).className = 'unselected'
    })
    document.getElementById('id_' + tag).className = 'selected'

  }`
  html += 'selectTag("all")'

  html += '</script>'

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
      b.transform(es2020)
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
