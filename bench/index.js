/* globals performance */
var CASES = require('./list')
var extend = require('../lib/util/extend')
var createREGL = require('../../regl')
var Chart = require('chart.js')

var canvas = document.createElement('canvas')
var gl = canvas.getContext('webgl', {
  antialias: false,
  stencil: true,
  preserveDrawingBuffer: true
})
canvas.style.position = 'fixed'
canvas.style.top = '0'
canvas.style.right = '0'

// TODO: we should take the pixel ratio into account here.
canvas.style.width = '384px'
canvas.style.height = '240px'
canvas.width = 384
canvas.height = 240

document.body.appendChild(canvas)

var regl = createREGL(gl)

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

function benchmark (procedure, samples, warmupSamples) {
  var timeSamples = []
  var heapSamples = []

  function sample (tick) {
    var start = performance.now()
    procedure({a: tick})
    timeSamples.push(performance.now() - start)
    heapSamples.push(performance.memory.usedJSHeapSize)
  }

  return function run () {
    regl.clear({
      color: [ 0, 0, 0, 0 ],
      depth: 1,
      stencil: 0
    })

    var i
    for (i = 0; i < warmupSamples; ++i) {
      procedure({a: i})
    }

    timeSamples.length = 0
    heapSamples.length = 0

    for (i = 0; i < samples; i++) {
      regl.clear({
        color: [ 0, 0, 0, 0 ],
        depth: 1,
        stencil: 0
      })
      sample(i)
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
  document.body.appendChild(buttonContainer)

  return {
    link: result,
    text: statNode,
    container: buttonContainer
  }
}

Object.keys(CASES).map(function (caseName) {
  var result

  var obj = CASES[caseName]
  var proc = obj.proc(regl)

  var sample = benchmark(proc, obj.samples, obj.warmupSamples)

  result = button(caseName, function () {
    var bench = sample()
    result.text.innerText = 'n:' + bench.n + ', t:(' + bench.time + '), m:(' + bench.space + ')'
  })
  return result
})
/*
var W = 640
var H = 288
var chartDiv = document.createElement('div')
chartDiv.width = W
chartDiv.height = H
chartDiv.style.cssText = 'padding: 0; margin: auto; display: block; width: ' + W + 'px; height: ' + H + 'px;'

var chartCanvas = document.createElement('canvas')
chartDiv.appendChild(chartCanvas)

document.body.appendChild(chartDiv)

// padring-right
var ctx = chartCanvas

var myChart = new Chart(ctx, {
    type: 'line',
    data: {
        datasets: [{
            label: 'Scatter Dataset',
            data: [{
                x: -10,
                y: 0
            }, {
                x: 0,
                y: 10
            }, {
                x: 10,
                y: 5
            }]
        }]
    },
    options: {
        scales: {
            xAxes: [{
                type: 'time',
                time: {
                    displayFormats: {
                        quarter: 'MMM YYYY'
                    }
                }
            }]
        }
    }
});;
*/
