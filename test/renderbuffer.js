var createContext = require('./util/create-context')
var createREGL = require('../../regl')
var tape = require('tape')

tape('renderbuffer parsing', function (t) {
  var gl = createContext(16, 16)
  var regl = createREGL(gl)

  function checkProperties (renderbuffer, props, prefix) {
    t.equals(renderbuffer._reglType, 'renderbuffer', prefix + ' regltype ok')

    var rbProps = renderbuffer._renderbuffer

    t.equals(rbProps.width, props.width, prefix + ' width')
    t.equals(rbProps.height, props.height, prefix + ' height')
    t.equals(rbProps.format, props.format, prefix + ' format')

    rbProps.bind()
    t.equals(gl.getParameter(gl.RENDERBUFFER_WIDTH), props.width, prefix + ' rb width')
    t.equals(gl.getParameter(gl.RENDERBUFFER_HEIGHT), props.width, prefix + ' rb height')
    t.equals(gl.getParameter(gl.RENDERBUFFER_INTERNAL_FORMAT), props.format, prefix + ' rb format')
  }

  checkProperties(
    regl.renderbuffer(),
    {
      width: 1,
      height: 1,
      format: gl.RGBA4
    },
    'empty')

  regl.destroy()
  t.end()
})
