// Context and canvas creation helper functions
/*globals HTMLElement,WebGLRenderingContext*/

var check = require('./check')
var extend = require('./extend')

function createCanvas (element, options) {
  var canvas = document.createElement('canvas')
  var args = getContext(canvas, options)

  extend(canvas.style, {
    border: 0,
    margin: 0,
    padding: 0,
    top: 0,
    left: 0
  })
  element.appendChild(canvas)

  if (element === document.body) {
    canvas.style.position = 'absolute'
    extend(element.style, {
      margin: 0,
      padding: 0
    })
  }

  var scale = +args.options.pixelRatio
  function resize () {
    var w = window.innerWidth
    var h = window.innerHeight
    if (element !== document.body) {
      var bounds = element.getBoundingClientRect()
      w = bounds.right - bounds.left
      h = bounds.top - bounds.bottom
    }
    canvas.width = scale * w
    canvas.height = scale * h
    extend(canvas.style, {
      width: w + 'px',
      height: h + 'px'
    })
  }

  window.addEventListener('resize', resize, false)

  var prevDestroy = args.options.onDestroy
  args.options = extend(extend({}, args.options), {
    onDestroy: function () {
      window.removeEventListener('resize', resize)
      element.removeChild(canvas)
      prevDestroy && prevDestroy()
    }
  })

  resize()

  return args
}

function getContext (canvas, options) {
  var glOptions = options.glOptions || {}

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
    options: extend({
      pixelRatio: window.devicePixelRatio
    }, options)
  }
}

module.exports = function parseArgs (args) {
  if (typeof document === 'undefined' ||
      typeof HTMLElement === 'undefined') {
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
        options: extend({
          pixelRatio: 1
        }, options)
      }
    } else {
      options = args[0]
    }
  }

  if (element.nodeName && element.nodeName.toUpperCase() === 'CANVAS') {
    return getContext(element, options)
  } else {
    return createCanvas(element, options)
  }
}
