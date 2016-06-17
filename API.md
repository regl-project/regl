# REGL API

* [Initialization](#initialization)
      * [As a fullscreen canvas](#as-a-fullscreen-canvas)
      * [From a container div](#from-a-container-div)
      * [From a canvas](#from-a-canvas)
      * [From a WebGL context](#from-a-webgl-context)
  + [Initialization options](#initialization-options)
* [Commands](#commands)
  + [Executing commands](#executing-commands)
    - [One-shot rendering](#one-shot-rendering)
    - [Batch rendering](#batch-rendering)
    - [Scoped commands](#scoped-commands)
  + [Inputs](#inputs)
    - [Context](#context)
    - [Props](#props)
    - [`this`](#-this-)
  + [Parameters](#parameters)
    - [Shaders](#shaders)
    - [Uniforms](#uniforms)
    - [Attributes](#attributes)
    - [Drawing](#drawing)
    - [Render target](#render-target)
    - [Depth buffer](#depth-buffer)
    - [Blending](#blending)
    - [Stencil](#stencil)
    - [Polygon offset](#polygon-offset)
    - [Culling](#culling)
    - [Front face](#front-face)
    - [Dithering](#dithering)
    - [Line width](#line-width)
    - [Color mask](#color-mask)
    - [Sample coverage](#sample-coverage)
    - [Scissor](#scissor)
    - [Viewport](#viewport)
* [Resources](#resources)
  + [Buffers](#buffers)
    - [Constructor](#constructor)
    - [Update](#update)
    - [Destroy](#destroy)
  + [Elements](#elements)
    - [Constructor](#constructor-1)
    - [Update](#update-1)
    - [Destroy](#destroy-1)
  + [Textures](#textures)
    - [Constructor](#constructor-2)
    - [Update](#update-2)
    - [Destroy](#destroy-2)
  + [Cube maps](#cube-maps)
    - [Constructor](#constructor-3)
    - [Update](#update-3)
    - [Destroy](#destroy-3)
  + [Render buffers](#render-buffers)
    - [Constructor](#constructor-4)
    - [Update](#update-4)
    - [Destroy](#destroy-4)
  + [Frame buffers](#frame-buffers)
    - [Constructor](#constructor-5)
    - [Update](#update-5)
    - [Destroy](#destroy-5)
  + [Cubic frame buffers](#cubic-frame-buffers)
    - [Constructor](#constructor-6)
    - [Update](#update-6)
    - [Destroy](#destroy-6)
* [Other features](#other-features)
  + [Clear the draw buffer](#clear-the-draw-buffer)
  + [Reading pixels](#reading-pixels)
  + [Per-frame callbacks](#per-frame-callbacks)
  + [Device capabilities and limits](#device-capabilities-and-limits)
  + [Performance metrics](#performance-metrics)
  + [Clean up](#clean-up)
  + [Context loss](#context-loss)
  + [Unsafe escape hatch](#unsafe-escape-hatch)
* [Tips](#tips)
  + [Reuse resources (buffers, elements, textures, etc.)](#reuse-resources--buffers--elements--textures--etc-)
  + [Preallocate memory](#preallocate-memory)
  + [Debug vs release](#debug-vs-release)
  + [Context loss mitigation](#context-loss-mitigation)

---------------------------------------
## Initialization

##### As a fullscreen canvas
By default calling `module.exports` on the `regl` package creates a full screen canvas element and WebGLRenderingContext.

```javascript
var regl = require('regl')([options])
```

##### From a container div
Alternatively passing a container element as the first argument appends the generated canvas to its children.

```javascript
var regl = require('regl')(element, [options])
```

##### From a canvas
If the first argument is an HTMLCanvasElement, then `regl` will use this canvas to create a new WebGLRenderingContext that it renders into.

```javascript
var regl = require('regl')(canvas, [options])
```

##### From a WebGL context
Finally, if the first argument is a WebGLRenderingContext, then `regl` will just use this context without touching the DOM at all.

```javascript
var regl = require('regl')(gl, [options])
```

Note that this form is compatible with [`headless-gl`](https://github.com/stackgl/headless-gl) and can be used to do offscreen rendering in node.js. For example,

```javascript
//Creates a headless 256x256 regl instance
var regl = require('regl')(require('gl')(256, 256))
```

### Initialization options

**TODO**

---------------------------------------
## Commands

*Draw commands* are the fundamental abstraction in `regl`.  A draw command wraps up all of the WebGL state associated with a draw call (either `drawArrays` or `drawElements`) and packages it into a single reusable function. For example, here is a command that draws a triangle,

```javascript
const drawTriangle = regl({
  frag: `
  void main() {
    gl_FragColor = vec4(1, 0, 0, 1);
  }`,

  vert: `
  attribute vec2 position;
  void main() {
    gl_Position = vec4(position, 0, 1);
  }`,

  attributes: {
    position: [[0, -1], [-1, 0], [1, 1]]
  },

  count: 3
})
```

To execute a command you call it just like you would any function,

```javascript
drawTriangle()
```

---------------------------------------
### Executing commands
There are 3 ways to execute a command,

#### One-shot rendering
In one shot rendering the command is executed once and immediately,

```javascript
// Executes command immediately with no arguments
command()

// Executes a command using the specified arguments
command(props)
```

#### Batch rendering
A command can also be executed multiple times by passing a non-negative integer or an array as the first argument.  The `batchId` is initially `0` and incremented for each executed,

```javascript
// Executes the command `count`-times
command(count)

// Executes the command once for each args
command([props0, props1, props2, ..., propsn])
```

#### Scoped commands
Commands can be nested using scoping.  If the argument to the command is a function then the command is evaluated and the state variables are saved as the defaults for all commands executed within its scope,

```javascript
command(function (context) {
  // ... execute sub commands
})

command(props, function (context) {
  // ... execute sub commands
})
```

---------------------------------------
### Inputs
Inputs to `regl` commands can come from one of three sources,

* Context: Context variables are not used directly in commands, but can be passed into
* Props: props are arguments which are passed into commands
* `this`: `this` variables are indexed from the `this` variable that the command was called with

If you are familiar with Facebook's [react](https://github.com/facebook/react), these are roughly analogous to a component's [context](https://facebook.github.io/react/docs/context.html), [props](https://facebook.github.io/react/docs/transferring-props.html) and [state](https://facebook.github.io/react/docs/component-api.html#setstate) variables respectively.

#### Example

```javascript
var drawSpinningStretchyTriangle = regl({
  frag: `
  void main() {
    gl_FragColor = vec4(1, 0, 0, 1);
  }`,

  vert: `
  attribute vec2 position;
  uniform float angle, scale, width, height;
  void main() {
    float aspect = width / height;
    gl_Position = vec4(
      scale * (cos(angle) * position.x - sin(angle) * position.y),
      aspect * scale * (sin(angle) * position.x + cos(angle) * position.y),
      0,
      1.0);
  }`,

  attributes: {
    position: [[0, -1], [-1, 0], [1, 1]]
  },

  uniforms: {
    //
    // Dynamic properties can be functions.  Each function gets passed:
    //
    //  * context: which contains data about the current regl environment
    //  * props: which are user specified arguments
    //  * batchId: which is the index of the draw command in the batch
    //
    angle: function (context, props, batchId) {
      return args.speed * stats.count + 0.01 * batchId
    },

    // As a shortcut/optimization we can also just read out a property
    // from the args.  For example, this
    //
    scale: regl.prop('scale'),
    //
    // is semantically equivalent to
    //
    //  scale: function (context, props) {
    //    return props.scale
    //  }
    //

    // Similarly there are shortcuts for accessing context variables
    width: regl.context('viewportWidth'),
    height: regl.context('viewportHeight'),
    //
    // which is the same as writing:
    //
    // width: function (context) {
    //    return context.viewportWidth
    // }
    //
  },

  count: 3
})
```

To execute a draw command with dynamic arguments we pass it a configuration object as the first argument,

```javascript
// Draws one spinning triangle
drawSpinningStretchyTriangle({
  scale: 0.5,
  speed: 2
})

// Draws multiple spinning triangles
drawSpinningStretchyTriangle([
  { // batchId 0
    scale: 1,
    speed: 1,
  },
  { // batchId 1
    scale: 2,
    speed: 0.1,
  },
  { // batchId 2
    scale: 0.25,
    speed: 3
  }
])
```

#### Context
Context variables in `regl` are computed before any other parameters and can also be passed from a scoped command to any sub-commands.  `regl` defines the following default context variables:

| Name | Description |
|------|-------------|
| `frameCount` | The number of frames rendered |
| `deltaTime` | Time since the last frame was rendered in seconds |
| `time` | Total time elapsed since the regl was initialized in seconds |
| `viewportWidth` | Width of the current viewport in pixels |
| `viewportHeight` | Height of the current viewport in pixels |
| `framebufferWidth` | Width of the current framebuffer in pixels |
| `framebufferHeight` | Height of the current framebuffer in pixels |
| `drawingBufferWidth` | Width of the WebGL context drawing buffer |
| `drawingBufferHeight` | Height of the WebGL context drawing buffer |
| `pixelRatio` | The pixel ratio of the drawing buffer |

You can define context variables in the `context` block of a command.  For example, here is how you can use context variables to set up a camera:

```javascript
// This scoped command sets up the camera parameters
var setupCamera = regl({
  context: {
    projection: function (context) {
      return mat4.perspective([],
        Math.PI / 4,
        context.viewportWidth / context.viewportHeight,
        0.01,
        1000.0)
    },

    view: function (context, props) {
      return mat4.lookAt([],
        props.eye,
        props.target,
        [0, 1, 0])
    },

    eye: regl.props('eye')
  },

  uniforms: {
    view: regl.context('view'),
    invView: function (context) {
      return mat4.inverse([], context.view)
    },
    projection: regl.context('projection')
  }
})

// ... do stuff

// In the render function:
setupCamera({
  eye: [10, 0, 0],
  target: [0, 0, 0]
}, function () {

  // draw stuff
})
```

#### Props
The most common way to pass data into regl is via props.  The props for a render command are declared

#### `this`
While `regl` strives to provide a stateless API, there are a few cases where it can be useful to cache state locally to a specific command.  One way to achieve this is to use objects.  When a regl command is executed as a member function of an object, the `this` parameter is set to the object on which it was called and is passed to all computed parameters. For example, this shows how to use regl to create a simple reusable mesh object,

```javascript
// First we create a constructor
function Mesh (center, {positions, cells}) {
  this.center = center
  this.positions = regl.buffer(positions)
  this.cells = regl.buffer(cells)
}

// Then we assign regl commands directly to the prototype of the class
Mesh.prototype.draw = regl({
  vert: `
  uniform mat4 projection, view, model;
  attribute vec3 position;
  void main () {
    gl_Position = projection * view * model * vec4(position, 1);
  }`,

  frag: `
  void main () {
    gl_FragColor = vec4(1, 0, 0, 1);
  }`,

  uniforms: {
    // dynamic properties are invoked with the same `this` as the command
    model: function () => {
      var c = this.center
      return [
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        -c[0], -c[1], -c[2], 1
      ]
    },

    view: regl.prop('view'),
    projection: regl.prop('projection')
  }

  attributes: {
    // here we are using 'positions' proeprty of the mesh
    position: regl.this('positions')
  },

  // and same for the cells
  elements: regl.this('cells')
})
```

Once defined, we could then use these mesh objects as follows:

```javascript
// Initialize meshes
var bunnyMesh = new Mesh([5, 2, 1], require('bunny'))
var teapotMesh = new Mesh([0, -3, 0], require('teapot'))

// ... set up rest of scene, compute matrices etc.
var view, projection

// Now draw meshes:
bunnyMesh.draw({
  view: view,
  projection: projection
})

teapotMesh.draw({
  view: view,
  projection: projection
})
```

---------------------------------------
### Parameters
The input to a command declaration is a complete description of the WebGL state machine in the form of an object.  The properties of this object are parameters which specify how values in the WebGL state machine are to be computed.

---------------------------------------
#### Shaders

Each draw command can specify the source code for a vertex and/or fragment shader,

```javascript
var command = regl({
  // ...

  vert: `
  void main() {
    gl_Position = vec4(0, 0, 0, 1);
  }`,

  frag: `
  void main() {
    gl_FragColor = vec4(1, 0, 1, 1);
  }`,

  // ...
})
```

| Property | Description |
|----------|-------------|
| `vert` | Source code of vertex shader |
| `frag` | Source code of fragment shader |

**Related WebGL APIs**

* [`gl.createShader`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glCreateShader.xml)
* [`gl.shaderSource`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glShaderSource.xml)
* [`gl.compileShader`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glCompileShader.xml)
* [`gl.createProgram`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glCreateProgram.xml)
* [`gl.attachShader`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glAttachShader.xml)
* [`gl.linkProgram`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glLinkProgram.xml)
* [`gl.useProgram`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glUseProgram.xml)

---------------------------------------
#### Uniforms
Uniform variables are specified in the `uniforms` block of the command.  For example,

```javascript
var command = regl({
  // ...

  vert: `
  struct SomeStruct {
    float value;
  };

  uniform vec4 someUniform;
  uniform int anotherUniform;
  uniform SomeStruct nested;

  void main() {
    gl_Position = vec4(1, 0, 0, 1);
  }`,

  uniforms: {
    someUniform: [1, 0, 0, 1],
    anotherUniform: regl.prop('myProp'),
    'nested.value', 5.3
  },

  // ...
})
```

**Notes**
* To specify uniforms in nested structs use the fully qualified path with dot notation
* Matrix uniforms are specified as flat length n^2 arrays without transposing

**Related WebGL APIs**

* [`gl.getUniformLocation`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glGetUniformLocation.xml)
* [`gl.uniform`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glUniform.xml)

---------------------------------------
#### Attributes
```javascript
var command = regl({
  // ...

  attributes: {
    // Attributes can be declared explicitly
    normals: {
      buffer: regl.buffer([
        // ...
      ]),
      offset: 0,
      stride: 12,
      normalized: false,

      // divisor is only used if instancing is enabled
      divisor: 0
    },

    // A regl.buffer or the arguments to regl.buffer may also be specified
    position: [
      0, 1, 2,
      2, 3, 4,
      ...
    ],

    // Finally, attributes may be initialized with a constant value
    color: {
      constant: [1, 0, 1, 1]
    }
  },

  // ...
})
```

Each attribute can have any of the following optional properties,

| Property | Description | Default |
|----------|-------------|---------|
| `buffer` | A `REGLBuffer` wrapping the buffer object | `null` |
| `offset` | The offset of the `vertexAttribPointer` in bytes | `0` |
| `stride` | The stride of the `vertexAttribPointer` in bytes | `0` |
| `normalized` | Whether the pointer is normalized | `false` |
| `size` | The size of the vertex attribute | Inferred from shader |
| `divisor` | Sets `gl.vertexAttribDivisorANGLE` | `0` * |

**Notes**
* Attribute size is inferred from the shader vertex attribute if not specified
* If a buffer is passed for an attribute then all pointer info is inferred
* If the arguments to `regl.buffer` are passed, then a buffer is constructed
* If an array is passed to an attribute, then the vertex attribute is set to a constant
* `divisor` is only supported if the `ANGLE_instanced_arrays` extension is available

**Related WebGL APIs**

* [`gl.vertexAttribPointer`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glVertexAttribPointer.xml)
* [`gl.vertexAttrib`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glVertexAttrib.xml)
* [`gl.getAttribLocation`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glGetAttribLocation.xml)
* [`gl.vertexAttibDivisor`](https://www.opengl.org/sdk/docs/man4/html/glVertexAttribDivisor.xhtml)
* [`gl.enableVertexAttribArray`, `gl.disableVertexAttribArray`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glDisableVertexAttribArray.xml)

---------------------------------------
#### Drawing

```javascript
var command = regl({
  // ...

  primitive: 'triangles',
  offset: 0,
  count: 6
})
```

| Property | Description | Default |
|----------|-------------|---------|
| `primitive` | Sets the primitive type | `'triangles'` * |
| `count` | Number of vertices to draw | `0` * |
| `offset` | Offset of primitives to draw | `0` |
| `instances` | Number of instances to render | `0` ** |
| `elements` | Element array buffer | `null` |

**Notes**

* If `elements` is specified while `primitive`, `count` and `offset` are not, then these values may be inferred from the state of the element array buffer.
* `elements` must be either an instance of `regl.elements` or else the arguments to `regl.elements`
* `instances` is only applicable if the `ANGLE_instanced_arrays` extension is present.
* `primitive` can take on the following values

| Primitive type | Description |
|-------|-------------|
| `'points'` | `gl.POINTS` |
| `'lines'` | gl.LINES` |
| `'line strip'` | `gl.LINE_STRIP` |
| `'line loop` | `gl.LINE_LOOP` |
| `'triangles` | `gl.TRIANGLES` |
| `'triangle strip'` | `gl.TRIANGLE_STRIP` |
| `'triangle fan'` | `gl.TRIANGLE_FAN` |

**Related WebGL APIs**

* [`gl.drawArrays`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glDrawArrays.xml)
* [`gl.drawElements`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glDrawElements.xml)
* [`gl.drawArraysInstancedANGLE`](https://www.opengl.org/sdk/docs/man4/html/glDrawArraysInstanced.xhtml)
* [`gl.drawElementsInstancedANGLE`](https://www.opengl.org/sdk/docs/man4/html/glDrawElementsInstanced.xhtml)

---------------------------------------
#### Render target
A `regl.framebuffer` object may also be specified to allow for rendering to offscreen locations.

```javascript
var command = regl({
  framebuffer: fbo
})
```

**Notes**

* `framebuffer` must be a `regl.framebuffer` object
* Passing `null` sets the framebuffer to the drawing buffer
* Updating the render target will modify the viewport

**Related WebGL APIs**

* [`gl.bindFramebuffer`](https://www.opengl.org/sdk/docs/man4/html/glBindFramebuffer.xhtml)

---------------------------------------
#### Depth buffer
All state relating to the depth buffer is stored in the `depth` field of the command.  For example,

```javascript
var command = regl({
  // ...

  depth: {
    enable: true,
    mask: true,
    func: 'less',
    range: [0, 1]
  },

  // ..
})
```

| Property | Description | Default |
|----------|-------------|---------|
| `enable` | Toggles `gl.enable(gl.DEPTH_TEST)` | `true` |
| `mask` | Sets `gl.depthMask` | `true` |
| `range` | Sets `gl.depthRange` | `[0, 1]` |
| `func` | Sets `gl.depthFunc`. See table below for possible values | `'less'` |

**Notes**
* `depth.func` can take on the possible values

| Value | Description |
|-------|-------------|
| `'never'` | `gl.NEVER` |
| `'always'` | `gl.ALWAYS` |
| `'<', 'less'` | `gl.LESS` |
| `'<=', 'lequal'` | `gl.LEQUAL` |
| `'>', 'greater'` | `gl.GREATER` |
| `'>=', 'gequal'` | `gl.GEQUAL` |
| `'=', 'equal'` | `gl.EQUAL` |
| `'!=', 'notequal'` | `gl.NOTEQUAL` |

**Related WebGL APIs**

* [`gl.depthFunc`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glDepthFunc.xml)
* [`gl.depthMask`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glDepthMask.xml)
* [`gl.depthRange`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glDepthRangef.xml)

---------------------------------------
#### Blending
Blending information is stored in the `blend` field,

```javascript
var command = regl({
  // ...

  blend: {
    enable: true,
    func: {
      srcRGB: 'src alpha',
      srcAlpha: 1,
      dstRGB: 'one minus src alpha',
      dstAlpha: 1
    },
    equation: {
      rgb: 'add',
      alpha: 'add'
    },
    color: [0, 0, 0, 0]
  },

  // ...
})
```

| Property | Description | Default |
|----------|-------------|---------|
| `enable` | Toggles `gl.enable(gl.BLEND)` | `false` |
| `equation` | Sets `gl.blendEquation` (see table) | `'add'` |
| `func` | Sets `gl.blendFunc` (see table) | `{src:'src alpha',dst:'one minus src alpha'}` |
| `color` | Sets `gl.blendColor` | `[0, 0, 0, 0]` |

**Notes**
* `equation` can be either a string or an object with the fields `{rgb, alpha}`.  The former corresponds to `gl.blendEquation` and the latter to `gl.blendEquationSeparate`
* The fields of `equation` can take on the following values

| Equation | Description |
|----------|---------------|
| `'add'` | `gl.FUNC_ADD` |
| `'subtract'` | `gl.FUNC_SUBTRACT` |
| `'reverse subtract'` | `gl.FUNC_REVERSE_SUBTRACT` |
| `'min'` | `gl.MIN_EXT` |
| `'max'` | `gl.MAX_EXT` |

* `'min'` and `'max'` are only available if the `EXT_blend_minmax` extension is supported
* `func` can be an object with the fields `{src, dst}` or `{srcRGB, srcAlpha, dstRGB, dstAlpha}`, with the former corresponding to `gl.blendFunc` and the latter to `gl.blendFuncSeparate`
* The fields of `func` can take on the following values

| Func | Description |
|------|-------------|
| `0, 'zero'` | `gl.ZERO` |
| `1, 'one'` | `gl.ONE` |
| `'src color'` | `gl.SRC_COLOR` |
| `'one minus src color'` | `gl.ONE_MINUS_SRC_COLOR` |
| `'src alpha'` | `gl.SRC_ALPHA` |
| `'one minus src alpha'` | `gl.ONE_MINUS_SRC_ALPHA` |
| `'dst color'` | `gl.DST_COLOR` |
| `'one minus dst color'` | `gl.ONE_MINUS_DST_COLOR` |
| `'dst alpha'` | `gl.DST_ALPHA` |
| `'one minus dst alpha'` | `gl.ONE_MINUS_DST_ALPHA` |
| `'constant color'` | `gl.CONSTANT_COLOR` |
| `'one minus constant color'` | `gl.ONE_MINUS_CONSTANT_COLOR` |
| `'constant alpha'` | `gl.CONSTANT_ALPHA` |
| `'one minus constant alpha'` | `gl.ONE_MINUS_CONSTANT_ALPHA` |
| `'src alpha saturate'` | `gl.SRC_ALPHA_SATURATE` |

**Related WebGL APIs**

* [`gl.blendEquationSeparate`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glBlendEquationSeparate.xml)
* [`gl.blendFuncSeparate`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glBlendFuncSeparate.xml)
* [`gl.blendColor`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glBlendColor.xml)

---------------------------------------
#### Stencil

Example:

```javascript
var command = regl({
  // ...

  stencil: {
    enable: true,
    mask: 0xff,
    func: {
      cmp: '<',
      ref: 0,
      mask: 0xff
    },
    opFront: {
      fail: 'keep',
      zfail: 'keep',
      pass: 'keep'
    },
    opBack: {
      fail: 'keep',
      zfail: 'keep',
      pass: 'keep'
    }
  },

  // ...
})
```

| Property | Description | Default |
|----------|-------------|---------|
| `enable` | Toggles `gl.enable(gl.STENCIL_TEST)` | `false` |
| `mask` | Sets `gl.stencilMask` | `-1` |
| `func` | Sets `gl.stencilFunc` | `{cmp:'always',ref:0,mask:-1}` |
| `opFront` | Sets `gl.stencilOpSeparate` for front face | `{fail:'keep',zfail:'keep',pass:'keep'}` |
| `opBack` | Sets `gl.stencilOpSeparate` for back face | `{fail:'keep',zfail:'keep',pass:'keep'}` |

**Notes**

* `func` is an object which configures the stencil test function. It has 3 properties,
    + `cmp` which is the comparison function
    + `ref` which is the reference value
    + `mask` which is the comparison mask
* `func.cmp` is a comparison operator which takes one of the following values,

| Value | Description |
|-------|-------------|
| `'never'` | `gl.NEVER` |
| `'always'` | `gl.ALWAYS` |
| `'<', 'less'` | `gl.LESS` |
| `'<=', 'lequal'` | `gl.LEQUAL` |
| `'>', 'greater'` | `gl.GREATER` |
| `'>=', 'gequal'` | `gl.GEQUAL` |
| `'=', 'equal'` | `gl.EQUAL` |
| `'!=', 'notequal'` | `gl.NOTEQUAL` |

* `opFront` and `opBack` specify the stencil op.  Each is an object which takes the following parameters:
    + `fail`, the stencil op which is applied when the stencil test fails
    + `zfail`, the stencil op which is applied when the stencil test passes and the depth test fails
    + `pass`, the stencil op which is applied when both stencil and depth tests pass
* Values for `opFront.fail`, `opFront.zfail`, etc. can come from the following table

| Stencil Op | Description |
|------------|-------------|
| `'zero'` | `gl.ZERO` |
| `'keep'` | `gl.KEEP` |
| `'replace'` | `gl.REPLACE` |
| `'invert'` | `gl.INVERT` |
| `'increment'` | `gl.INCR` |
| `'decrement'` | `gl.DECR` |
| `'increment wrap'` | `gl.INCR_WRAP` |
| `'decrement wrap'` | `gl.DECR_WRAP` |

**Related WebGL APIs**

* [`gl.stencilFunc`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glStencilFunc.xml)
* [`gl.stencilMask`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glStencilMask.xml)
* [`gl.stencilOpSeparate`](http://www.khronos.org/opengles/sdk/2.0/docs/man/xhtml/glStencilOpSeparate.xml)

---------------------------------------
#### Polygon offset

Polygon offsetting behavior can be controlled using the `polygonOffset` field,

```javascript
var command = regl({
  // ...

  polygonOffset: {
    enable: true,
    offset: {
      factor: 1,
      units: 0
    }
  }

  // ...
})
```

| Property | Description | Default |
|----------|-------------|---------|
| `enable` | Toggles `gl.enable(gl.POLYGON_OFFSET_FILL)` | `false` |
| `offset` | Sets `gl.polygonOffset` | `{factor:0, units:0}` |

**Related WebGL APIs**

* [`gl.polygonOffset`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glPolygonOffset.xml)

---------------------------------------
#### Culling
Example,

```javascript
var command = regl({
  // ...

  cull: {
    enable: true,
    face: 'back'
  },

  // ...
})
```

| Property | Description | Default |
|----------|-------------|---------|
| `enable` | Toggles `gl.enable(gl.CULL_FACE)` | `false` |
| `face` | Sets `gl.cullFace` | `'back'` |

**Notes**

* `face` must be one of the following values,

| Face | Description |
|------|-------------|
| `'front'` | `gl.FRONT` |
| `'back'` | `gl.BACK` |

**Relevant WebGL APIs**

* [`gl.cullFace`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glCullFace.xml)

---------------------------------------
#### Front face
Example,

```javascript
var command = regl({
  // ...

  frontFace: 'cw',

  // ...
})
```

| Property | Description | Default |
|----------|-------------|---------|
| `frontFace` | Sets `gl.frontFace` | `'ccw'` |

**Notes**

* The value for front face must be one of the following,

| Orientation | Description |
|------|-------------|
| `'cw'` | `gl.CW` |
| `'ccw'` | `gl.CCW` |

**Relevant WebGL APIs**

* [`gl.frontFace`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glFrontFace.xml)

---------------------------------------
#### Dithering
Example,

```javascript
var command = regl({
  // ...

  dither: true,

  // ...
})
```

| Property | Description | Default |
|----------|-------------|---------|
| `dither` | Toggles `gl.DITHER` | `false` |

---------------------------------------
#### Line width
Example,

```javascript
var command = regl({
  // ...

  lineWidth: 4,

  // ...
})
```

| Property | Description | Default |
|----------|-------------|---------|
| `lineWidth` | Sets `gl.lineWidth` | `1` |

**Relevant WebGL APIs**

* [`gl.lineWidth`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glLineWidth.xml)

---------------------------------------
#### Color mask
Example,

```javascript
var command = regl({
  // ...

  colorMask: [true, false, true, false],

  // ...
})
```

| Property | Description | Default |
|----------|-------------|---------|
| `colorMask` | Sets `gl.colorMask` | `[true, true, true, true]` |

**Relevant WebGL APIs**

* [`gl.colorMask`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glColorMask.xml)

---------------------------------------
#### Sample coverage
Example,

```javascript
var command = regl({
  // ...

  sample: {
    enable: true,
    alpha: false,
    coverage: {
      value: 1,
      invert: false
    }
  },

  // ...
})
```

| Property | Description | Default |
|----------|-------------|---------|
| `enable` | Toggles `gl.enable(gl.SAMPLE_COVERAGE)` | `false` |
| `alpha` | Toggles `gl.enable(gl.SAMPLE_ALPHA_TO_COVERAGE)` | `false` |
| `coverage` | Sets `gl.sampleCoverage` | `{value:1,invert:false}` |

**Relevant WebGL APIs**

* [`gl.sampleCoverage`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glColorMask.xml)

---------------------------------------
#### Scissor
Example,

```javascript
var command = regl({
  // ...

  scissor: {
    enable: true,
    box: {
      x: 10,
      y: 20,
      w: 100,
      h: 100
    }
  }

  // ...
})
```

| Property | Description | Default |
|----------|-------------|---------|
| `enable` | Toggles `gl.enable(gl.SCISSOR)` | `false` |
| `box` | Sets `gl.scissor` | `{x:0,y:0}` |

**Notes**
* `box` is the shape of the scissor region, it takes the following parameters
    + `x` is the left coordinate of the box, default `0`
    + `y` is the top coordiante of the box, default `0`
    + `w` is the width of the box, default fbo width - `x`
    + `h` is the height of the box, default fbo height - `y`

**Relevant WebGL APIs**

* [`gl.scissor`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glScissor.xml)

---------------------------------------
#### Viewport
Example,

```javascript
var command = regl({
  // ...

  viewport: {
    x: 5,
    y: 10,
    w: 100,
    h: 50
  }

  // ...
})
```

| Property | Description | Default |
|----------|-------------|---------|
| `viewport` | The shape of viewport | `{}` |

**Notes**

* Like `scissor.box`, `viewport` is a bounding box with properties `x,y,w,h`
* Updating `viewport` will modify the context variables `viewportWidth` and `viewportHeight`

**Relevant WebGL APIs**

* [`gl.viewport`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glViewport.xml)

---------------------------------------
## Resources
Besides commands, the other major component of regl are resources.  Resources are GPU resident objects which are managed explicitly by the programmer.  Each resource follows a the same life cycle of create/read/update/delete.

---------------------------------------
### Buffers
`regl.buffer` wraps WebGL array buffer objects.

#### Constructor

```javascript
// Creates an empty length 100 buffer
var zeroBuffer = regl.buffer(100)

// A buffer with float data
var floatBuffer = regl.buffer(new Float32Array([1, 2, 3, 4]))

// A streaming buffer of bytes
var streamBuffer = regl.buffer({
  usage: 'stream',
  data: new Uint8Array([2, 4, 6, 8, 10])
})

// An unpacked buffer of position data
var positionBuffer = regl.buffer([
  [1, 2, 3],
  [4, 5, 6],
  [2, 1, -2]
])
```

| Property | Description | Default |
|----------|-------------|---------|
| `data` | The data for the vertex buffer (see below) | `null` |
| `length` | If `data` is `null` or not present reserves space for the buffer | `0` |
| `usage` | Sets array buffer usage hint | `'static'` |

| Usage Hint | Description |
|------------|-------------|
| `'static'` | `gl.DRAW_STATIC` |
| `'dynamic'` | `gl.DYNAMIC_DRAW` |
| `'stream'` | `gl.STREAM_DRAW` |

**Relevant WebGL APIs**

* [`gl.createBuffer`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glCreateBuffer.xml)
* [`gl.bufferData`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glBufferData.xml)


#### Update
To reinitialize a buffer in place, we can call the buffer as a function:

```javascript
// First we create a buffer
var myBuffer = regl.buffer(5)

// ... do stuff ...

// Now reinitialize myBuffer
myBuffer({
  data: [
    1, 2, 3, 4, 5
  ]
})
```

The arguments to the update pathway are the same as the constructor and the returned value will be a reference to the buffer.  

**Relevant WebGL APIs**

* [`gl.bufferData`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glBufferData.xml)

##### In place update
For performance reasons we may sometimes want to update just a portion of
We can also update a portion of the buffer using the `subdata` method.  This can be useful if you are dealing with frequently changing or streaming vertex data.  Here is an example:

```javascript
// First we preallocate a buffer with 100 bytes of data
var myBuffer = regl.buffer({
  usage: 'dynamic',  // give the WebGL driver a hint that this buffer may change
  type: 'float',
  length: 100
})

// Now we initialize the head of the buffer with the following data
myBuffer.subdata([ 0, 1, 2, 3, 4, 5 ])
//
// untyped arrays and arrays-of-arrays are converted to the same data type as
// the buffer.  typedarrays are copied bit-for-bit into the buffer
// with no type conversion.
//

// We can also update the buffer at some byte offset by passing this as
// the second argument to subdata
myBuffer.subdata([[7, 8], [9, 10]], 8)
//
// now the contents of myBuffer are:
//
//  new Float32Array([0, 1, 7, 8, 9, 10, 0, 0, 0, .... ])
//
```

**Relevant WebGL APIs**

* [`gl.bufferSubData`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glBufferSubData.xml)


#### Destroy
Calling `.destroy()` on a buffer releases all resources associated to the buffer:

```javascript
// Create a buffer
var myBuffer = regl.buffer(10)

// destroys the buffer
myBuffer.destroy()
```

* [`gl.deleteBuffer`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glDeleteBuffer.xml)


---------------------------------------
### Elements
`regl.elements` wraps WebGL element array buffer objects.  Each `regl.elements` object stores a buffer object as well as the primitive type and vertex count.

#### Constructor

```javascript
var triElements = regl.elements([
  [1, 2, 3],
  [0, 2, 5]
])

var starElements = regl.elements({
  primitive: 'line loop',
  count: 5,
  data: new Uint8Array([0, 2, 4, 1, 3])
})
```

| Property | Description | Default |
|----------|-------------|---------|
| `data` | The data of the element buffer | `null` |
| `usage` | Usage hint (see `gl.bufferData`) | `'static'` |
| `length` | Length of the element buffer in bytes | `0` * |
| `primitive` | Default primitive type for element buffer | `'triangles'` * |
| `count` | Vertex count for element buffer | `0` * |

* `usage` must take on one of the following values

| Usage Hint | Description |
|------------|-------------|
| `'static'` | `gl.DRAW_STATIC` |
| `'dynamic'` | `gl.DYNAMIC_DRAW` |
| `'stream'` | `gl.STREAM_DRAW` |

* `primitive` can be one of the following primitive types

| Primitive type | Description |
|-------|-------------|
| `'points'` | `gl.POINTS` |
| `'lines'` | gl.LINES` |
| `'line strip'` | `gl.LINE_STRIP` |
| `'line loop` | `gl.LINE_LOOP` |
| `'triangles` | `gl.TRIANGLES` |
| `'triangle strip'` | `gl.TRIANGLE_STRIP` |
| `'triangle fan'` | `gl.TRIANGLE_FAN` |

**Notes**

* `primitive`, `count` and `length` are inferred from from the vertex data

**Relevant WebGL APIs**

* [`gl.createBuffer`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glCreateBuffer.xml)
* [`gl.bufferData`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glBufferData.xml)
* [`gl.drawElements`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glDrawElements.xml)


#### Update
As in the case of buffers, calling an element buffer as a function reinitializes an element buffer in place.  The arguments are the same as for the constructor.  For example:

```javascript
// First we create an element buffer
var myElements = regl.elements()

// Then we update it by calling it directly
myElements({
  data: [
    [1, 2, 3],
    [0, 2, 1]
  ]
})
```

**Relevant WebGL APIs**

* [`gl.bufferData`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glBufferData.xml)

##### In-place update
Again like buffers it is possible to preallocate an element buffer and update regions of the elements using the `subdata` command.

```javascript
// First we preallocate the element buffer
var myElements = regl.elements({
  primitive: 'triangles',
  usage: 'dynamic',
  type: 'uint16',
  length: 4096,
  count: 0
})

// Then we can update into ranges of the element buffer using subdata
myElements.subdata(
  [ [0, 1, 2],
    [2, 1, 3] ])
```

**Relevant WebGL APIs**

* [`gl.bufferSubData`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glBufferSubData.xml)

#### Destroy

```javascript
// First we create an element buffer
var myElements = regl.elements({ ... })

// Calling .destroy() on an element buffer releases all resources associated to
// it
myElements.destroy()
```

**Relevant WebGL APIs**

* [`gl.deleteBuffer`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glDeleteBuffer.xml)

---------------------------------------
### Textures

#### Constructor

There are many ways to upload data to a texture in WebGL.  As with drawing commands, regl consolidates all of these crazy configuration parameters into one function.  Here are some examples of how to create a texture,

```javascript
// From size parameters
var emptyTexture = regl.texture({
  shape: [16, 16]
})

// From a flat array
var typedArrayTexture = regl.texture({
  width: 2,
  height: 2,
  data: [
    255, 255, 255, 255, 0, 0, 0, 0,
    255, 0, 255, 255, 0, 0, 255, 255
  ]
})

// From a square array
var nestedArrayTexture = regl.texture([
  [ [0, 255, 0],  [255, 0, 0] ],
  [ [0, 0, 255], [255, 255, 255] ]
])

// From an ndarray-like object
var ndarrayTexture = regl.texture(require('baboon-image'))

// Manual mipmap specification
var mipmapTexture = regl.texture({
  minFilter: 'mipmap'
})

// From an image element
var image = new Image()
image.src = 'http://mydomain.com/myimage.png'
var imageTexture = regl.texture(image)

// From a canvas
var canvas = document.createElement(canvas)
var context2D = canvas.getContext('2d')
var canvasTexture = regl.texture(canvas)
var otherCanvasTexture = regl.texture(context2D)

// From a video element
var video = document.querySelector('video')
var videoTexture = regl.texture(video)

// From the pixels in the current frame buffer
var copyPixels = regl.texture({
  x: 5,
  y: 1,
  width: 10,
  height: 10,
  copy: true
})
```

A data source from an image can be one of the following types:

| Data type | Description |
|-----------|-------------|
| Rectangular array of arrays | Interpreted as 2D array of arrays |
| Typed array | A binary array of pixel values |
| Array | Interpreted as array of pixel values with type based on the input type |
| `ndarray` | Any object with a `shape, stride, offset, data` |
| Image | An HTML image element |
| Video | An HTML video element |
| Canvas | A canvas element |
| Context 2D | A canvas 2D context |
| String | A URL to an image or video to load |


| Property | Description | Default |
|----------|-------------|---------|
| `width` | Width of texture | `0` |
| `height` | Height of texture | `0`
| `mag` | Sets magnification filter (see table) | `'nearest'` |
| `min` | Sets minification filter (see table) | `'nearest'` |
| `wrapS` | Sets wrap mode on S axis (see table) | `'repeat'` |
| `wrapT` | Sets wrap mode on T axis (see table) | `'repeat'` |
| `aniso` | Sets number of anisotropic samples, requires [EXT_texture_filter_anisotropic](https://www.khronos.org/registry/webgl/extensions/EXT_texture_filter_anisotropic/) | `0` |
| `format` | Texture format (see table) | `'rgba'` |
| `type` | Texture type (see table) | `'uint8'` |
| `data` | Input data (see below) | |
| `mipmap` | If set, regenerate mipmaps | `false` |
| `flipY` | Flips textures vertically when uploading | `false` |
| `alignment` | Sets unpack alignment per pixel | `1` |
| `premultiplyAlpha` | Premultiply alpha when unpacking | `false` |
| `colorSpace` | Sets colorspace conversion | `'browser'` |
| `poll` | If set, then each frame check if this texture needs to be reuploaded | Depends on the element type |
| `data` | Image data for the texture | `null` |
| `crossOrigin` | Cross origin resource sharing URL | `null` |

* `shape` can be used as an array shortcut for `[width, height, channels]` of image
* `radius` can be specified for square images and sets both `width` and `height`
* `data` can take one of the following values,
* If an image element is specified and not yet loaded, then regl will upload a temporary image and hook a callback on the image
* If a video element is specified, then regl will reupload a frame of the video element each tick unless `poll` is set to false
* `mag` sets `gl.MAG_FILTER` for the texture and can have one of the following values

| Mag filter | Description |
|------------|-------------|
| `'nearest'` | `gl.NEAREST` |
| `'linear'` | `gl.LINEAR` |

* `min` sets `gl.MIN_FILTER` for the texture, and can take on one of the following values,

| Min filter | Description |
|------------|-------------|
| `'nearest'` | `gl.NEAREST` |
| `'linear'` | `gl.LINEAR` |
| `'mipmap', 'linear mipmap linear'` | `gl.LINEAR_MIPMAP_LINEAR` |
| `'nearest mipmap linear'` | `gl.NEAREST_MIPMAP_LINEAR` |
| `'linear mipmap nearest'` | `gl.LINEAR_MIPMAP_NEAREST` |
| `'nearest mipmap nearest'` | `gl.NEAREST_MIPMAP_NEAREST` |

* `wrap` can be used as an array shortcut for `[wrapS, wrapT]`
* `wrapS` and `wrapT` can have any of the following values,

| Wrap mode | Description |
|-----------|-------------|
| `'repeat'` | `gl.REPEAT` |
| `'clamp'` | `gl.CLAMP_TO_EDGE` |
| `'mirror'` | `gl.MIRRORED_REPEAT` |

* `format` determines the format of the texture and possibly the type.  Possible values for `format` include,

| Format | Description | Channels | Types | Compressed? | Extension? |
|--------|-------------|----------|-------|------|------------|
| `'alpha'` | `gl.ALPHA` | 1 | `'uint8','half float','float'` | ✖ | |
| `'luminance'` | `gl.LUMINANCE` | 1 | `'uint8','half float','float'` | ✖ | |
| `'luminance alpha'` | `gl.LUMINANCE_ALPHA` | 2 | `'uint8','half float','float'` | ✖ | |
| `'rgb'` | `gl.RGB` | 3 | `'uint8','half float','float'` | ✖ | |
| `'rgba'` | `gl.RGBA` | 4  | `'uint8','half float','float'`| ✖ | |
| `'rgba4'` | `gl.RGBA4` | 4 | `'rgba4'` | ✖ | |
| `'rgb5 a1'` | `gl.RGB5_A1` | 4 | `'rgb5 a1'` | ✖ | |
| `'rgb5'` | `gl.RGB5` | 3 | `'rgb5'` | ✖ | |
| `'srgb'` | `ext.SRGB` | 3 | `'uint8','half float','float'` | ✖ | [EXT_sRGB](https://www.khronos.org/registry/webgl/extensions/EXT_sRGB/) |
| `'srgba'` | `ext.RGBA` | 4  | `'uint8','half float','float'`| ✖ | [EXT_sRGB](https://www.khronos.org/registry/webgl/extensions/EXT_sRGB/) |
| `'depth'` | `gl.DEPTH_COMPONENT` | 1 | `'uint16','uint32'`  | ✖ | [WEBGL_depth_texture](https://www.khronos.org/registry/webgl/extensions/WEBGL_depth_texture/) |
| `'depth stencil'` | `gl.DEPTH_STENCIL` | 2 | `'depth stencil'` | ✖ | [WEBGL_depth_texture](https://www.khronos.org/registry/webgl/extensions/WEBGL_depth_texture/) |
| `'rgb s3tc dxt1'` | `ext.COMPRESSED_RGB_S3TC_DXT1_EXT` | 3 | `'uint8'` | ✓ | [WEBGL_compressed_texture_s3tc](https://www.khronos.org/registry/webgl/extensions/WEBGL_compressed_texture_s3tc/) |
| `'rgba s3tc dxt1'` | `ext.COMPRESSED_RGBA_S3TC_DXT1_EXT` | 4 | `'uint8'` | ✓ | [WEBGL_compressed_texture_s3tc](https://www.khronos.org/registry/webgl/extensions/WEBGL_compressed_texture_s3tc/) |
| `'rgba s3tc dxt3'` | `ext.COMPRESSED_RGBA_S3TC_DXT3_EXT` | 4 | `'uint8'` | ✓ | [WEBGL_compressed_texture_s3tc](https://www.khronos.org/registry/webgl/extensions/WEBGL_compressed_texture_s3tc/) |
| `'rgba s3tc dxt5'` | `ext.COMPRESSED_RGBA_S3TC_DXT5_EXT` | 4 | `'uint8'` | ✓ | [WEBGL_compressed_texture_s3tc](https://www.khronos.org/registry/webgl/extensions/WEBGL_compressed_texture_s3tc/) |
| `'rgb arc'` | `ext.COMPRESSED_RGB_ATC_WEBGL` | 3 | `'uint8'` | ✓ | [WEBGL_compressed_texture_atc](https://www.khronos.org/registry/webgl/extensions/WEBGL_compressed_texture_atc/) |
| `'rgba arc explicit alpha'` | `ext.COMPRESSED_RGBA_ATC_EXPLICIT_ALPHA_WEBGL` | 4 | `'uint8'` | ✓ | [WEBGL_compressed_texture_atc](https://www.khronos.org/registry/webgl/extensions/WEBGL_compressed_texture_atc/) |
| `'rgba arc interpolated alpha'` | `ext.COMPRESSED_RGBA_ATC_INTERPOLATED_ALPHA_WEBGL` | 4 | `'uint8'` | ✓ | [WEBGL_compressed_texture_atc](https://www.khronos.org/registry/webgl/extensions/WEBGL_compressed_texture_atc/) |
| `'rgb pvrtc 4bppv1'` | `ext.COMPRESSED_RGB_PVRTC_4BPPV1_IMG` | 3 | `'uint8'` | ✓ | [WEBGL_compressed_texture_pvrtc](https://www.khronos.org/registry/webgl/extensions/WEBGL_compressed_texture_pvrtc/) |
| `'rgb pvrtc 2bppv1'` | `ext.COMPRESSED_RGB_PVRTC_2BPPV1_IMG` | 3 | `'uint8'` | ✓ | [WEBGL_compressed_texture_pvrtc](https://www.khronos.org/registry/webgl/extensions/WEBGL_compressed_texture_pvrtc/) |
| `'rgba pvrtc 4bppv1'` | `ext.COMPRESSED_RGBA_PVRTC_4BPPV1_IMG` | 4 | `'uint8'` | ✓ | [WEBGL_compressed_texture_pvrtc](https://www.khronos.org/registry/webgl/extensions/WEBGL_compressed_texture_pvrtc/) |
| `'rgba pvrtc 2bppv1'` | `ext.COMPRESSED_RGBA_PVRTC_2BPPV1_IMG` | 4 | `'uint8'` | ✓ | [WEBGL_compressed_texture_pvrtc](https://www.khronos.org/registry/webgl/extensions/WEBGL_compressed_texture_pvrtc/) |
| `'rgb etc1'` | `ext.COMPRESSED_RGB_ETC1_WEBGL` | 3 | `'uint8'` | ✓ | [WEBGL_compressed_texture_etc1](https://www.khronos.org/registry/webgl/extensions/WEBGL_compressed_texture_etc1/) |

* In many cases `type` can be inferred from the format and other information in the texture.  However, in some situations it may still be necessary to set it manually.  In such an event, the following values are possible,

| Type | Description |
|------|-------------|
| `'uint8'` | `gl.UNSIGNED_BYTE` |
| `'uint16'` | `gl.UNSIGNED_SHORT` |
| `'uint32'` | `gl.UNSIGNED_INT` |
| `'float'` | `gl.FLOAT` |
| `'half float'` | `ext.HALF_FLOAT_OES` |

* `colorSpace` sets the WebGL color space flag for pixel unpacking

| Color space | Description |
|------------|-------------|
| `'none'` | `gl.NONE` |
| `'browser'` | `gl.BROWSER_DEFAULT_WEBGL` |

* `unpackAlignment` sets the pixel unpack alignment and must be one of `[1, 2, 4, 8]`

**Relevant WebGL APIs**

* [`gl.createTexture`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glCreateTexture.xml)
* [`gl.texParameter`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glTexParameter.xml)
*  [`gl.pixelStorei`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glPixelStorei.xml)
* [`gl.texImage2D`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glTexImage2D.xml)
* [`gl.texImage2D`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glTexImage2D.xml)
* [`gl.compressedTexImage2D`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glCompressedTexImage2D.xml)
* [`gl.copyTexImage2D`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glCopyTexImage2D.xml)
* [`gl.generateMipmap`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glGenerateMipmap.xml)

#### Update

**TODO**

#### Destroy

```javascript
var myTexture = regl.texture({ ... })

myTexture.destroy()
```

**Relevant WebGL APIs**

*  [`gl.deleteTexture`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glDeleteTexture.xml)

---------------------------------------
### Cube maps

#### Constructor
Cube maps follow similar syntax to textures.  They are created using `regl.cube()`

```javascript
var cubeMap = regl.cube(
  'posx.jpg',
  'negx.jpg',
  'posy.jpg',
  'negy.jpg',
  'posz.jpg',
  'negz.jpg')
```

#### Update
**TODO**

#### Destroy

```javascript
cubeMap.destroy()
```

**Relevant WebGL APIs**

*  [`gl.deleteTexture`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glDeleteTexture.xml)

---------------------------------------
### Render buffers

#### Constructor
```javascript
var rb = regl.renderbuffer({
  width: 16,
  height: 16,
  format: 'rgba4'
})
```

| Property | Interpretation | Default |
|----------|----------------|---------|
| `'format'` | Sets the internal format of the render buffer | `'rgba4'` |
| `'width'` | Sets the width of the render buffer in pixels | `1` |
| `'height'` | Sets the height of the render buffer in pixels | `1` |

| Format | Description |
|--------|-------------|
| `'rgba4'` | `gl.RGBA4` |
| `'rgb565'` | `gl.RGB565` |
| `'rgb5 a1'` | `gl.RGB5_A1` |
| `'depth'` | `gl.DEPTH_COMPONENT16` |
| `'stencil'` | `gl.STENCIL_INDEX8` |
| `'srgba'` | `ext.SRGB8_ALPHA8_EXT`, only if [EXT_sRGB](https://www.khronos.org/registry/webgl/extensions/EXT_sRGB/) supported |

**Relevant WebGL APIs**

* [`gl.createRenderbuffer`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glCreateRenderbuffer.xml)
* [`gl.deleteRenderbuffer`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glDeleteRenderbuffer.xml)
* [`gl.renderbufferStorage`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glRenderbufferStorage.xml)
* [`gl.bindRenderbuffer`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glBindRenderbuffer.xml)

#### Update

**TODO**

#### Destroy

```javascript
rb.destroy()
```

**Relevant WebGL APIs**

* [`gl.deleteRenderbuffer`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glDeleteRenderbuffer.xml)

---------------------------------------
### Frame buffers

#### Constructor
Example,

```javascript
var fbo = regl.framebuffer({
  width: 256,
  height: 256,
  depth: true,
  stencil: true
})
```

| Property | Description | Default |
|----------|-------------|---------|
| `width` | Sets the width of the framebuffer | `gl.drawingBufferWidth` |
| `height` | Sets the height of the framebuffer | `gl.drawingBufferHeight` |
| `format` | Sets the format of the color buffer | `'rgba'` |
| `type` | Sets the type of the color buffer if it is a texture | `'uint8'` |
| `colorCount` | Sets the number of color buffers | `1` |
| `depth` | Toggles whether or not a depth buffer is included | `true` |
| `stencil` | Toggles whether or not to use a stencil buffer | `false` |
| `depthTexture` | Toggles whether depth/stencil attachments should be in texture | `false` |
| `colorBuffers` | List of color buffer attachments | |
| `depthBuffer` | The depth buffer attachment | |
| `stencilBuffer` | The stencil buffer attachment | |
| `depthStencilBuffer` | The depth-stencil attachment | |

| Color format | Description | Attachment |
|--------------|-------------|------------|
| `'alpha'` | `gl.ALPHA` | Texture |
| `'luminance'` | `gl.LUMINANCE` | Texture |
| `'luminance alpha'` | `gl.LUMINANCE_ALPHA` | Texture |
| `'rgb'` | `gl.RGB` | Texture |
| `'rgba'` | `gl.RGBA` | Texture |
| `'rgba4'` | `gl.RGBA4` | Renderbuffer |
| `'rgb565'` | `gl.RGB565` | Renderbuffer |
| `'rgb5 a1'` | `gl.RGB5_A1` | Renderbuffer |


| Color type | Description |
|------------|-------------|
| `'best'` | Highest available precision |
| `'uint8'` | `gl.UNSIGNED_BYTE` |
| `'half float'` | 16 bit float |
| `'float'` | 32 bit float` |

**Relevant WebGL APIs**

* [`gl.createFramebuffer`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glCreateFramebuffer.xml)
* [`gl.deleteFramebuffer`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glDeleteFramebuffer.xml)
* [`gl.framebufferRenderbuffer`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glFramebufferRenderbuffer.xml)
* [`gl.framebufferTexture2D`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glFramebufferTexture2D.xml)
* [`gl.bindFramebuffer`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glBindFramebuffer.xml)


#### Update

**TODO**

#### Destroy

```javascript
fbo.destroy()
```

**Relevant WebGL APIs**

* [`gl.deleteFramebuffer`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glDeleteFramebuffer.xml)

---------------------------------------
### Cubic frame buffers

**TODO**

#### Constructor

#### Update

#### Destroy

---------------------------------------
## Other features
Other than draw commands and resources, there are a few miscellaneous parts of the WebGL API which REGL wraps for completeness.

---------------------------------------
### Clear the draw buffer
`regl.clear` combines `gl.clearColor, gl.clearDepth, gl.clearStencil` and `gl.clear` into a single procedure, which has the following usage:

```javascript
regl.clear({
  color: [0, 0, 0, 1],
  depth: 1,
  stencil: 0
})
```

| Property | Description |
|----------|-------------|
| `color` | Sets the clear color |
| `depth` | Sets the clear depth value |
| `stencil` | Sets the clear stencil value |

If an option is not present, then the corresponding buffer is not cleared

**Relevant WebGL APIs**

* [`gl.clearColor`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glClearColor.xml)
* [`gl.clearDepth`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glClearDepth.xml)
* [`gl.clearStencil`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glClearStencil.xml)
* [`gl.clear`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glClear.xml)

---------------------------------------
### Reading pixels

```javascript
var pixels = regl.read([options])
```

| Property | Description | Default |
|----------|-------------|---------|
| `data` | An optional `ArrayBufferView` which gets the result of reading the pixels | `null` |
| `x` | The x-offset of the upper-left corner of the rectangle in pixels | `0` |
| `y` | The y-offset of the upper-left corner of the rectangle in pixels | `0` |
| `width` | The width of the rectangle in pixels | viewport.width |
| `height` | The height of the rectangle in pixels | viewport.height |

**Relevant WebGL APIs**

* [`gl.pixelStorei`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glPixelStorei.xml)
* [`gl.readPixels`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glReadPixels.xml)

---------------------------------------
### Per-frame callbacks
`regl` also provides a common wrapper over `requestAnimationFrame` and `cancelAnimationFrame` that integrates gracefully with context loss events.

```javascript
// Hook a callback to execute each frame
var tick = regl.frame(function (context) {

  // context is the default state of the regl context variables

  // ...
})

// When we are done, we can unsubscribe by calling cancel on the callback
tick.cancel()
```

---------------------------------------
### Device capabilities and limits
regl exposes info about the WebGL context limits and capabilities via the `regl.limits` object.  The following properties are supported,

| Property | Description |
|----------|-------------|
| `colorBits` | An array of bits depths for the red, green, blue and alpha channels |
| `depthBits` | Bit depth of drawing buffer |
| `stencilBits` | Bit depth of stencil buffer |
| `subpixelBits` | `gl.SUBPIXEL_BITS` |
| `extensions` | A list of all supported extensions |
| `maxAnisotropic` | Maximum number of anisotropic filtering samples |
| `maxDrawbuffers` | Maximum number of draw buffers |
| `maxColorAttachments` | Maximum number of color attachments |
| `pointSizeDims` | `gl.ALIASED_POINT_SIZE_RANGE` |
| `lineWidthDims` | `gl.ALIASED_LINE_WIDTH_RANGE` |
| `maxViewportDims` | `gl.MAX_VIEWPORT_DIMS` |
| `maxCombinedTextureUnits` | `gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS` |
| `maxCubeMapSize` | `gl.MAX_CUBE_MAP_TEXTURE_SIZE` |
| `maxRenderbufferSize` | `gl.MAX_RENDERBUFFER_SIZE` |
| `maxTextureUnits` | `gl.MAX_TEXTURE_IMAGE_UNITS` |
| `maxTextureSize` | `gl.MAX_TEXTURE_SIZE` |
| `maxAttributes` | `gl.MAX_VERTEX_ATTRIBS` |
| `maxVertexUniforms` | `gl.MAX_VERTEX_UNIFORM_VECTORS` |
| `maxVertexTextureUnits` | `gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS` |
| `maxVaryingVectors` | `gl.MAX_VARYING_VECTORS` |
| `maxFragmentUniforms` | `gl.MAX_FRAGMENT_UNIFORM_VECTORS` |
| `glsl` | `gl.SHADING_LANGUAGE_VERSION` |
| `renderer` | `gl.RENDERER` |
| `vendor` | `gl.VENDOR` |
| `version` | `gl.VERSION` |

**Relevant WebGL APIs**

* [`gl.getParameter`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glGetParameter.xml)

---------------------------------------
### Performance metrics

**TODO**

---------------------------------------
### Clean up
When a `regl` context is no longer needed, it can be destroyed releasing all associated resources with the following command:

```javascript
regl.destroy()
```

---------------------------------------
### Context loss
`regl` makes a best faith effort to handle context loss by default.  This means that buffers and textures are reinitialized on a context restore with their contents.

**TODO**

---------------------------------------
### Unsafe escape hatch
**WARNING**: `regl` is designed in such a way that you should never have to directly access the underlying WebGL context. However, if you really absolutely need to do this for some reason (for example to interface with an external library), you can still get a reference to the WebGL context.  Note though that if you do this you will need to restore the `regl` state in order to prevent rendering errors.  This can be done with the following unsafe methods:

```javascript
// This retrieves a reference to the underlying WebGL context (don't do this!)
var gl = regl._gl

//  ... do some crazy direct manipulation here

// now restore the regl state
regl._refresh()

// Resume using regl as normal
```

Note that you must call `regl._refresh()` if you have changed the WebGL state.

---------------------------------------
## Tips

### Reuse resources (buffers, elements, textures, etc.)

### Preallocate memory

### Debug vs release

* Debug mode inserts many checks
* Compiling in release mode removes these assertions, improves performance and reduces bundle size

### Context loss mitigation
