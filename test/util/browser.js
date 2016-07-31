var colors = {
  PENDING: '#FCD62A',
  FAILING: '#F28E82',
  PASSING: '#8ECA6C'
}

var originalLog = console.log
var container = document.body.appendChild(document.createElement('pre'))

var failed = 0
var passed = 0

function updateStyle () {
  var s = document.body.style
  if (failed > 0) {
    if (s.backgroundColor !== colors.FAILING) {
      s.backgroundColor = colors.FAILING
    }
  } else if (passed > 0 && failed === 0) {
    if (s.backgroundColor !== colors.PASSING) {
      s.backgroundColor = colors.PASSING
    }
  } else {
    if (s.backgroundColor !== colors.PENDING) {
      s.backgroundColor = colors.PENDING
    }
  }
}

console.log = function (line) {
  if (typeof line !== 'string') {
    line = line + ''
  }
  if (line.indexOf('ok') === 0) {
    passed += 1
  } else if (line.indexOf('not ok') === 0) {
    failed += 1
  }
  updateStyle()
  originalLog.apply(console, arguments)
  container.appendChild(document.createTextNode(line + '\n'))
}

updateStyle()
require('./index')
