<div align="center">
  :crown:
</div>
<h1 align="center">
  regl
</h1>

<div align="center">
  Fast functional WebGL
</div>

<br />

<div align="center">
  <!-- Stability -->
  <a href="https://nodejs.org/api/documentation.html#documentation_stability_index">
    <img src="https://img.shields.io/badge/stability-experimental-orange.svg?style=flat-square"
      alt="API stability" />
  </a>
  <!-- NPM version -->
  <a href="https://npmjs.org/package/regl">
    <img src="https://img.shields.io/npm/v/regl.svg?style=flat-square"
      alt="NPM version" />
  </a>
  <!-- Build Status -->
  <a href="https://circleci.com/gh/regl-project/regl">
    <img src="https://circleci.com/gh/regl-project/regl.svg?style=shield"
      alt="Build Status" />
  </a>
  <!-- File size -->
  <a href="https://npmcdn.com/regl/dist/regl.min.js">
    <img src="https://badge-size.herokuapp.com/mikolalysenko/regl/gh-pages/dist/regl.min.js.svg?compression=gzip" alt="File Size" />
  </a>
  <!-- Downloads -->
  <a href="https://npmjs.org/package/regl">
    <img src="https://img.shields.io/npm/dm/regl.svg?style=flat-square"
      alt="Downloads" />
  </a>
  <!-- Standard -->
  <a href="https://standardjs.com">
    <img src="https://img.shields.io/badge/code%20style-standard-brightgreen.svg?style=flat-square"
      alt="Standard" />
  </a>
</div>

<div align="center">
  <h3>
    <a href="https://github.com/regl-project/regl/blob/gh-pages/API.md">
      Docs
    </a>
    <span> | </span>
    <a href="https://gitter.im/mikolalysenko/regl">
      Chat
    </a>
    <span> | </span>
    <a href="https://npmcdn.com/regl/dist/regl.js">
      Download
    </a>
    <span> | </span>
    <a href="https://npmcdn.com/regl/dist/regl.min.js">
      Minified
    </a>
  </h3>
</div>

## Example

`regl` simplifies WebGL programming by removing as much shared state as it can get away with.  To do this, it replaces the WebGL API with two fundamental abstractions, **resources** and **commands**:

* A **resource** is a handle to a GPU resident object, like a texture, FBO or buffer.
* A **command** is a complete representation of the WebGL state required to perform some draw call.

To define a command you specify a mixture of static and dynamic data for the object. Once this is done, `regl` takes this description and then compiles it into optimized JavaScript code.  For example, here is a simple `regl` program to draw a triangle:

```js
// Calling the regl module with no arguments creates a full screen canvas and
// WebGL context, and then uses this context to initialize a new REGL instance
const regl = require('regl')()

// Calling regl() creates a new partially evaluated draw command
const drawTriangle = regl({

  // Shaders in regl are just strings.  You can use glslify or whatever you want
  // to define them.  No need to manually create shader objects.
  frag: `
    precision mediump float;
    uniform vec4 color;
    void main() {
      gl_FragColor = color;
    }`,

  vert: `
    precision mediump float;
    attribute vec2 position;
    void main() {
      gl_Position = vec4(position, 0, 1);
    }`,

  // Here we define the vertex attributes for the above shader
  attributes: {
    // regl.buffer creates a new array buffer object
    position: regl.buffer([
      [-2, -2],   // no need to flatten nested arrays, regl automatically
      [4, -2],    // unrolls them into a typedarray (default Float32)
      [4,  4]
    ])
    // regl automatically infers sane defaults for the vertex attribute pointers
  },

  uniforms: {
    // This defines the color of the triangle to be a dynamic variable
    color: regl.prop('color')
  },

  // This tells regl the number of vertices to draw in this command
  count: 3
})

// regl.frame() wraps requestAnimationFrame and also handles viewport changes
regl.frame(({time}) => {
  // clear contents of the drawing buffer
  regl.clear({
    color: [0, 0, 0, 0],
    depth: 1
  })

  // draw a triangle using the command defined above
  drawTriangle({
    color: [
      Math.cos(time * 0.001),
      Math.sin(time * 0.0008),
      Math.cos(time * 0.003),
      1
    ]
  })
})
```

See this example [live](http://regl.party/examples/?basic)

### [More examples](https://regl-project.github.io/regl/www/gallery.html)

Check out the [gallery](https://regl-project.github.io/regl/www/gallery.html). The source code of all the gallery examples can be found [here](https://github.com/regl-project/regl/tree/gh-pages/example).

## Setup

`regl` has no dependencies, so setting it up is pretty easy.  There are 3 basic ways to do this:

### Live editing

To try out regl right away, you can use the live editor in the [gallery](http://regl.party/examples).

### npm

The easiest way to use `regl` in a project is via [npm](http://npmjs.com).  Once you have node set up, you can install and use `regl` in your project using the following command:

```sh
npm i -S regl
```

For more info on how to use npm, [check out the official docs](https://docs.npmjs.com/).

If you are using npm, you may also want to try [`budo`](https://github.com/mattdesl/budo) which is a live development server.

#### Run time error checking and browserify

By default if you compile `regl` with `browserify` then all error messages and run time checks are removed.  This is done to reduce the size of the final bundle.  If you are developing an application, you should run browserify using the `--debug` flag in order to enable error messages.  This will also generate source maps which make reading the source code of your application easier.

### Standalone script tag

You can also use `regl` as a standalone script if you are really stubborn.  The most recent versions can be found in the `dist/` folder and is also available from [npm cdn](https://npmcdn.com) in both minified and unminified versions.

* *Unminified*: [https://npmcdn.com/regl/dist/regl.js](https://npmcdn.com/regl/dist/regl.js)
* *Minified*: [https://npmcdn.com/regl/dist/regl.min.js](https://npmcdn.com/regl/dist/regl.min.js)

There are some difference when using `regl` in standalone.  Because script tags don't assume any sort of module system, the standalone scripts inject a global constructor function which is equivalent to the `module.exports` of `regl`:

```html
<!DOCTYPE html>
<html>
  <head>
    <meta content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=0" name="viewport" />
    <meta charset=utf-8>
  </head>
  <body>
  </body>
  <script language="javascript" src="https://npmcdn.com/regl/dist/regl.js"></script>
  <script language="javascript">
    var regl = createREGL()

    regl.frame(function () {
      regl.clear({
        color: [0, 0, 0, 1]
      })
    })
  </script>
</html>
```

## Why `regl`

`regl` just removes shared state from WebGL.  You can do anything you could in regular WebGL with little overhead and way less debugging. `regl` emphasizes the following values:

* **Simplicity** The interface is concise and emphasizes separation of concerns.  Removing shared state helps localize the effects and interactions of code, making it easier to reason about.
* **Correctness** `regl` has more than 30,000 unit tests and above 95% code coverage. In development mode, `regl` performs strong validation and sanity checks on all input data to help you catch errors faster.
* **Performance**  `regl` uses dynamic code generation and partial evaluation to remove almost all overhead.
* **Minimalism** `regl` just wraps WebGL.  It is not a game engine and doesn't have opinions about scene graphs or vector math libraries.   Any feature in WebGL is accessible, including advanced extensions like [multiple render targets](https://github.com/regl-project/regl/blob/gh-pages/example/deferred_shading.js) or [instancing](https://github.com/regl-project/regl/blob/gh-pages/example/instance-triangle.js).
* **Stability** `regl` takes interface compatibility and semantic versioning seriously, making it well suited for long lived applications that must be supported for months or years down the road.  It also has no dependencies limiting exposure to risky or unplanned updates.

### [Comparisons](https://regl-project.github.io/regl/www/compare.html)

While `regl` is lower level than many 3D engines, code written in it tends to be highly compact and flexible.  A comparison of `regl` to various other WebGL [libraries across several tasks can be found here](https://regl-project.github.io/regl/www/compare.html).

### [Benchmarks](https://regl-project.github.io/regl/www/bench-results/bench-result-8ea4a7e806beed0b9732)

In order to prevent performance regressions, `regl` is continuously
benchmarked.  You can run benchmarks locally using `npm run bench` or
[check them out
online](https://regl-project.github.io/regl/www/bench.html). The
[results for the last few days can be found
here.](https://regl-project.github.io/regl/www/bench-results/bench-result-db4b76e25bd8ed6d7ed9)

These measurements were taken using our custom scripts `bench-history` and
`bench-graph`. You can read more about them in [the development guide](https://github.com/regl-project/regl/blob/gh-pages/DEVELOPING.md).

### Projects using regl

The following is an incomplete list of projects using regl:

* [Repper Patterns](https://repper.app)
* [538 Gun Deaths](http://fivethirtyeight.com/features/gun-deaths/)
* [Infinite Terrain Demo](https://github.com/Erkaman/wireframe-world)
* [GPGPU Smooth Life](https://github.com/rreusser/regl-smooth-life)
* [Summed Area Tables](https://github.com/realazthat/glsl-sat)
* [GPGPU Fourier Analysis](https://github.com/dfcreative/gl-fourier)
* [GPU accelerated handwritten digit recognition with regl using Convolutional Neural Networks](https://github.com/Erkaman/regl-cnn)
* [CitiBike Commute](https://tbaldw.in/citibike-trips)
* [Audiofabric](https://tbaldw.in/audiofabric)
* [All the Buildings in Manhattan](https://tbaldw.in/nyc-buildings)
* [Interactive Electromagnetic Field Simulation](https://cemsim.com)
* [Synesthesia - GPU Visuals triggered by sound](https://synesthesia.rikard.io)
* [Fractal.Garden - Realtime interactive 3D fractal explorer](https://github.com/ath92/fractal-garden)
* [Deepscatter - Zoomable, animated scatterplots in the browser that scales over a billion points](https://github.com/nomic-ai/deepscatter)

If you have a project using regl that isn't on this list that you would like to see added, [please send us a pull request!](https://github.com/regl-project/regl/edit/gh-pages/README.md)

## [Help Wanted](https://github.com/regl-project/regl/issues?q=is%3Aopen+is%3Aissue+label%3A%22help+wanted%22)

regl is still under active developement, and anyone willing to contribute is very much welcome to do so. Right now, what we need the most is for people to write examples and demos with the framework. This will allow us to find bugs and deficiencies in the API. We have a list of examples we would like to be implemented [here](https://github.com/regl-project/regl/issues?q=is%3Aopen+is%3Aissue+label%3Aexample), but you are of course welcome to come up with your own examples. To add an example to our gallery of examples, [please send us a pull request!](https://github.com/regl-project/regl/pulls)

## [API docs](https://github.com/regl-project/regl/blob/gh-pages/API.md)

`regl` has extensive API documentation.  You can browse the [docs online here](https://github.com/regl-project/regl/blob/gh-pages/API.md).

## [Development](https://github.com/regl-project/regl/blob/gh-pages/DEVELOPING.md)

The latest changes in `regl` can be found in the [CHANGELOG](https://github.com/regl-project/regl/blob/gh-pages/CHANGES.md).

[For info on how to build and test headless, see the contributing guide here](https://github.com/regl-project/regl/blob/gh-pages/DEVELOPING.md)

## [License](LICENSE)

All code (c) 2016 MIT License

Development supported by the [Freeman Lab](https://www.janelia.org/lab/freeman-lab) and the Howard Hughes Medical Institute ([@freeman-lab](https://github.com/freeman-lab) on GitHub)

#### Asset licenses

Many examples use creative commons or public domain artwork for illustrative purposes.  These assets are not included in any of the redistributable packages of regl.

* Peppers test image for cube comparison is public domain
* Test video (doggie-chromakey.ogv) by [L0ckergn0me](https://archive.org/details/L0ckergn0me-PixieGreenScreen446), used under creative commons license
* Cube maps (posx.jpeg, negx.jpeg, posy.jpeg, negy.jpeg, posz.jpeg, negz.jpeg) by [Humus](http://www.humus.name/index.php?page=Textures), used under creative commons 3 license
* Environment map of Oregon (ogd-oregon-360.jpg) due to Max Ogden ([@maxogd](https://github.com/maxogden) on GitHub)
* DDS test images (alpine_cliff_a, alpine_cliff_a_norm, alpine_cliff_a_spec) taken from the CC0 license [0-AD texture pack by Wildfire games](http://opengameart.org/content/0-ad-textures)
* Tile set for tile mapping demo (tiles.png) from CC0 licensed [cobblestone paths pack](http://opengameart.org/content/rpg-tiles-cobble-stone-paths-town-objects)
* Audio track for `audio.js` example is "[Bamboo Cactus](https://archive.org/details/8bp033)" by [8bitpeoples](https://archive.org/details/8bitpeoples).  CC BY-ND-NC 1.0 license
* Matcap (spheretexture.jpg) by [Ben Simonds](https://bensimonds.com/2010/07/30/matcap-generator/). CC 3 license.
* Normal map (normaltexture.jpg) by [rubberduck](http://opengameart.org/node/21219). CC0 license.
