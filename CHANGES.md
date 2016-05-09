# Release notes

## Planned

* Add a mechanism for requiring/selectively disabling extensions
* Upgrade vertex pointer format, allow for implicit conversion from arrays
* Improve validation of vertex attributes
* Refactor attributeState, some names are inconsistent and code is too complex
* Change buffer and texture APIs to separate data from rest of options (or maybe not?)
* Add in place update methods to buffers and textures
* Add support for polling buffers and animated GIFs (useful for web audio)
* Cubic framebuffer objects
* More unit tests, improve code coverage
* Benchmark suite
* Optimize generated code
* Optimize bundle size, remove string constants
* Support more DDS texture formats (HDR, PVRTC, etc.)
* Build a website (@freeman-lab is on it!)
* Recipe book/example set
    + Minecraft example
    + Globe
    + Tile based 2D rendering
    + Compound scene
    + Shadow mapping
    + Stencil shadows
    + Turing patterns
    + Spring/cloth physics
    + Asset loading (obj, ply, etc.)

## Next

## 0.4.0

* Circle CI finally passes!
* Use numeric ids instead of strings for shader sources
* Shader error messages are better
* Browserify transform to remove all runtime checks
* Shader linking is deferred until draw call, enables partial shaders in scope
* Report errors for missing attributes, uniforms and vertex count

## 0.3.0

* added renderbuffers (via regl.renderbuffer)
* added framebuffer objects (via regl.framebuffer)
* regl.buffer and regl.elements can now take ndarray-like inputs
* Switch to using Google closure compiler for minified builds

## 0.2.0

* Texture support implemented, but not well tested
* Fix attribute binding bug

## 0.1.0

* Actually kind of works now!
* All draw state and WebGL state except textures, renderbuffers and frame buffers wrapped
* Changed the arguments to dynamic functions.  Now they take (args, batchId, stats) instead of (frameCount, batchId)
* Tons of code generation improvements and bug fixing
* Unit tests!
* Code coverage metrics! (not good yet)
* API docs!

## 0.0.0

* First published to npm
