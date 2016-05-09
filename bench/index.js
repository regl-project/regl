/* globals performance */
var CASES = require('./list')
var extend = require('../lib/util/extend')
var regl = require('../regl')()

var container = document.createElement('div')
extend(container.style, {
  'position': 'absolute',
  'left': '0px',
  'top': '0px',
  'height': '100%',
  'width': '100%',
  'overflow': 'auto',
  'padding': '15px',
  'z-index': '10'
})

var header = document.createElement('h2')
header.innerHTML = '<u>benchmarks</u>'
container.appendChild(header)

document.body.appendChild(container)

function analyze (samples, fmt) {
  // Moments
  var m0 = samples.length
  var m1 = 0.0
  var m2 = 0.0
  for (var i = 0; i < m0; ++i) {
    var x = samples[i]
    m1 += x
    m2 += Math.pow(x, 2)
  }

  // Descriptive stats
  var mean = m1 / m0
  var stddev = Math.sqrt(m2 / m0 - Math.pow(mean, 2))

  // Order stats
  var sorted = samples.slice().sort(function (a, b) {
    return a - b
  })

  return [
    'μ=', fmt(mean), '∓', fmt(stddev),
    ', q=[',
    fmt(sorted[(0.5 * m0) | 0]), ', ',
    fmt(sorted[(0.95 * m0) | 0]), ', ',
    fmt(sorted[m0 - 1]), ']'
  ].join('')
}

function sigfigs (x) {
  var xr = Math.round(x * 100)
  return (xr / 100)
}

function formatTime (x) {
  if (x > 1000) {
    return sigfigs(x / 1000.0) + 's'
  }
  if (x > 1) {
    return sigfigs(x) + 'ms'
  }
  return sigfigs(x * 1e3) + 'μs'
}

function formatMemory (x) {
  if (x > (1 << 20)) {
    return sigfigs(x / (1 << 20)) + 'Mb'
  }
  if (x > (1 << 10)) {
    return sigfigs(x / (1 << 10)) + 'kb'
  }
  return x + 'b'
}

function benchmark (procedure, duration, warmup) {
  var timeSamples = []
  var heapSamples = []

  function sample () {
    var start = performance.now()
    procedure()
    timeSamples.push(performance.now() - start)
    heapSamples.push(performance.memory.usedJSHeapSize)
  }

  return function run () {
    regl.clear({
      color: [ 0, 0, 0, 0 ],
      depth: 1,
      stencil: 0
    })
    for (var i = 0; i < warmup; ++i) {
      procedure()
    }

    timeSamples.length = 0
    heapSamples.length = 0

    var stop = duration + performance.now()
    while (performance.now() <= stop) {
      sample()
    }

    return {
      n: timeSamples.length,
      time: analyze(timeSamples, formatTime),
      space: analyze(heapSamples, formatMemory)
    }
  }
}

function button (text, onClick) {
  var result = document.createElement('a')
  result.text = text
  result.href = '#' + text
  result.addEventListener('click', onClick)

  var statNode = document.createElement('h5')
  statNode.innerText = 'n:0, t:(---), m:(---)'
  extend(statNode.style, {
    'margin': '4px',
    'display': 'inline'
  })

  var buttonContainer = document.createElement('div')
  buttonContainer.appendChild(result)
  buttonContainer.appendChild(statNode)
  container.appendChild(buttonContainer)

  return {
    link: result,
    text: statNode,
    container: buttonContainer
  }
}

Object.keys(CASES).map(function (caseName) {
  var result
  var proc = CASES[caseName]
  var sample = benchmark(proc(regl), 1000, 10)
  result = button(caseName, function () {
    var bench = sample()
    result.text.innerText = 'n:' + bench.n + ', t:(' + bench.time + '), m:(' + bench.space + ')'
  })
  return result
})
