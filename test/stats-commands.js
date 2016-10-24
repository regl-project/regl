var createContext = require('./util/create-context')
var createREGL = require('../../regl')
var tape = require('tape')

tape('stats - command basics', function (t) {
  var gl = createContext(3, 3)
  var regl = createREGL(gl)

  function createCommand (vert, frag, value) {
    return {
      'const': regl({
        vert: vert,
        frag: frag,
        profile: value,
        count: 0
      }),
      'context': regl({
        vert: vert,
        frag: frag,
        context: { 'profile': value },
        profile: value,
        count: 0
      }),
      'context - dynamic': regl({
        vert: vert,
        frag: frag,
        context: { profile: regl.prop('profile') },
        profile: value,
        count: 0
      }),
      'prop': regl({
        vert: vert,
        frag: frag,
        profile: regl.prop('profile'),
        count: 0
      }),
      'this': regl({
        vert: vert,
        frag: frag,
        profile: regl.this('profile'),
        count: 0
      })
    }
  }

  var vert = [
    'void main() {',
    '  gl_Position = vec4(0, 0, 0, 1);',
    '}'
  ].join('\n')

  var frag = [
    'void main () {',
    '  gl_FragColor = vec4(1, 1, 1, 1);',
    '}'
  ].join('\n')

  function testProfRan (cmd, props, scope, msg) {
    var start = Date.now()
    var cpuTime = cmd.stats.cpuTime
    var prevCount = cmd.stats.count
    var count = Array.isArray(props) ? props.length : 1
    var obj = props[0] || props
    if (scope) {
      cmd.call(obj, props, function () {})
    } else {
      cmd.call(obj, props)
    }
    var end = Date.now()
    var elapsed = (end - start) + 1
    t.ok(
      cmd.stats.cpuTime >= cpuTime && cmd.stats.cpuTime <= elapsed + cpuTime, msg + 'cpu time ' + cmd.stats.cpuTime + ' in range [' + cpuTime + ',' + (elapsed + cpuTime) + ']')
    t.equals(cmd.stats.count, prevCount + count, msg + ' count ok')
  }

  function testProfSkip (cmd, props, scope, msg) {
    var cpuTime = cmd.stats.cpuTime
    var prevCount = cmd.stats.count
    var obj = props[0] || props
    if (scope) {
      cmd.call(obj, props, function () {})
    } else {
      cmd.call(obj, props)
    }
    t.equals(cmd.stats.cpuTime, cpuTime, msg + ' cpu time ok')
    t.equals(cmd.stats.count, prevCount, msg + ' count ok')
  }

  function testProf (cmd, props, scope, msg) {
    if (Array.isArray(props) ? props[0].profile : props.profile) {
      testProfRan(cmd, props, scope, msg)
    } else {
      testProfSkip(cmd, props, scope, msg)
    }
  }

  for (var shaderDynamic = 0; shaderDynamic < 2; ++shaderDynamic) {
    for (var value = 0; value < 2; ++value) {
      var commands = createCommand(
        vert,
        shaderDynamic ? regl.prop('frag') : frag,
        !!value)
      var prefix =
        (shaderDynamic ? 'dyn shader,' : '') +
        (value ? 'profile on' : 'profile off') + ':'
      Object.keys(commands).forEach(function (name) {
        var pname = prefix + name
        var cmd = commands[name]
        var props = {
          frag: frag,
          profile: !!value
        }
        testProf(cmd, props, false, pname + 'draw')
        testProf(cmd, [props], false, pname + 'batch')
        testProf(cmd, [props, props], false, pname + 'batch x 2')
        testProf(cmd, props, true, pname + 'scope')
        testProf(cmd, [props], true, pname + 'scope-batch')
        testProf(cmd, [props, props], true, pname + 'scope-batch x 2')
      })
    }
  }

  regl.destroy()
  t.equals(gl.getError(), 0, 'error ok')
  createContext.destroy(gl)
  t.end()
})
