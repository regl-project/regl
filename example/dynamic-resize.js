/*
  tags: resizing

  <p> This example is a demonstration of automatic resizing when rendering into a div that dynamically changes its size. </p>
  <p> NOTE: this will only work if your browser supports ResizeObserver. Otherwise it falls back to detecting window resizes. </p>
 */

// Lets inject into a div that is resized dynamically
const div = document.createElement('div')
div.style.width = '100%'
div.style.height = '100vh'
document.body.appendChild(div)
document.body.style.margin = '0'

const regl = require('../regl')({
  container: div
})

const drawcmd = regl({

  // In a draw call, we can pass the shader source code to regl
  frag: `
  precision mediump float;
  uniform vec4 color;
  void main () {
    gl_FragColor = color;
  }`,

  vert: `
  precision mediump float;
  attribute vec2 position;
  void main () {
    gl_Position = vec4(position, 0, 1);
  }`,

  attributes: {
    position: [
      [-1, 0],
      [0, -1],
      [1, 1]
    ]
  },

  uniforms: {
    color: [1, 0, 0, 1]
  },

  count: 3
})

function draw () {
  regl.poll()
  regl.clear({
    color: [0, 0, 0, 1],
    depth: 1
  })
  drawcmd()
}

regl.frame(() => draw())

// on mouse move make div different size
window.addEventListener('mousemove', ev => {
  div.style.width = ev.clientX.toFixed(0) + 'px'
  div.style.height = ev.clientY.toFixed(0) + 'px'
})
