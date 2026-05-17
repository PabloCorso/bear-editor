import type { WorldRenderScene } from "~/editor/render/world-scene";

const VERTEX_SHADER_SOURCE = `
attribute vec2 a_position;
attribute vec2 a_texCoord;
attribute vec2 a_maskTexCoord;

uniform vec4 u_viewRect;

varying vec2 v_texCoord;
varying vec2 v_maskTexCoord;

void main() {
  vec2 viewSize = max(u_viewRect.zw - u_viewRect.xy, vec2(0.0001));
  vec2 normalized = (a_position - u_viewRect.xy) / viewSize;
  gl_Position = vec4(normalized * vec2(2.0, -2.0) + vec2(-1.0, 1.0), 0.0, 1.0);
  v_texCoord = a_texCoord;
  v_maskTexCoord = a_maskTexCoord;
}
`;

const FRAGMENT_SHADER_SOURCE = `
precision mediump float;

uniform bool u_useTexture;
uniform bool u_useMaskTexture;
uniform bool u_repeatTexture;
uniform vec4 u_color;
uniform sampler2D u_texture;
uniform sampler2D u_maskTexture;

varying vec2 v_texCoord;
varying vec2 v_maskTexCoord;

void main() {
  vec4 color = u_color;
  if (u_useTexture) {
    vec2 texCoord = u_repeatTexture ? fract(v_texCoord) : v_texCoord;
    color = texture2D(u_texture, texCoord) * u_color;
    if (u_useMaskTexture) {
      float maskAlpha = texture2D(u_maskTexture, v_maskTexCoord).a;
      color.a *= step(0.001, maskAlpha);
    }
  }
  gl_FragColor = color;
}
`;

type ProgramInfo = {
  program: WebGLProgram;
  maskTexCoordAttribute: number;
  positionAttribute: number;
  texCoordAttribute: number;
  colorUniform: WebGLUniformLocation;
  maskTextureUniform: WebGLUniformLocation;
  repeatTextureUniform: WebGLUniformLocation;
  useMaskTextureUniform: WebGLUniformLocation;
  useTextureUniform: WebGLUniformLocation;
  textureUniform: WebGLUniformLocation;
  viewRectUniform: WebGLUniformLocation;
};

export type WebGLColor = [number, number, number, number];

export class WebGLRenderContext {
  readonly canvas: HTMLCanvasElement;
  readonly gl: WebGLRenderingContext;

  private programInfo: ProgramInfo;
  private vertexBuffer: WebGLBuffer;
  private textureCache = new WeakMap<ImageBitmap, WebGLTexture>();
  private canvasTextureCache = new WeakMap<HTMLCanvasElement, WebGLTexture>();
  private textures = new Set<WebGLTexture>();

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl", {
      alpha: false,
      antialias: false,
      preserveDrawingBuffer: import.meta.env.DEV,
      stencil: true,
    });
    if (!gl) throw new Error("WebGL context missing");

    const vertexBuffer = gl.createBuffer();
    if (!vertexBuffer) throw new Error("Failed to create WebGL vertex buffer");

    this.canvas = canvas;
    this.gl = gl;
    this.vertexBuffer = vertexBuffer;
    this.programInfo = createProgramInfo(gl);

    gl.useProgram(this.programInfo.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(this.programInfo.textureUniform, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.uniform1i(this.programInfo.maskTextureUniform, 1);
    this.resetDrawState();
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
    this.canvas.width = width * devicePixelRatio;
    this.canvas.height = height * devicePixelRatio;
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  clear(color: string) {
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    this.resetDrawState();
    this.gl.clearColor(...hexToRgb(color), 1);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.STENCIL_BUFFER_BIT);
  }

  destroy() {
    for (const texture of this.textures) {
      this.gl.deleteTexture(texture);
    }
    this.textures.clear();
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
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.activeTexture(gl.TEXTURE0);
  }

  drawVertices({
    vertices,
    color,
    scene,
    texture = null,
    repeatTexture = false,
  }: {
    vertices: number[];
    color: WebGLColor;
    scene: WorldRenderScene;
    texture?: WebGLTexture | null;
    repeatTexture?: boolean;
  }) {
    if (vertices.length === 0) return;

    const gl = this.gl;
    const programInfo = this.programInfo;
    gl.useProgram(programInfo.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    const expandedVertices = expandVerticesWithDefaultMask(vertices);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array(expandedVertices),
      gl.STREAM_DRAW,
    );

    configureVertexAttributes(gl, programInfo);
    applyViewportUniforms(gl, programInfo, scene);
    gl.uniform4fv(programInfo.colorUniform, color);
    gl.uniform1i(programInfo.useTextureUniform, texture ? 1 : 0);
    gl.uniform1i(programInfo.useMaskTextureUniform, 0);
    gl.uniform1i(programInfo.repeatTextureUniform, repeatTexture ? 1 : 0);
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
    scene,
  }: {
    vertices: number[];
    color: WebGLColor;
    texture: WebGLTexture;
    maskTexture: WebGLTexture;
    scene: WorldRenderScene;
  }) {
    if (vertices.length === 0) return;

    const gl = this.gl;
    const programInfo = this.programInfo;
    gl.useProgram(programInfo.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STREAM_DRAW);

    configureVertexAttributes(gl, programInfo);
    applyViewportUniforms(gl, programInfo, scene);
    gl.uniform4fv(programInfo.colorUniform, color);
    gl.uniform1i(programInfo.useTextureUniform, 1);
    gl.uniform1i(programInfo.useMaskTextureUniform, 1);
    gl.uniform1i(programInfo.repeatTextureUniform, 1);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, maskTexture);

    gl.drawArrays(gl.TRIANGLES, 0, vertices.length / 6);
  }

  getTexture(sprite: ImageBitmap | HTMLCanvasElement) {
    if (sprite instanceof HTMLCanvasElement) {
      return this.getCanvasTexture(sprite);
    }

    const cached = this.textureCache.get(sprite);
    if (cached) return cached;

    const texture = createTexture(this.gl, sprite);
    this.textureCache.set(sprite, texture);
    this.textures.add(texture);
    return texture;
  }

  private getCanvasTexture(sprite: HTMLCanvasElement) {
    const cached = this.canvasTextureCache.get(sprite);
    const texture = cached ?? createTexture(this.gl, sprite);

    if (!cached) {
      this.canvasTextureCache.set(sprite, texture);
      this.textures.add(texture);
    }

    uploadTexture(this.gl, texture, sprite);
    return texture;
  }
}

function configureVertexAttributes(
  gl: WebGLRenderingContext,
  programInfo: ProgramInfo,
) {
  gl.enableVertexAttribArray(programInfo.positionAttribute);
  gl.vertexAttribPointer(programInfo.positionAttribute, 2, gl.FLOAT, false, 24, 0);
  gl.enableVertexAttribArray(programInfo.texCoordAttribute);
  gl.vertexAttribPointer(programInfo.texCoordAttribute, 2, gl.FLOAT, false, 24, 8);
  gl.enableVertexAttribArray(programInfo.maskTexCoordAttribute);
  gl.vertexAttribPointer(
    programInfo.maskTexCoordAttribute,
    2,
    gl.FLOAT,
    false,
    24,
    16,
  );
}

function applyViewportUniforms(
  gl: WebGLRenderingContext,
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
  gl: WebGLRenderingContext,
  sprite: ImageBitmap | HTMLCanvasElement,
) {
  const texture = gl.createTexture();
  if (!texture) throw new Error("Failed to create WebGL texture");
  uploadTexture(gl, texture, sprite);
  return texture;
}

function uploadTexture(
  gl: WebGLRenderingContext,
  texture: WebGLTexture,
  sprite: ImageBitmap | HTMLCanvasElement,
) {
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sprite);
}

function createProgramInfo(gl: WebGLRenderingContext): ProgramInfo {
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
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(
      gl.getProgramInfoLog(program) ?? "Failed to link WebGL program",
    );
  }

  const colorUniform = gl.getUniformLocation(program, "u_color");
  const maskTextureUniform = gl.getUniformLocation(program, "u_maskTexture");
  const repeatTextureUniform = gl.getUniformLocation(
    program,
    "u_repeatTexture",
  );
  const useMaskTextureUniform = gl.getUniformLocation(
    program,
    "u_useMaskTexture",
  );
  const useTextureUniform = gl.getUniformLocation(program, "u_useTexture");
  const textureUniform = gl.getUniformLocation(program, "u_texture");
  const viewRectUniform = gl.getUniformLocation(program, "u_viewRect");
  if (
    !colorUniform ||
    !maskTextureUniform ||
    !repeatTextureUniform ||
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
    maskTextureUniform,
    repeatTextureUniform,
    useMaskTextureUniform,
    useTextureUniform,
    textureUniform,
    viewRectUniform,
  };
}

function createShader(gl: WebGLRenderingContext, type: number, source: string) {
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

function expandVerticesWithDefaultMask(vertices: number[]) {
  const expanded: number[] = [];
  for (let index = 0; index < vertices.length; index += 4) {
    expanded.push(
      vertices[index]!,
      vertices[index + 1]!,
      vertices[index + 2]!,
      vertices[index + 3]!,
      0,
      0,
    );
  }
  return expanded;
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
