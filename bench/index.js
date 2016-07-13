/* globals performance */
var CASES = require('./list')
var extend = require('../lib/util/extend')
var createREGL = require('../../regl')
var Chart = require('chart.js')
var gitCommits = require('git-commits');
var path = require('path');
var present = require('present');

const WIDTH = 384
const HEIGHT = 240
var regl
var isHeadless = false
var canvas
var gl

if (isHeadless) {
  var gl = require('gl')(WIDTH, HEIGHT)

} else {
  canvas = document.createElement('canvas')
  gl = canvas.getContext('webgl', {
    antialias: false,
    stencil: true,
    preserveDrawingBuffer: true
  })
  canvas.style.position = 'fixed'
  canvas.style.top = '0'
  canvas.style.right = '0'

  canvas.style.width = WIDTH + 'px'
  canvas.style.height = HEIGHT + 'px'
  canvas.width = WIDTH
  canvas.height = HEIGHT

  document.body.appendChild(canvas)

}

regl = createREGL(gl)


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
    regl.clear({
      color: [ 0, 0, 0, 0 ],
      depth: 1,
      stencil: 0
    })
    var start = present()//performance.now()
    procedure({tick: tick})
    timeSamples.push(present() - start)

    // dont have this in headless.
//    heapSamples.push(performance.memory.usedJSHeapSize)
  }

  return function run () {

    var i
    for (i = 0; i < warmupSamples; ++i) {
      regl.clear({
        color: [ 0, 0, 0, 0 ],
        depth: 1,
        stencil: 0
      })
      regl.updateTimer()

      procedure({tick: i})
    }

    timeSamples.length = 0
    heapSamples.length = 0

    for (i = 0; i < samples; i++) {
      regl.updateTimer()

      sample(i)
    }

    //    console.log("samples: ", timeSamples)
    return {
      n: timeSamples.length,
      time: analyze(timeSamples, formatTime)
//      space: analyze(heapSamples, formatMemory)
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

  var obj = CASES[caseName]

  var proc
  if(caseName === 'cube_webgl') {
    proc = obj.proc(gl, WIDTH, HEIGHT)
  } else {
    proc = obj.proc(regl)
  }

  var sample = benchmark(proc, obj.samples, obj.warmupSamples)

  var result

  result = button(caseName, function () {
    var bench = sample()
    result.text.innerText = 'n:' + bench.n + ', t:(' + bench.time + '),' //+ 'm:(' + bench.space + ')'
  })
  return result

})

//document.removeChild(document.documentElement);

/*
  var c =  document.getElementsByTagName("canvas")[0]
  //http://130.241.188.19:9966/
  document.body.removeChild(c);

  var p = document.createElement('p')
  p.innerHTML = json
  document.body.appendChild(p)
*/

/*
  clearn:100, t:(μ=10.3μs∓37.43μs, q=[5μs, 30μs, 310μs]), m:(μ=12.11Mb∓0b, q=[12.11Mb, 12.11Mb, 12.11Mb])
cuben:30000, t:(μ=12.24μs∓78.41μs, q=[10μs, 15μs, 9.18ms]), m:(μ=12.11Mb∓0b, q=[12.11Mb, 12.11Mb, 12.11Mb])
cube_webgln:30000, t:(μ=14.46μs∓88.63μs, q=[15μs, 15μs, 7.32ms]), m:(μ=12.11Mb∓0b, q=[12.11Mb, 12.11Mb, 12.11Mb])
  */
