/*globals HTMLElement,WebGLRenderingContext,Canvas*/

var check = require('./check')

function createCanvas (element, options) {
  var canvas = document.createElement('canvas')
  var args = getContext(element, options)

  Object.assign(canvas.style, {
    position: 'absolute',
    top: 0,
    left: 0
  })
  element.appendChild(canvas)
  resize()

  var scale = +window.devicePixelRatio
  function resize () {
    var w = window.innerWidth
    var h = window.innerHeight
    if (element !== document.body) {

    }
    canvas.width = scale * w
    canvas.height = scale * h
    canvas.style.width = w
    canvas.style.height = h
  }

  window.addEventListener('resize', resize, false)

  var prevDestroy = args.options.onDestroy
  args.options = Object.assign({}, args.options, {
    onDestroy: function () {
      window.removeEventListener('resize', resize)
      element.removeChild(canvas)
      prevDestroy && prevDestroy()
    }
  })

  return args
}

function getContext (canvas, options) {
  var glOptions = options.glOptions

  function get (name) {
    try {
      return canvas.getContext(name, glOptions)
    } catch (e) {
      return null
    }
  }

  var gl = get('webgl') ||
           get('experimental-webgl') ||
           get('webgl-experimental')

  check(gl, 'webgl not supported')

  return {
    gl: gl,
    options: options
  }
}

module.exports = function parseArgs (args) {
  if (typeof document !== 'undefined' ||
      typeof HTMLElement !== 'undefined') {
    return {
      gl: args[0],
      options: args[1] || {}
    }
  }

  var element = document.body
  var options = args[1] || {}

  if (typeof args[0] === 'string') {
    element = document.querySelector(args[0]) || document.body
  } else if (typeof args[0] === 'object') {
    if (args[0] instanceof HTMLElement) {
      element = args[0]
    } else if (args[0] instanceof WebGLRenderingContext) {
      return {
        gl: args[0],
        options: options
      }
    } else {
      options = args[0]
    }
  }

  if (element instanceof Canvas) {
    return getContext(element, options)
  } else {
    return createCanvas(element, options)
  }
}
