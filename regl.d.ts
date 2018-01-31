// Type definitions for regl 1.3.1
// Project: regl
// Definitions by: Stepan Stolyarov <stepan.stolyarov@gmail.com>, David Schneider <github.com/davschne>

/*~ Note that ES6 modules cannot directly export callable functions.
 *~ This file should be imported using the CommonJS-style:
 *~
 *~ ```typescript
 *~ import REGL = require('regl');
 *~ ```
 *~
 *~ Refer to the documentation to understand common
 *~ workarounds for this limitation of ES6 modules.
 */

/*~ This module is a UMD module that exposes a global function `createREGL`. */
export as namespace createREGL;

export = REGL;

/**
 * Creates a full screen canvas element and a WebGL rendering context.
 */
declare function REGL(): REGL.Regl;

/**
 * Creates a WebGL rendering context using an element selected by `selector`.
 * This may be:
 * 1) an existing HTMLCanvasElement
 * 2) an element that contains a canvas
 * 3) an element in which you'd like `regl` to create a canvas
 *
 * @param selector an argument to `document.querySelector`
 */
declare function REGL(selector: string): REGL.Regl;

/**
 * Creates a canvas element and a WebGL rendering context in a given container element.
 *
 * @param container an HTML element
 */
declare function REGL(container: HTMLElement): REGL.Regl;

/**
 * Creates a WebGL rendering context using a `<canvas>` element.
 *
 * @param canvas HTML canvas element
 */
declare function REGL(canvas: HTMLCanvasElement): REGL.Regl;

/**
 * Wraps an existing WebGL rendering context.
 *
 * @param gl WebGL rendering context
 */
declare function REGL(gl: WebGLRenderingContext): REGL.Regl;

/**
 * Creates a WebGL according to specified `options`
 */
declare function REGL(options: REGL.InitializationOptions): REGL.Regl;

declare namespace REGL {
  /**
   * Documentation for interface `Regl`.
   */
  export interface Regl {
    readonly attributes: WebGLContextAttributes;
    readonly _gl: WebGLRenderingContext;
    readonly limits: REGL.Limits;
    readonly stats: REGL.Stats;

    /**
     * Creates a new REGL command. The resulting command, when executed,
     * will set a WebGL state machine to a specified `state`.
     */
    (state: REGL.State): REGL.Command;

    /** Clears selected buffers to specified values. */
    clear(options: REGL.ClearOptions): void;

    /* Reading pixels */

    /**
     * Read entire screen.
     */
    read(): Uint8Array | Float32Array;

    /**
     * Read entire screen into an existing `ArrayBufferView`.
     */
    read<T extends Uint8Array | Float32Array>(data: T): T;

    /**
     * Read a selected region of screen or framebuffer.
     */
    read<T extends Uint8Array | Float32Array>(options: REGL.ReadOptions<T>): T;

    /* Dynamic variable binding */

    prop(name: string): REGL.DynamicVariable;
    context(name: string): REGL.DynamicVariable;
    this(name: string): REGL.DynamicVariable;

    /* Drawing */

    /** Executes an empty draw command */
    draw(): void;

    /* Resource creation */

    buffer(length: number): REGL.Buffer;
    buffer(options: REGL.BufferOptions): REGL.Buffer;

    elements(options: REGL.ElementsOptions): REGL.Elements;

    /**
     * Creates an empty texture with given dimensions.
     *
     * @param width     width of a texture, in pixels (Default: `1`)
     * @param height    height of a texture, in pixels (Default: equal to `width`)
     */
    texture(width?: number, height?: number): REGL.Texture2D;
    texture(data: REGL.TextureImageData): REGL.Texture2D;
    texture(options: REGL.Texture2DOptions): REGL.Texture2D;

    cube(radius?: number): REGL.TextureCube;
    cube(
      posX: REGL.TextureImageData, negX: REGL.TextureImageData,
      posY: REGL.TextureImageData, negY: REGL.TextureImageData,
      posZ: REGL.TextureImageData, negZ: REGL.TextureImageData
    ): REGL.TextureCube;
    cube(options: REGL.TextureCubeOptions): REGL.TextureCube;

    renderbuffer(options: REGL.RenderbufferOptions): REGL.Renderbuffer;

    framebuffer(options: REGL.FramebufferOptions): REGL.Framebuffer;

    framebufferCube(options: REGL.FramebufferCubeOptions): REGL.FramebufferCube;

    /* Events and listeners */

    /**
     * Registers a `callback` to be called on each animation frame.
     *
     * This method integrates with `requestAnimationFrame` and context loss
     * events. It also calls `gl.flush` and drains several internal buffers,
     * so you should try to do all your rendering to the drawing buffer within
     * the frame callback.
     */
    frame(callback: () => void): REGL.Cancel;

    on(type: "frame", handler: () => void): REGL.Cancel;
    on(type: "lost", handler: () => void): REGL.Cancel;
    on(type: "restore", handler: () => void): REGL.Cancel;
    on(type: "destroy", handler: () => void): REGL.Cancel;

    /* Extensions */

    /**
     * Test if an extension is present. Argument is case insensitive.
     *
     * For more information on WebGL extensions, see the WebGL extension registry.
     *
     * Relevant WebGL APIs
     *
     * - [WebGL Extension Registry](https://www.khronos.org/registry/webgl/extensions/)
     * - gl.getExtension
     * - gl.getSupportedExtensions
     *
     * @param name case-insensitive name of WebGL extension
     */
    hasExtension(name: string): boolean;

    /* Poll viewport and timers */

    /**
     * Updates the values of internal times and recalculates the size of viewports.
     */
    poll(): void;

    /* Current time */

    /**
     * Returns Total time elapsed since regl was initialized in seconds.
     */
    now(): number;

    /* Destruction */

    /**
     * Destroys the gl context and releases all associated resources.
     */
    destroy(): void;

    /* Refresh */

    _refresh(): void;
  }

  interface InitializationOptions {
    /** A reference to a WebGL rendering context. (Default created from canvas) */
    gl?: WebGLRenderingContext;
    /** An HTML canvas element or a selector string to find this element. (Default created and appended to container)*/
    canvas?: string | HTMLCanvasElement;
    /** A container element into which regl inserts a canvas or a selector string to find this element. (Default document.body) */
    container?: string | HTMLElement;
    /** The context creation attributes passed to the WebGL context constructor. */
    attributes?: WebGLContextAttributes;
    /** A multiplier which is used to scale the canvas size relative to the container. (Default window.devicePixelRatio) */
    pixelRatio?: number;
    /** A list of extensions that must be supported by WebGL context. Default [] */
    extensions?: string | string[];
    /** A list of extensions which are loaded opportunistically. Default [] */
    optionalExtensions?: string | string[];
    /** If set, turns on profiling for all commands by default. (Default false) */
    profile?: boolean;
    /** An optional callback which accepts a pair of arguments, (err, regl) that is called after the application loads. If not specified, context creation errors throw */
    onDone?: (err: Error | null, regl?: Regl) => void;
  }

  interface Context {
    /** The number of frames rendered */
    readonly tick: number;
    /** Total time elapsed since regl was initialized in seconds */
    readonly time: number;
    /** Width of the current viewport in pixels */
    readonly viewportWidth: number;
    /** Height of the current viewport in pixels */
    readonly viewportHeight: number;
    /** Width of the WebGL context drawing buffer */
    readonly drawingBufferWidth: number;
    /** Height of the WebGL context drawing buffer */
    readonly drawingBufferHeight: number;
    /** The pixel ratio of the drawing buffer */
    readonly pixelRatio: number;
  }

  interface Cancel {
    cancel(): void;
  }

  type DynamicVariable = {
    // This type is supposed to be opaque.
    "Dynamic Variable": void;

    // Properties are listed only because TS casts _anything_ to `DynamicVariable`.
    // readonly id: number;
    // readonly type: T;
  }

  type DynamicVariableFn = (context: REGL.Context, props: REGL.Props, batchId: number) => PropType;

  interface ClearOptions {
    /** Specify the red, green, blue, and alpha values used when the color buffers are cleared. The initial values are all `0.0`. */
    color?: [number, number, number, number];
    /** Specifies the depth value used when the depth buffer is cleared. The initial value is `1.0`. */
    depth?: number;
    /** Specifies the index used when the stencil buffer is cleared. The initial value is `0`. */
    stencil?: number;
    /** Sets the target framebuffer to clear (if unspecified, uses the current framebuffer object). */
    framebuffer?: REGL.Framebuffer | null;
  }

  interface ReadOptions<T> {
    /** An optional ArrayBufferView which gets the result of reading the pixels. (Default: `null`) */
    data?: T;
    /** The x-offset of the upper-left corner of the rectangle in pixels. (Default: `0`) */
    x?: number;
    /** The y-offset of the upper-left corner of the rectangle in pixels. (Default: `0`) */
    y?: number;
    /** The width of the rectangle in pixels. (Default: current framebuffer width) */
    width?: number;
    /** The height of the rectangle in pixels (Default: current framebuffer height) */
    height?: number;
    /** Sets the framebuffer to read pixels from. (Default: currently bound framebuffer) */
    framebuffer?: REGL.Framebuffer;
  }

  interface CommandBodyFn {
    /**
     * @param context       REGL context
     * @param props         additional parameters of a draw call
     * @param batchId       index of a command in a batch call
     */
    (context: REGL.Context, props: REGL.Props, batchId: number): void;
  }

  /**
   * A *command* is a complete representation of the WebGL state required
   * to perform some draw call.
   */
  interface Command {
    readonly stats: REGL.CommandStats;

    /** Run a command once. */
    (body?: REGL.CommandBodyFn): void;
    /** Run a command `count` times. */
    (count: number, body?: REGL.CommandBodyFn): void;
    /** Run a command batch. */
    (props: REGL.Props | REGL.Props[], body?: REGL.CommandBodyFn): void;
  }

  interface State {

    /* Shaders */

    /** Source code of vertex shader */
    vert?: string;
    /** Source code of fragment shader */
    frag?: string;

    /**
     * Related WebGL APIs
     *
     * - gl.getUniformLocation
     * - gl.uniform
     */
    uniforms?: REGL.Props;

    /**
     * Related WebGL APIs
     *
     * - gl.vertexAttribPointer
     * - gl.vertexAttrib
     * - gl.getAttribLocation
     * - gl.vertexAttibDivisor
     * - gl.enableVertexAttribArray, gl.disableVertexAttribArray
     */
    attributes?: {
      [name: string]: REGL.Attribute;
    }

    /* Drawing */

    /**
     * Sets the primitive type.
     */
    primitive?: REGL.PrimitiveType;
    /**
     * Number of vertices to draw.
     */
    count?: number;
    /**
     * Offset of primitives to draw.
     */
    offset?: number;
    /**
     * Number of instances to draw. (Default: 0)
     *
     * Only applicable if the `ANGLE_instanced_arrays` extension is present.
     */
    instances?: number;
    /**
     * Element array buffer. (Default: `null`)
     *
     * If `elements` is specified while `primitive`, `count` and `offset` are not,
     * then these values may be inferred from the state of the element array buffer.
     */
    elements?: REGL.Elements; // TODO number[],
    /* Render target */

    /**
     * A framebuffer to be used as a target for drawing.
     *
     * Related WebGL APIs
     *
     * - [gl.bindFramebuffer](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glBindFramebuffer.xml)
     */
    framebuffer?: REGL.Framebuffer | null;

    /* Profiling */
    /** If set, turns on profiling for this command. (Default: `false`) */
    profile?: boolean;

    /* Depth buffer */

    /**
     * Related WebGL APIs
     *
     * - gl.depthFunc
     * - gl.depthMask
     * - gl.depthRange
     */
    depth?: REGL.DepthTestOptions;

    /* Blending */

    /**
     * Related WebGL APIs
     *
     * - gl.blendEquationSeparate
     * - gl.blendFuncSeparate
     * - gl.blendColor
     */
    blend?: REGL.BlendingOptions;

    /* Stencil */

    /**
     * Related WebGL APIs
     *
     * - gl.stencilFunc
     * - gl.stencilMask
     * - gl.stencilOpSeparate
     */
    stencil?: REGL.StencilOptions;

    /* Polygon offset */

    /**
     * Related WebGL APIs
     *
     * - gl.polygonOffset
     */
    polygonOffset?: REGL.PolygonOffsetOptions;

    /* Culling */

    cull?: REGL.CullingOptions;

    /* Front face */

    frontFace?: REGL.FaceWindingType;

    /* Dithering */

    dither?: boolean;

    /* Line width */

    lineWidth?: number;

    /* Color mask */

    /**
     * - [gl.colorMask](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glColorMask.xml)
     */
    colorMask?: [boolean, boolean, boolean, boolean];

    /* Sample coverage */

    /**
     * - [gl.sampleCoverage](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glSampleCoverage.xml)
     */
    sample?: REGL.SamplingOptions;

    /* Scissor */

    /**
     * - [gl.scissor](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glScissor.xml)
     */
    scissor?: REGL.ScissorOptions;

    /* Viewport */

    /**
     * - [gl.viewport](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glViewport.xml)
     */
    viewport?: REGL.ViewportOptions;
  }

  interface Attribute {
    /** A REGLBuffer wrapping the buffer object. (Default: null) */
    buffer?: REGL.Buffer;
    /** The offset of the vertexAttribPointer in bytes. (Default: 0) */
    offset?: number;
    /** The stride of the vertexAttribPointer in bytes. (Default: 0) */
    stride?: number;
    /** Whether the pointer is normalized. (Default: false) */
    normalized?: boolean;
    /** The size of the vertex attribute. (Default: Inferred from shader) */
    size?: number;
    /** Sets gl.vertexAttribDivisorANGLE. (Default: 0) */
    divisor?: number;
  }

  interface DepthTestOptions {
    enable?: boolean;
    mask?: boolean;
    func?: REGL.ComparisonOperatorType;
    range?: [number, number];
  }

  interface BlendingOptions {
    enable?: boolean;
    func?: {
      srcRGB: BlendingFunctionType;
      srcAlpha: BlendingFunctionType;
      dstRGB: BlendingFunctionType;
      dstAlpha: BlendingFunctionType;
    };
    equation?: {
      rgb?: REGL.BlendingEquationType;
      alpha?: string;
    };
    color?: [number, number, number, number];
  }

  interface StencilOptions {
    enable?: boolean;
    mask?: number;
    func?: REGL.StencilFunction;
    opFront?: REGL.StencilOperation;
    opBack?: REGL.StencilOperation;
    op?: REGL.StencilOperation;
  }

  interface StencilFunction {
    cmp: REGL.ComparisonOperatorType;
    ref: number;
    mask: number;
  }

  interface StencilOperation {
    fail: REGL.StencilOperationType;
    zfail: REGL.StencilOperationType;
    zpass: REGL.StencilOperationType;
  }

  interface PolygonOffsetOptions {
    enable?: boolean;
    offset: {
      factor: number;
      units: number;
    }
  }

  interface CullingOptions {
    enable?: boolean;
    face?: REGL.FaceOrientationType;
  }


  interface SamplingOptions {
    /** Toggles `gl.enable(gl.SAMPLE_COVERAGE)` */
    enable?: boolean;
    /** Toggles `gl.enable(gl.SAMPLE_ALPHA_TO_COVERAGE)` */
    alpha?: boolean;
    /** Sets `gl.sampleCoverage` */
    coverage?: {
      value: number;
      invert: boolean;
    }
  }

  interface ScissorOptions {
    enable: boolean;
    box: {
      x: number;
      y: number;
      width: number;
      height: number;
    }
  }

  interface ViewportOptions {
    x: number;
    y: number;
    width: number;
    height: number;
  }

  /*
    * Resources
    */

  /**
   * A *resource* is a handle to a GPU resident object, like a texture, FBO or buffer.
   */
  interface Resource {
    destroy(): void;
  }

  interface BufferOptions {
    data?: REGL.BufferDataType | null;
    length?: number;
    usage?: REGL.BufferUsageHintType;
    type?: REGL.BufferDataTypeType;
  }

  interface Buffer extends Resource {
    readonly stats: {
        /** The size of the buffer in bytes. */
        size: number;
    }

    /**
     * Reinitializes the buffer with the new content.
     */
    (options: REGL.BufferOptions): void;

    subdata(data: REGL.BufferDataType, offset?: number): void;
  }

  interface ElementsOptions {
    data?: REGL.BufferDataType;
    usage?: REGL.BufferUsageHintType;
    length?: number;
    primitive?: REGL.PrimitiveType;
    type?: REGL.ElementsDataTypeType;
    count?: number;
  }

  interface Elements extends Resource {
    // TODO stats: { size: number } ???
    (data: ElementsOptions): void;

    subdata(data: ElementsOptions, offset?: number): void;
  }

  interface Texture2DOptions {
    /** Sets `width`, `height` and, optionally, `channels`. */
    shape?: [number, number] | [number, number, REGL.TextureChannelsType];
    /** Sets equal `width` and `height`. */
    radius?: number;
    width?: number;
    height?: number;

    data?: REGL.TextureImageData;

    mag?: REGL.TextureMagFilterType;
    min?: REGL.TextureMinFilterType;
    wrapS?: REGL.TextureWrapModeType;
    wrapT?: REGL.TextureWrapModeType;
    aniso?: number;
    type?: REGL.TextureDataTypeType;

    mipmap?: REGL.TextureMipmapHintType;
    flipY?: boolean;
    alignment?: number;
    premultiplyAlpha?: boolean;
    colorSpace?: REGL.TextureColorSpaceType;
    unpackAlignment?: REGL.TextureUnpackAlignmentType;
    channels?: REGL.TextureChannelsType;
  }

  interface Texture extends Resource {
    readonly stats: {
        /** Size of the texture, in bytes. */
        size: number;
    }

    /** Width of texture. */
    readonly width: number;
    /** Height of texture. */
    readonly height: number;
    /** Texture format. */
    readonly format: REGL.TextureFormatType;
    /** Texture data type. */
    readonly type: REGL.TextureDataTypeType;
    /** Texture magnification filter. */
    readonly mag: REGL.TextureMagFilterType;
    /** Texture minification filter. */
    readonly min: REGL.TextureMinFilterType;
    /** Texture wrap mode on S axis. */
    readonly wrapS: REGL.TextureWrapModeType;
    /** Texture wrap mode on T axis. */
    readonly wrapT: REGL.TextureWrapModeType;
  }

  interface Texture2D extends Texture {
    /** Reinitializes the texture. */
    (data: Texture2DOptions): void;

    /**
     * Replaces the part of texture with new data.
     *
     * @param data      image data object, similar to arguments for the texture constructor
     * @param x         horizontal offset of the image within the texture (Default: `0`)
     * @param y         vertical offset of the image within the texture (Default: `0`)
     * @param level     mipmap level of the texture to modify (Default: `0`)
     */
    subimage(data: Texture2DOptions, x?: number, y?: number, level?: number): void;

    /** Resizes a texture. */
    resize(width?: number, height?: number): void;
  }

  interface TextureCubeOptions {
    radius?: number;
    faces?: [
        TextureImageData, TextureImageData,
        TextureImageData, TextureImageData,
        TextureImageData, TextureImageData
    ];
  }

  interface TextureCube extends Texture {
    resize(): void;
    resize(radius: number): void;

    subimage(face: REGL.TextureCubeFaceIndexType, data: TextureImageData, x?: number, y?: number, level?: number);
  }

  interface RenderbufferOptions {
    /** Sets the internal format of the render buffer (Default `'rgba4'`) */
    format?: REGL.RenderbufferFormatType;
    /** Sets the width of the render buffer in pixels. (Default `1`) */
    width?: number;
    /** Sets the height of the render buffer in pixels. (Default `1`) */
    height?: number;
    /** Alias for `[width, height]`. (Default `[1, 1]`) */
    shape?: [number, number];
    /** Simultaneously sets width and height. (Default `1`) */
    radius?: number;
  }

  interface Renderbuffer extends Resource {
    readonly stats: {
        /** Size of the renderbuffer in bytes. */
        size: number;
    }

    /** Width of the renderbuffer */
    readonly width: number;
    /** Height of the renderbuffer */
    readonly height: number;
    /** Format of the renderbuffer. */
    readonly format: number;

    (options: REGL.RenderbufferOptions): void;

    // resize(): void; // TODO Check implementation if this signature is valid
    // resize(radius: number): void; // TODO Check implementation if this signature is valid
    resize(width: number, height: number): void;
  }

  interface FramebufferOptions {
    // Sets the width of the framebuffer	gl.drawingBufferWidth
    width?: number;
    // Sets the height of the framebuffer	gl.drawingBufferHeight
    height?: number;
    // An optional array of either textures renderbuffers for the color attachment.
    color?: any; // TODO What is the valid type of `FramebufferOptions.color`?
    // If boolean, then toggles the depth attachment. Otherwise if a renderbuffer/texture sets the depth attachment.	true
    depth?: boolean | REGL.Renderbuffer | REGL.Texture; // TODO Is it `REGL.Texture2D` only?
    // If boolean, then toggles the stencil attachment. Otherwise if a renderbuffer sets the stencil attachment.	true
    stencil?: boolean | REGL.Renderbuffer; // TODO Does it support `REGL.Texture`?
    // If boolean, then toggles both the depth and stencil attachment. Otherwise if a renderbuffer/texture sets the combined depth/stencil attachment.	true
    depthStencil?: boolean | REGL.Renderbuffer | REGL.Texture; // TODO Is it `REGL.Texture2D` only?
    // Sets the format of the color buffer. Ignored if color	'rgba'
    colorFormat?: REGL.FramebufferColorFormatType;
    // Sets the type of the color buffer if it is a texture	'uint8'
    colorType?: REGL.FramebufferColorDataTypeType;
    // Sets the number of color buffers. Values > 1 require WEBGL_draw_buffers	1
    colorCount?: number;
    // Toggles whether depth/stencil attachments should be in texture. Requires WEBGL_depth_texture	false
    depthTexture?: boolean;
  }

  interface Framebuffer extends Resource {
    // TODO check if FBO has `stats: { size: number; }` and other properties.
    (options: FramebufferOptions): void;

    /* Framebuffer binding */

    /**
     * For convenience it is possible to bind a framebuffer directly.
     * This is a short cut for creating a command which sets the framebuffer.
     */
    use(body: CommandBodyFn): void;

    // resize(): void;
    resize(radius: number): void;
    resize(width: number, height: number): void;
  }

  interface FramebufferCubeOptions {
    /** The size of the cube buffer. */
    radius?: number;
    /** The color buffer attachment. */
    color?: REGL.TextureCube;
    /** Format of color buffer to create. */
    colorFormat?: "rgba"; // TODO Color formats for `FramebufferCube` other that `rgba`?
    /** Type of color buffer. */
    colorType?: FramebufferColorDataTypeType;
    /** Number of color attachments. */
    colorCount?: number;
    /** Depth buffer attachment. */
    depth?: boolean; // TODO REGL.TextureCube ?
    /** Stencil buffer attachment. */
    stencil?: boolean; // TODO REGL.TextureCube ?
    /** Depth-stencil attachment. */
    depthStencil?: boolean; // TODO REGL.TextureCube ?
  }

  interface FramebufferCube extends Resource {
    (options: FramebufferCubeOptions): void;

    // resize(): void;
    resize(radius: number): void;
  }

  // TODO Revise the types of `REGL.Limits` fields
  interface Limits {
    /** An array of bits depths for the red, green, blue and alpha channels */
    colorBits?: [number, number, number, number];
    /** Bit depth of drawing buffer */
    depthBits?: number;
    /** Bit depth of stencil buffer */
    stencilBits?: number;
    /** gl.SUBPIXEL_BITS */
    subpixelBits?: any;
    /** A list of all supported extensions */
    extensions?: string[];
    /** Maximum number of anisotropic filtering samples */
    maxAnisotropic?: number;
    /** Maximum number of draw buffers */
    maxDrawbuffers?: number;
    /** Maximum number of color attachments */
    maxColorAttachments?: number;
    /** gl.ALIASED_POINT_SIZE_RANGE */
    pointSizeDims?: any;
    /** gl.ALIASED_LINE_WIDTH_RANGE */
    lineWidthDims?: any;
    /** gl.MAX_VIEWPORT_DIMS */
    maxViewportDims?: any;
    /** gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS */
    maxCombinedTextureUnits?: any;
    /** gl.MAX_CUBE_MAP_TEXTURE_SIZE */
    maxCubeMapSize?: any;
    /** gl.MAX_RENDERBUFFER_SIZE */
    maxRenderbufferSize?: any;
    /** gl.MAX_TEXTURE_IMAGE_UNITS */
    maxTextureUnits?: any;
    /** gl.MAX_TEXTURE_SIZE */
    maxTextureSize?: any;
    /** gl.MAX_VERTEX_ATTRIBS */
    maxAttributes?: any;
    /** gl.MAX_VERTEX_UNIFORM_VECTORS */
    maxVertexUniforms?: any;
    /** gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS */
    maxVertexTextureUnits?: any;
    /** gl.MAX_VARYING_VECTORS */
    maxVaryingVectors?: any;
    /** gl.MAX_FRAGMENT_UNIFORM_VECTORS */
    maxFragmentUniforms?: any;
    /** gl.SHADING_LANGUAGE_VERSION */
    glsl?: string;
    /** gl.RENDERER */
    renderer?: string;
    /** gl.VENDOR */
    vendor?: string;
    /** gl.VERSION */
    version?: string;
  }

  // TODO Revise the types of `REGL.Stats`
  interface Stats {
    /** The number of array buffers currently allocated */
    bufferCount?: number;
    /** The number of element buffers currently allocated */
    elementsCount?: number;
    /** The number of framebuffers currently allocated */
    framebufferCount?: number;
    /** The number of shaders currently allocated */
    shaderCount?: number;
    /** The number of textures currently allocated */
    textureCount?: number;
    /** The number of cube maps currently allocated */
    cubeCount?: number;
    /** The number of renderbuffers currently allocated */
    renderbufferCount?: number;
    /** The total amount of memory allocated for textures and cube maps */
    getTotalTextureSize(): number;
    /** The total amount of memory allocated for array buffers and element buffers */
    getTotalBufferSize(): number;
    /** The total amount of memory allocated for renderbuffers */
    getTotalRenderbufferSize(): number;
    /** The maximum number of uniforms in any shader */
    getMaxUniformsCount(): number;
    /** The maximum number of attributes in any shader */
    getMaxAttributesCount(): number;
    /** The maximum number of texture units used */
    maxTextureUnits: number;
  }

  interface CommandStats {
    /** The number of times the command has been called. */
    count: number;
    /** The cumulative CPU time spent executing the command in milliseconds. */
    cpuTime: number;
    /**
     * The cumulative GPU time spent executing the command in milliseconds
     * (requires the `EXT_disjoint_timer_query` extension).
     */
    gpuTime: number;
  }

  type ComparisonOperatorType =
    "never" |
    "always" |
    "less" | "<" |
    "lequal" | "<=" |
    "greater" | ">" |
    "gequal" | ">=" |
    "equal" | "=" |
    "notequal" | "!=";

  type BlendingEquationType =
    "add" |
    "subtract" |
    "reverse subtract" |
    "min" |
    "max";

  type BlendingFunctionType =
    "zero" | 0 |
    "one" | 1 |
    "src color" |
    "one minus src color" |
    "src alpha" |
    "one minus src alpha" |
    "dst color" |
    "one minus dst color" |
    "dst alpha" |
    "one minus dst alpha" |
    "constant color" |
    "one minus constant color" |
    "constant alpha" |
    "one minus constant alpha" |
    "src alpha saturate";

  type StencilOperationType =
    "zero" |
    "keep" |
    "replace" |
    "invert" |
    "increment" |
    "decrement" |
    "increment wrap" |
    "decrement wrap";

  type FaceOrientationType =
    "front" |
    "back";

  type FaceWindingType =
    "cw" |
    "ccw";

  type PrimitiveType =
    "points" |
    "lines" |
    "line strip" |
    "line loop" |
    "triangles" |
    "triangle strip" |
    "triangle fan";

  type BufferDataType =
    (number | number[])[] |
    Uint8Array |
    Int8Array |
    Uint16Array |
    Int16Array |
    Uint32Array |
    Int32Array |
    Float32Array; // | REGL.Buffer

  type BufferUsageHintType =
    "static" |
    "dynamic" |
    "stream";

  type BufferDataTypeType =
    "uint8" |
    "int8" |
    "uint16" |
    "int16" |
    "uint32" |
    "int32" |
    "float32" | "float";

  type ElementsDataTypeType =
    "uint8" |
    "uint16" |
    "uint32"; // | REGL.Elements

  // TODO Cover all possible things that could be used to create/update a texture
  // Possible candidates: HTMLImageElement, HTMLVideoElement, NDArray,
  // various typed arrays and (unflattened) JS arrays.
  type TextureImageData =
    number[] |
    number[][] |
    ArrayBufferView |
    HTMLImageElement |
    HTMLCanvasElement |
    CanvasRenderingContext2D |
    HTMLVideoElement |
    REGL.NDArray;

  type TextureFormatType =
    "alpha" |
    "luminance" |
    "luminance alpha" |
    "rgb" |
    "rgba" |
    "rgba4" |
    "rgb5 a1" |
    "rgb565" |
    "srgb" |
    "srgba" |
    "depth" |
    "depth stencil" |
    "rgb s3tc dxt1" |
    "rgba s3tc dxt1" |
    "rgba s3tc dxt3" |
    "rgba s3tc dxt5" |
    "rgb atc" |
    "rgba atc explicit alpha" |
    "rgba atc interpolated alpha" |
    "rgb pvrtc 4bppv1" |
    "rgb pvrtc 2bppv1" |
    "rgba pvrtc 4bppv1" |
    "rgba pvrtc 2bppv1" |
    "rgb etc1";

  type TextureDataTypeType =
    "uint8" |
    "uint16" |
    "uint32" |
    "float" |
    "half float";

  type TextureMagFilterType =
    "nearest" |
    "linear";

  type TextureMinFilterType =
    "nearest" |
    "linear" |
    "linear mipmap linear" | "mipmap" |
    "nearest mipmap linear" |
    "linear mipmap nearest" |
    "nearest mipmap nearest";

  type TextureMipmapHintType =
    "don't care" | "dont care" |
    "nice" |
    "fast";

  type TextureColorSpaceType =
    "none" | "browser";

  type TextureWrapModeType =
    "repeat" |
    "clamp" |
    "mirror";

  type TextureChannelsType = 1 | 2 | 3 | 4;

  type TextureUnpackAlignmentType = 1 | 2 | 4 | 8;

  type TextureCubeFaceIndexType = 0 | 1 | 2 | 3 | 4 | 5;

  type RenderbufferFormatType =
    "rgba4" |
    "rgb565" |
    "rgb5 a1" |
    "depth" |
    "stencil" |
    "depth stencil" |
    "srgba" |
    "rgba16f" |
    "rgb16f" |
    "rgba32f";

  type FramebufferColorFormatType =
    "rgba" |
    "rgba4" |
    "rgb565" |
    "rgb5 a1" |
    "rgb16f" |
    "rgba16f" |
    "rgba32f" |
    "srgba";

  type FramebufferColorDataTypeType =
    "uint8" |
    "half float" |
    "float";

  type Props = {
    [name: string]: PropType;
  }

  type PropType =
    boolean |
    number |
    REGL.DynamicVariable |
    REGL.DynamicVariableFn |
    REGL.PropArray |
    REGL.Props;

  // TypeScript doesn't allow directly specify recursive structures like
  // type PropType = ... | PropType[];
  // https://github.com/Microsoft/TypeScript/issues/3988
  interface PropArray extends Array<PropType> { }

  /**
   * An N-dimensional array, as per `ndarray` module.
   *
   * More detailed typing does not belong here, so we assume
   * anything with `shape`, `stride`, `offset` and `data` is ok.
   *
   * TODO Reuse typings from `ndarray` module
   */
  interface NDArray {
    shape: any;
    stride: any;
    offset: any;
    data: any;
  }
}
