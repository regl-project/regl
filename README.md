# regl

This repo is an attempt at building some new functional abstractions for working with WebGL.  It is still pretty experimental right now, so expect things to change a lot in the near future.  If you want to know more about why I am writing this thing, take a look at the [rationale](RATIONALE.md).

## Some sketches

In regl, you write functions which transform data into sequences of WebGL draw calls.  These functions are then partially evaluated at run time into optimized JavaScript code.  Here is a sketch of how this might look:

```JavaScript
//This doesn't work yet, it is just for illustration
var canvas = document.createElement('canvas')
document.body.appendChild(canvas)
var regl = require('regl')(canvas.getContext('webgl'))

//This creates a new partially evaluated draw call object
// Conceptually, it is a function that takes an object ('props')
// and evaluates to some serializable WebGL call.
//
var drawFunc = regl.draw({
  fragShader: `
    uniform vec4 color;
    void main() {
      gl_FragColor = color;
    }`,

  vertShader: `
    attribute vec2 position;
    void main() {
      gl_Position = vec4(position, 0, 1);
    }`,

  uniforms: {
    color: regl.prop('color'),
  },

  attributes: {
    position: new Float32Array([-2, -2, 4, -2, 4,  4])
  },

  count: 1,
})

function render() {  
  drawFunc({
    color: [
      Math.cos(Date.now() * 0.001),
      Math.sin(Date.now() * 0.0008),
      Math.cos(Date.now() * 0.003),
      1]
  })
}
render()
```
