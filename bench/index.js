/* globals performance */
var CASES = {
  clear: require('./clear')
}

var regl = require('../regl')()

var container = document.createElement('div')
Object.assign(container.style, {
  'position': 'absolute',
  'left': '5px',
  'top': '5px',
  'z-index': '10'
})

document.body.appendChild(container)

function button (text, onClick) {
  var result = document.createElement('a')
  result.text = text
  result.href = '#' + text
  result.addEventListener('click', onClick)

  var statNode = document.createElement('p')

  var buttonContainer = document.createElement('p')
  buttonContainer.appendChild(result)
  container.appendChild(buttonContainer)
  container.appendChild(statNode)

  return {
    link: result,
    text: statNode,
    container: buttonContainer
  }
}

Object.keys(CASES).map(function (caseName) {
  var result
  result = button(caseName, function () {
    var proc = CASES[caseName]
    var bench = benchmark(proc(regl), 5000, 500)
    result.text.innerHTML = JSON.stringify(bench)
  })
  return result
})

function analyze (samples) {
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

  return {
    n: m0,
    mean: mean,
    stddev: stddev,

    min: sorted[0],
    max: sorted[m0 - 1],
    median: sorted[m0 >> 1],
    p10: sorted[(0.1 * m0) | 0],
    p90: sorted[(0.9 * m0) | 0]
  }
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

  var warmStop = warmup + performance.now()
  while (performance.now() < warmStop) {
    sample()
  }

  timeSamples.length = 0
  heapSamples.length = 0

  var stop = duration + performance.now()
  while (performance.now() <= stop) {
    sample()
  }

  return {
    time: analyze(timeSamples),
    space: analyze(heapSamples)
  }
}
