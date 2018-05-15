var PENDING = '#FCD62A'
var FAILING = '#F28E82'
var PASSING = '#8ECA6C'

var originalLog = console.log
var container = document.body.appendChild(document.createElement('pre'))

var failed = 0
var passed = 0

document.body.style.backgroundColor = PENDING

var pendingLines = []
var pendingRaf = null

console.log = function (line) {
  if (typeof line !== 'string') {
    line = line + ''
  }
  if (line.indexOf('ok') === 0) {
    passed += 1
  } else if (line.indexOf('not ok') === 0) {
    failed += 1
  }
  pendingLines.push(line)
  originalLog.apply(console, arguments)

  if (!pendingRaf) {
    pendingRaf = window.requestAnimationFrame(updateDOM)
  }
}

function updateDOM () {
  var s = document.body.style
  if (failed > 0) {
    if (s.backgroundColor !== FAILING) {
      s.backgroundColor = FAILING
    }
  } else if (passed > 0 && failed === 0) {
    if (s.backgroundColor !== PASSING) {
      s.backgroundColor = PASSING
    }
  }
  container.appendChild(document.createTextNode(pendingLines.join('\n') + '\n'))
  pendingLines.length = 0
  pendingRaf = null
}

require('./index')
