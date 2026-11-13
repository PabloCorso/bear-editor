import type { WorldRenderScene } from "~/editor/render/world-scene";

const VERTEX_SHADER_SOURCE = `#version 300 es
in vec2 a_position;
in vec2 a_texCoord;
in vec2 a_maskTexCoord;

uniform vec4 u_viewRect;

out highp vec2 v_texCoord;
out highp vec2 v_maskTexCoord;

void main() {
  vec2 viewSize = max(u_viewRect.zw - u_viewRect.xy, vec2(0.0001));
  vec2 normalized = (a_position - u_viewRect.xy) / viewSize;
  gl_Position = vec4(normalized * vec2(2.0, -2.0) + vec2(-1.0, 1.0), 0.0, 1.0);
  v_texCoord = a_texCoord;
  v_maskTexCoord = a_maskTexCoord;
}
`;

const FRAGMENT_SHADER_SOURCE = `#version 300 es
precision mediump float;

uniform bool u_useTexture;
uniform bool u_useMaskTexture;
uniform bool u_repeatTexture;
uniform highp vec2 u_repeatTileSize;
uniform vec4 u_color;
uniform bool u_recolorKuski;
uniform sampler2D u_texture;
uniform sampler2D u_maskTexture;

in highp vec2 v_texCoord;
in highp vec2 v_maskTexCoord;
out vec4 fragColor;

void main() {
  vec4 color = u_color;
  if (u_useTexture) {
    vec2 texCoord = u_repeatTexture ? fract(v_texCoord) : v_texCoord;
    vec4 sprite;
    if (u_repeatTileSize.y > 0.0) {
      // Elma resizes the source in whole pixels before repeating it.
      highp vec2 size = vec2(textureSize(u_texture, 0));
      highp vec2 pixel = floor(texCoord * u_repeatTileSize);
      ivec2 texel = ivec2(min(floor(pixel * size.y / u_repeatTileSize.y), size - 1.0));
      sprite = texelFetch(u_texture, texel, 0);
    } else {
      sprite = texture(u_texture, texCoord);
    }
    color = sprite * u_color;
    if (u_recolorKuski) {
      // Remove the original red/yellow hue before applying the identity color.
      // Keep the sprite shading, with just a little lift to keep hues readable.
      vec3 original = sprite.rgb / max(sprite.a, 0.001);
      vec3 luminanceWeights = vec3(0.2126, 0.7152, 0.0722);
      float luminance = clamp(dot(original, luminanceWeights), 0.0, 1.0);
      float shade = mix(luminance, sqrt(luminance), 0.25);
      // Soften identity colors without losing their distinction from one another.
      float tintLuminance = dot(u_color.rgb, luminanceWeights);
      vec3 tint = mix(vec3(tintLuminance), u_color.rgb, 0.8);
      color = vec4(tint * shade, sprite.a * u_color.a);
    }
    if (u_useMaskTexture) {
      float maskAlpha = texture(u_maskTexture, v_maskTexCoord).a;
      color.a *= step(0.001, maskAlpha);
    }
  }
  fragColor = color;
}
`;

type ProgramInfo = {
  program: WebGLProgram;
  maskTexCoordAttribute: number;
  positionAttribute: number;
  texCoordAttribute: number;
  colorUniform: WebGLUniformLocation;
  recolorKuskiUniform: WebGLUniformLocation;
  maskTextureUniform: WebGLUniformLocation;
  repeatTextureUniform: WebGLUniformLocation;
  repeatTileSizeUniform: WebGLUniformLocation;
  useMaskTextureUniform: WebGLUniformLocation;
  useTextureUniform: WebGLUniformLocation;
  textureUniform: WebGLUniformLocation;
  viewRectUniform: WebGLUniformLocation;
};

export type WebGLColor = [number, number, number, number];

export class WebGLInitializationError extends Error {
  constructor(cause?: unknown) {
    super(
      "Bear Editor requires WebGL 2. Try updating your browser or enabling hardware acceleration.",
      { cause },
    );
  }
}

export class WebGLRenderContext {
  readonly canvas: HTMLCanvasElement;
  readonly gl: WebGL2RenderingContext;

  private programInfo: ProgramInfo;
  private vertexBuffer: WebGLBuffer;
  private vertices: WebGLVertexArrayObject;
  private maskedVertices: WebGLVertexArrayObject;
  private textureCache = new WeakMap<
    ImageBitmap | HTMLCanvasElement,
    WebGLTexture
  >();
  private canvasTextureCache = new WeakMap<HTMLCanvasElement, WebGLTexture>();
  private textures = new Set<WebGLTexture>();

  constructor(
    canvas: HTMLCanvasElement,
    { alpha = false, antialias = true } = {},
  ) {
    this.canvas = canvas;
    let gl: WebGL2RenderingContext | null = null;

    try {
      gl = canvas.getContext("webgl2", {
        alpha,
        antialias,
        preserveDrawingBuffer: import.meta.env.DEV,
        stencil: true,
      });
      if (!gl) throw new Error("WebGL 2 context missing");

      this.gl = gl;
      this.programInfo = createProgramInfo(gl);
      const vertexBuffer = gl.createBuffer();
      if (!vertexBuffer)
        throw new Error("Failed to create WebGL vertex buffer");

      this.vertexBuffer = vertexBuffer;
      // ARRAY_BUFFER stays bound for streaming uploads in both draw paths.
      gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
      this.vertices = createVertexArray(gl, this.programInfo, false);
      this.maskedVertices = createVertexArray(gl, this.programInfo, true);

      this.resetDrawState();
      gl.uniform1i(this.programInfo.textureUniform, 0);
      gl.uniform1i(this.programInfo.maskTextureUniform, 1);
    } catch (cause) {
      gl?.getExtension("WEBGL_lose_context")?.loseContext();
      throw new WebGLInitializationError(cause);
    }
  }

  resize({
    width,
    height,
    devicePixelRatio = 1,
  }: {
    width: number;
    height: number;
    devicePixelRatio?: number;
  }) {
    const pixelWidth = Math.round(width * devicePixelRatio);
    const pixelHeight = Math.round(height * devicePixelRatio);
    if (this.canvas.width !== pixelWidth) this.canvas.width = pixelWidth;
    if (this.canvas.height !== pixelHeight) this.canvas.height = pixelHeight;
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  clear(color: string, alpha = 1) {
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    this.resetDrawState();
    this.gl.clearColor(...hexToRgb(color), alpha);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.STENCIL_BUFFER_BIT);
  }

  destroy() {
    for (const texture of this.textures) {
      this.gl.deleteTexture(texture);
    }
    this.textures.clear();
    this.gl.deleteVertexArray(this.vertices);
    this.gl.deleteVertexArray(this.maskedVertices);
    this.gl.deleteBuffer(this.vertexBuffer);
    this.gl.deleteProgram(this.programInfo.program);
  }

  resetDrawState() {
    const gl = this.gl;
    gl.useProgram(this.programInfo.program);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.SCISSOR_TEST);
    gl.disable(gl.STENCIL_TEST);
    gl.colorMask(true, true, true, true);
    gl.stencilMask(0xff);
    gl.stencilFunc(gl.ALWAYS, 0, 0xff);
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(
      gl.SRC_ALPHA,
      gl.ONE_MINUS_SRC_ALPHA,
      gl.ONE,
      gl.ONE_MINUS_SRC_ALPHA,
    );
    gl.activeTexture(gl.TEXTURE0);
  }

  createStaticVertices(vertices: Float32Array) {
    const gl = this.gl;
    const buffer = gl.createBuffer();
    if (!buffer) throw new Error("Could not allocate playfield geometry");
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
    const vao = createVertexArray(gl, this.programInfo, false);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);

    return {
      draw: (scene: WorldRenderScene) => {
        gl.bindVertexArray(vao);
        applyViewportUniforms(gl, this.programInfo, scene);
        gl.uniform1i(this.programInfo.useTextureUniform, 0);
        gl.drawArrays(gl.TRIANGLES, 0, vertices.length / 4);
      },
      destroy: () => {
        gl.deleteVertexArray(vao);
        gl.deleteBuffer(buffer);
      },
    };
  }

  drawVertices({
    vertices,
    color,
    scene,
    texture = null,
    repeatTexture = false,
    repeatTileSize,
    recolorKuski = false,
  }: {
    vertices: number[];
    color: WebGLColor;
    scene: WorldRenderScene;
    texture?: WebGLTexture | null;
    repeatTexture?: boolean;
    repeatTileSize?: [width: number, height: number];
    recolorKuski?: boolean;
  }) {
    if (vertices.length === 0) return;

    const gl = this.gl;
    const programInfo = this.programInfo;
    gl.bindVertexArray(this.vertices);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STREAM_DRAW);
    applyViewportUniforms(gl, programInfo, scene);
    gl.uniform4fv(programInfo.colorUniform, color);
    gl.uniform1i(programInfo.useTextureUniform, texture ? 1 : 0);
    gl.uniform1i(programInfo.recolorKuskiUniform, recolorKuski ? 1 : 0);
    gl.uniform1i(programInfo.useMaskTextureUniform, 0);
    gl.uniform1i(programInfo.repeatTextureUniform, repeatTexture ? 1 : 0);
    gl.uniform2f(
      programInfo.repeatTileSizeUniform,
      repeatTileSize?.[0] ?? 0,
      repeatTileSize?.[1] ?? 0,
    );
    if (texture) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
    }

    gl.drawArrays(gl.TRIANGLES, 0, vertices.length / 4);
  }

  drawVerticesWithMask({
    vertices,
    color,
    texture,
    maskTexture,
    repeatTileSize,
    scene,
  }: {
    vertices: number[];
    color: WebGLColor;
    texture: WebGLTexture;
    maskTexture: WebGLTexture;
    repeatTileSize?: [width: number, height: number];
    scene: WorldRenderScene;
  }) {
    if (vertices.length === 0) return;

    const gl = this.gl;
    const programInfo = this.programInfo;
    gl.bindVertexArray(this.maskedVertices);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STREAM_DRAW);
    applyViewportUniforms(gl, programInfo, scene);
    gl.uniform4fv(programInfo.colorUniform, color);
    gl.uniform1i(programInfo.useTextureUniform, 1);
    gl.uniform1i(programInfo.recolorKuskiUniform, 0);
    gl.uniform1i(programInfo.useMaskTextureUniform, 1);
    gl.uniform1i(programInfo.repeatTextureUniform, 1);
    gl.uniform2f(
      programInfo.repeatTileSizeUniform,
      repeatTileSize?.[0] ?? 0,
      repeatTileSize?.[1] ?? 0,
    );
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, maskTexture);

    gl.drawArrays(gl.TRIANGLES, 0, vertices.length / 6);
  }

  getTexture(
    sprite: ImageBitmap | HTMLCanvasElement,
    { immutable = false } = {},
  ) {
    if (sprite instanceof HTMLCanvasElement && !immutable) {
      return this.getCanvasTexture(sprite);
    }

    const cached = this.textureCache.get(sprite);
    if (cached) return cached;

    const texture = createTexture(this.gl, sprite);
    this.textureCache.set(sprite, texture);
    this.textures.add(texture);
    return texture;
  }

  releaseTexture(sprite: ImageBitmap | HTMLCanvasElement) {
    const texture = this.textureCache.get(sprite);
    if (!texture) return;
    this.gl.deleteTexture(texture);
    this.textures.delete(texture);
    this.textureCache.delete(sprite);
  }

  private getCanvasTexture(sprite: HTMLCanvasElement) {
    const cached = this.canvasTextureCache.get(sprite);
    if (cached) {
      uploadTexture(this.gl, cached, sprite);
      return cached;
    }

    const texture = createTexture(this.gl, sprite);
    this.canvasTextureCache.set(sprite, texture);
    this.textures.add(texture);
    return texture;
  }
}

function createVertexArray(
  gl: WebGL2RenderingContext,
  programInfo: ProgramInfo,
  masked: boolean,
) {
  const vertexArray = gl.createVertexArray();
  if (!vertexArray) throw new Error("Failed to create WebGL vertex array");

  // Both layouts share the streaming buffer. Ordinary draws only upload XY/UV.
  const stride = masked ? 24 : 16;
  gl.bindVertexArray(vertexArray);
  gl.enableVertexAttribArray(programInfo.positionAttribute);
  gl.vertexAttribPointer(
    programInfo.positionAttribute,
    2,
    gl.FLOAT,
    false,
    stride,
    0,
  );
  gl.enableVertexAttribArray(programInfo.texCoordAttribute);
  gl.vertexAttribPointer(
    programInfo.texCoordAttribute,
    2,
    gl.FLOAT,
    false,
    stride,
    8,
  );
  if (masked) {
    gl.enableVertexAttribArray(programInfo.maskTexCoordAttribute);
    gl.vertexAttribPointer(
      programInfo.maskTexCoordAttribute,
      2,
      gl.FLOAT,
      false,
      stride,
      16,
    );
  }
  return vertexArray;
}

function applyViewportUniforms(
  gl: WebGL2RenderingContext,
  programInfo: ProgramInfo,
  scene: WorldRenderScene,
) {
  gl.uniform4f(
    programInfo.viewRectUniform,
    scene.viewport.rect.minX,
    scene.viewport.rect.minY,
    scene.viewport.rect.maxX,
    scene.viewport.rect.maxY,
  );
}

function createTexture(
  gl: WebGL2RenderingContext,
  sprite: ImageBitmap | HTMLCanvasElement,
) {
  const texture = gl.createTexture();
  if (!texture) throw new Error("Failed to create WebGL texture");
  uploadTexture(gl, texture, sprite);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  return texture;
}

function uploadTexture(
  gl: WebGL2RenderingContext,
  texture: WebGLTexture,
  sprite: ImageBitmap | HTMLCanvasElement,
) {
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, sprite);
}

function createProgramInfo(gl: WebGL2RenderingContext): ProgramInfo {
  const vertexShader = createShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER_SOURCE);
  const fragmentShader = createShader(
    gl,
    gl.FRAGMENT_SHADER,
    FRAGMENT_SHADER_SOURCE,
  );
  const program = gl.createProgram();
  if (!program) throw new Error("Failed to create WebGL program");

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(
      gl.getProgramInfoLog(program) ?? "Failed to link WebGL program",
    );
  }

  const recolorKuskiUniform = gl.getUniformLocation(program, "u_recolorKuski");
  const colorUniform = gl.getUniformLocation(program, "u_color");
  const maskTextureUniform = gl.getUniformLocation(program, "u_maskTexture");
  const repeatTextureUniform = gl.getUniformLocation(
    program,
    "u_repeatTexture",
  );
  const repeatTileSizeUniform = gl.getUniformLocation(
    program,
    "u_repeatTileSize",
  );
  const useMaskTextureUniform = gl.getUniformLocation(
    program,
    "u_useMaskTexture",
  );
  const useTextureUniform = gl.getUniformLocation(program, "u_useTexture");
  const textureUniform = gl.getUniformLocation(program, "u_texture");
  const viewRectUniform = gl.getUniformLocation(program, "u_viewRect");
  if (
    !recolorKuskiUniform ||
    !colorUniform ||
    !maskTextureUniform ||
    !repeatTextureUniform ||
    !repeatTileSizeUniform ||
    !useMaskTextureUniform ||
    !useTextureUniform ||
    !textureUniform ||
    !viewRectUniform
  ) {
    throw new Error("Failed to resolve WebGL program uniforms");
  }

  return {
    program,
    maskTexCoordAttribute: gl.getAttribLocation(program, "a_maskTexCoord"),
    positionAttribute: gl.getAttribLocation(program, "a_position"),
    texCoordAttribute: gl.getAttribLocation(program, "a_texCoord"),
    colorUniform,
    recolorKuskiUniform,
    maskTextureUniform,
    repeatTextureUniform,
    repeatTileSizeUniform,
    useMaskTextureUniform,
    useTextureUniform,
    textureUniform,
    viewRectUniform,
  };
}

function createShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Failed to create WebGL shader");

  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(
      gl.getShaderInfoLog(shader) ?? "Failed to compile WebGL shader",
    );
  }

  return shader;
}

export function colorToRgba(color: string, opacity = 1): WebGLColor {
  const [r, g, b] = hexToRgb(color);
  return [r, g, b, opacity];
}

export function hexToRgb(color: string): [number, number, number] {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(color);
  if (!match) return [0, 0, 0];
  return [
    Number.parseInt(match[1]!, 16) / 255,
    Number.parseInt(match[2]!, 16) / 255,
    Number.parseInt(match[3]!, 16) / 255,
  ];
}
