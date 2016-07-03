// This example demonstrates how to use batch mode commands
//
// To use a command in batch mode, we pass in an array of objects.  Then
// the command is executed once for each object in the array.

// As usual, we start by creating a full screen regl object
const regl = require('../regl')()
const vec2 = require('gl-vec2')

var mouseY = null

require('mouse-change')(function(buttons, x, y) {
  mouseY = y;
})

function Aabb (c, r) {
  // Aaab center.
  this.c = vec2.fromValues(c[0], c[1])

  // Aabb radiuses(halfwidths)
  this.r = vec2.fromValues(r[0], r[1])
}

function clamp(value, min, max) {
  return min < max
    ? (value < min ? min : value > max ? max : value)
    : (value < max ? max : value > min ? min : value)
}

//443pong.js [sm]:31 x0 = -0.0007134545594453812 x1 = -0.09928654320538044 y0 = -0.19452300108969212 y1 = -0.14547700993716717
function detectAabbCollision(a, b, r) {

  var x0 = +(a.c[0] - b.c[0]) - (a.r[0] + b.r[0])
  var x1 = -(a.c[0] - b.c[0]) - (a.r[0] + b.r[0])
  if (x0 > 0.0 || x1 > 0.0) return false

  var y0 = +(a.c[1] - b.c[1]) - r*(a.r[1] + b.r[1])
  var y1 = -(a.c[1] - b.c[1]) - r*(a.r[1] + b.r[1])
  if (y0 > 0.0 || y1 > 0.0) return false

  // a and b overlap on all axes. So we have collision.
  // Now we need to find the contact normal.

  if(x0 > x1 && x0 > y0 && x0 > y1) {
    return vec2.fromValues(-1.0, 0.0);
  }
  if(x1 > x0 && x1 > y0 && x1 > y1) {
    return vec2.fromValues(+1.0, 0.0);
  }

  if(y0 > x0 && y0 > x1 && y0 > y1) {
    return vec2.fromValues(0.0, -1.0);
  }
  if(y1 > x0 && y1 > x1 && y1 > y0) {
    return vec2.fromValues(0.0, +1.0);
  }


  console.log("WTF");


  return [];
}

function reflect (v, n) {
  var scratch = [0.0, 0.0]

  var cr = 1.1
  return vec2.subtract(v, v, vec2.scale(scratch, n, (1.0 + cr) * vec2.dot(v, n)))
}

var playerPaddle = new Aabb([-0.9, 0.0], [0.03, 0.15])
var aiPaddle = new Aabb([+0.9, 0.0], [0.03, 0.15])

var midline = new Aabb([+0.0, 0.0], [0.005, 1.0])
var ball = new Aabb([+0.4, 0.5], [0.02, 0.02])

var ballVel = vec2.fromValues(0.2, 0.2)

// Next we create our command
const drawAabb = regl({
  frag: `
    precision mediump float;
    void main() {
      gl_FragColor = vec4(1.0);
    }`,
  vert: `

  precision mediump float;
  attribute vec2 position;

  uniform vec2 offset;
  uniform vec2 scale;

  uniform float viewportWidth;
  uniform float viewportHeight;

  void main() {

    // windows ratio scaling factor.
    float ratioScale = (viewportWidth) / (viewportHeight);

    gl_Position = vec4(position.xy * scale * vec2(1.0, ratioScale) + offset, 0, 1);
  }`,

  attributes: {
    position: [
      [-1, -1], [+1, +1], [-1, +1],
      [-1, -1], [+1, -1], [+1, +1]
    ]
  },

  uniforms: {
    offset: (_, props) => props.aabb.c,
    scale: (_, props) => props.aabb.r,
    viewportWidth: regl.context('viewportWidth'),
    viewportHeight: regl.context('viewportHeight')

  },
  depth: {
    enable: false
  },
  cull: {
    enable: true
  },

  count: 6
})

regl.frame(function ({deltaTime, viewportWidth, viewportHeight, pixelRatio}) {
  regl.clear({
    color: [0, 0, 0, 1]
  })

  var r = viewportWidth / viewportHeight
  //
  // BEGIN GAME LOGIC
  //

  // player paddle follows the mouse
  if(mouseY !== null) {
    var a = 1.0 - (mouseY * pixelRatio) / viewportHeight
    playerPaddle.c[1] = clamp(-1.0 + 2.0 * (a), -1 + playerPaddle.r[1]*r, +1 - playerPaddle.r[1]*r )
  }

  // AI paddle follows the ball.
  var dist = (ball.c[1] - aiPaddle.c[1])
  aiPaddle.c[1] = clamp(aiPaddle.c[1] + dist*deltaTime*1.9, -1 + playerPaddle.r[1]*r, +1 - playerPaddle.r[1]*r )

  // Move ball.
  vec2.scaleAndAdd(ball.c, ball.c, ballVel, deltaTime)

  // Handle ball collision north wall
  if ((ball.c[1] + r*ball.r[1]) >= 1.0) {
    ballVel = reflect(ballVel, vec2.fromValues(0.0, -1.0))
  }

  // Handle ball collision east wall
  if ((ball.c[0] + ball.r[0]) >= 1.0) {
    ballVel = reflect(ballVel, vec2.fromValues(-1.0, 0.0))
  }

  // Handle ball collision south wall
  if ((ball.c[1] - r*ball.r[1]) <= -1.0) {
    ballVel = reflect(ballVel, vec2.fromValues(0.0, 1.0))
  }

  // Handle ball collision west wall
  if ((ball.c[0] - ball.r[0]) <= -1.0) {
    ballVel = reflect(ballVel, vec2.fromValues(1.0, 0.0))
  }

  // handle ball and AI paddle collision
  var result = detectAabbCollision(aiPaddle, ball, r);
  if(result !== false) {
    var n = result; // if collision, the return value is the contact normal.
    ballVel = reflect(ballVel, n)
  }

  // handle ball and player paddle collision
  result = detectAabbCollision(playerPaddle, ball, r);
  if(result !== false) {
    n = result; // if collision, the return value is the contact normal.
    ballVel = reflect(ballVel, n)
  }

  //
  // END GAME LOGIC
  //

  //
  // Render everything.
  //

  drawAabb([
    { aabb: playerPaddle },
    { aabb: aiPaddle },
    { aabb: midline },
    { aabb: ball }
  ])
})
