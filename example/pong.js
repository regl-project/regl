/*
  tags: basic, game

  <p> In this example, we implement a simple pong game. </p>

  <p> The demonstratred features are: batching, and how you can
 implement a game loop with regl. </p>

 <p> Note that the ball will probably go through the paddles
 once it goes really fast. So the game could be a lot more stable.
 But in order to keep the example short and readable,
 we have refrained from fixing this.
 </p>
*/
/* global AudioContext */

const regl = require('../regl')()
const vec2 = require('gl-vec2')

// we keep track of the mouse y-coordinate.
var mouseY = null
require('mouse-change')(function (buttons, x, y) {
  mouseY = y
})

function Aabb (c, r) {
  // Aaab center.
  this.c = vec2.fromValues(c[0], c[1])

  // Aabb radiuses(halfwidths)
  this.r = vec2.fromValues(r[0], r[1])
}

// Below are all the global objects.

var playerPaddle = new Aabb([-0.9, 0.0], [0.03, 0.15])
var aiPaddle = new Aabb([+0.9, 0.0], [0.03, 0.15])

var midline = new Aabb([+0.0, 0.0], [0.005, 1.0])

// we set all ball properties in resetBall()
var ball = new Aabb([0.0, 0.0], [0.0, 0.0]) // set velocity
var ballVel = vec2.fromValues(0.0, 0.0)

const context = new AudioContext()
const volume = 0.1

function clamp (value, min, max) {
  return min < max
    ? (value < min ? min : value > max ? max : value)
    : (value < max ? max : value > min ? min : value)
}

function detectAabbCollision (a, b, r) {
  var x0 = +(a.c[0] - b.c[0]) - (a.r[0] + b.r[0])
  var x1 = -(a.c[0] - b.c[0]) - (a.r[0] + b.r[0])
  if (x0 > 0.0 || x1 > 0.0) return false

  var y0 = +(a.c[1] - b.c[1]) - r * (a.r[1] + b.r[1])
  var y1 = -(a.c[1] - b.c[1]) - r * (a.r[1] + b.r[1])
  if (y0 > 0.0 || y1 > 0.0) return false

  // a and b overlap on all axes. So we have collision.
  // Now we need to find the contact normal.

  if (x0 > x1 && x0 > y0 && x0 > y1) {
    return vec2.fromValues(-1.0, 0.0)
  }
  if (x1 > x0 && x1 > y0 && x1 > y1) {
    return vec2.fromValues(+1.0, 0.0)
  }

  if (y0 > x0 && y0 > x1 && y0 > y1) {
    return vec2.fromValues(0.0, -1.0)
  }
  if (y1 > x0 && y1 > x1 && y1 > y0) {
    return vec2.fromValues(0.0, +1.0)
  }
}

function getRand (min, max) {
  return Math.random() * (max - min) + min
}

function resetBall (playerWon) {
  ball.c = [+0.0, 0.0]
  ball.r = [0.02, 0.02]

  var speed = getRand(0.3, 0.4)
  const RANGE = 1.2

  var theta
  if (!playerWon) {
    theta = getRand(-RANGE, +RANGE)
    ballVel = [speed * Math.cos(theta), speed * Math.sin(theta)]
  } else {
    theta = getRand(Math.PI - RANGE, Math.PI + RANGE)
    ballVel = [speed * Math.cos(theta), speed * Math.sin(theta)]
  }
}

// create audio buffer that lasts `length` seconds, and `createAudioDataCallback`
// will will fill each of the two channels of the buffer with audio data.
function createAudioBuffer (length, createAudioDataCallback) {
  var channels = 2
  var frameCount = context.sampleRate * length
  var audioBuffer = context.createBuffer(channels, frameCount, context.sampleRate)

  for (var channel = 0; channel < channels; channel++) {
    var channelData = audioBuffer.getChannelData(channel)
    createAudioDataCallback(channelData, frameCount)
  }
  return audioBuffer
}

function playAudioBuffer (audioBuffer) {
  // Appearently, you have to create a new AudioBufferSourceNode
  // every time you want to play a sound again.
  var source = context.createBufferSource()
  source.buffer = audioBuffer
  source.connect(context.destination)
  source.start()
}

// When the ball collides with something, we alternate between playing two sound effects
// Both sound effects are just simple square waves.
var hitAudioBuffers = []

hitAudioBuffers[0] =
    createAudioBuffer(0.15,
                      (channelData, frameCount) => {
                        var current = volume
                        for (var i = 0; i < frameCount; i++) {
                          if (i % 100 === 0) {
                            current *= -1.0
                          }
                          channelData[i] = current * (1.0 - i / frameCount)
                        }
                      })

hitAudioBuffers[1] =
    createAudioBuffer(0.15,
                      (channelData, frameCount) => {
                        var current = volume
                        for (var i = 0; i < frameCount; i++) {
                          if (i % 150 === 0) {
                            current *= -1.0
                          }
                          channelData[i] = current * (1.0 - i / frameCount)
                        }
                      })

// We play this sound when the player wins.
// It is just a square wave, with some simple frequency modulation.
var winAudioBuffer =
    createAudioBuffer(0.4,
                      (channelData, frameCount) => {
                        var current = volume
                        var period = 50
                        for (var i = 0; i < frameCount; i++) {
                          if (i % period === 0) {
                            current *= -1.0
                          }
                          if (i % 600 === 0) {
                            period -= 2
                          }
                          var a = (i / frameCount)
                          channelData[i] = current * (1.0 - a)
                        }
                      })

// We play this sound when the player loses.
// It is just white noise.
var loseAudioBuffer =
    createAudioBuffer(0.5,
                      (channelData, frameCount) => {
                        var current = getRand(-volume, +volume)
                        for (var i = 0; i < frameCount; i++) {
                          if (i % 150 === 0) {
                            current = getRand(-volume, +volume)
                          }
                          channelData[i] = current * (1.0 - i / frameCount)
                        }
                      })

// compute the reflection vector for an incident vector `v` against
// a surface with the normal `n`.
// but note that the kinetic energy is slightly increased
// with the reflection
var iHitAudioBuffer = 0
function reflect (v, n) {
  var scratch = [0.0, 0.0]

  // alternatingly, play sound effect.
  playAudioBuffer(hitAudioBuffers[iHitAudioBuffer])
  iHitAudioBuffer = (iHitAudioBuffer + 1) % 2

  // if it were perfect elastic collison, this would be 1.0
  // But we want the ball to become faster with every bounce,
  // so we set it to a slightly higher value.
  var cr = 1.1
  return vec2.subtract(v, v, vec2.scale(scratch, n, (1.0 + cr) * vec2.dot(v, n)))
}

// This command draws an Aabb as a white rectangle.
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
    float r = (viewportWidth) / (viewportHeight);
    gl_Position = vec4(position.xy * scale * vec2(1.0, r) + offset, 0, 1);
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

// initialize game.
resetBall(true)

regl.frame(function ({viewportWidth, viewportHeight, pixelRatio}) {
  regl.clear({
    color: [0, 0, 0, 1]
  })

  const deltaTime = 0.017

  // We use this ratio r in order to make sure that all renderered
  // objects keep their proportions on different screen sizes
  // Note that we made the assumption that the screen has greater width
  // than height!
  // And we can't just calculate this value once and then cache it, because the
  // user may resize the browser window while playing!
  var r = viewportWidth / viewportHeight

  //
  // BEGIN GAME LOGIC
  //

  var minY = -1 + playerPaddle.r[1] * r
  var maxY = +1 - playerPaddle.r[1] * r
  // player paddle follows the mouse
  if (mouseY !== null) {
    // this maps the mouse y-coordinates to the range [0,1]
    // we must take the pixel ratio in to account, so that it handles
    // retina displays and such.
    var a = 1.0 - (mouseY * pixelRatio) / viewportHeight
    // Map from [0,1] to our coordinates system(which is [-1, -1])
    // also, clamp to ensure that the paddle does not move outside the screen boundaries.
    playerPaddle.c[1] = clamp(-1.0 + 2.0 * (a), minY, maxY)
  }

  // AI paddle follows the ball.
  var dist = (ball.c[1] - aiPaddle.c[1])
  aiPaddle.c[1] = clamp(aiPaddle.c[1] + dist * deltaTime * 1.9, minY, maxY)

  // Move ball.
  vec2.scaleAndAdd(ball.c, ball.c, ballVel, deltaTime)

  // Handle ball collision north wall
  if ((ball.c[1] + r * ball.r[1]) >= 1.0) {
    ballVel = reflect(ballVel, vec2.fromValues(0.0, -1.0))
  }

  // Handle ball collision east wall
  if ((ball.c[0] + ball.r[0]) >= 1.0) {
    playAudioBuffer(winAudioBuffer)
    // player win. Reset ball
    resetBall(true)
  }

  // Handle ball collision south wall
  if ((ball.c[1] - r * ball.r[1]) <= -1.0) {
    ballVel = reflect(ballVel, vec2.fromValues(0.0, 1.0))
  }

  // Handle ball collision west wall
  if ((ball.c[0] - ball.r[0]) <= -1.0) {
    playAudioBuffer(loseAudioBuffer)
    // player loss. Reset ball.
    resetBall(false)
  }

  // handle ball and AI paddle collision
  var result = detectAabbCollision(aiPaddle, ball, r)
  if (result !== false) {
    var n = result // if collision, the return value is the contact normal.
    ballVel = reflect(ballVel, n)
  }

  // handle ball and player paddle collision
  result = detectAabbCollision(playerPaddle, ball, r)
  if (result !== false) {
    n = result // if collision, the return value is the contact normal.
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
