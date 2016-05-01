# Release notes

## Planned

* Improve readability of generated code
* Use numeric ids instead of strings for shader sources
* Better error messages for shader compilation failure
* Change buffer and texture APIs to separate data from rest of options
* Add in place update methods to buffers and textures
* Add support for polling buffers and animated GIFs (useful for web audio)
* Support more DDS texture formats (HDR, PVRTC, etc.)
* Cubic framebuffer objects
* Benchmark suite
* More unit tests
* Reduce bundle size
* Web site
* Recipe book

## Next

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
