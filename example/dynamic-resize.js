/*
  tags: resizing

  <p> This example is a demonstration of automatic resizing when rendering into a div that dynamically changes its size. </p>
  <p> NOTE: this will only work if your browser supports ResizeObserver. Otherwise it falls back to detecting window resizes. </p>
 */

// Lets inject into a div that is resized dynamically
const container = document.createElement('div')
container.style.width = '100%'
container.style.height = '100vh'
container.style.border = '10px solid green'
container.style.margin = '10px'
document.body.appendChild(container)
document.body.style.margin = '0'

// on mouse move make div different size
window.addEventListener('mousemove', ev => {
  container.style.width = ev.clientX.toFixed(0) + 'px'
  container.style.height = ev.clientY.toFixed(0) + 'px'
})

const regl = require('../regl')({ container })

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
