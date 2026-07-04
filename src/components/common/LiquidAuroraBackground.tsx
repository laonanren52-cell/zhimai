import { useEffect, useRef } from "react";
import { cn } from "../../utils/cn";

const vertexShaderSource = `
  attribute vec4 a_position;
  void main() {
    gl_Position = a_position;
  }
`;

const fragmentShaderSource = `
  precision highp float;

  uniform vec2 u_res;
  uniform float u_time;
  uniform vec2 u_mouse;

  float random(vec2 st) {
    return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
  }

  float noise(vec2 st) {
    vec2 i = floor(st);
    vec2 f = fract(st);
    float a = random(i);
    float b = random(i + vec2(1.0, 0.0));
    float c = random(i + vec2(0.0, 1.0));
    float d = random(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
  }

  float fbm(vec2 st) {
    float value = 0.0;
    float amplitude = 0.5;
    vec2 shift = vec2(100.0);
    mat2 rotate = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.5));
    for (int i = 0; i < 5; i++) {
      value += amplitude * noise(st);
      st = rotate * st * 2.0 + shift;
      amplitude *= 0.5;
    }
    return value;
  }

  void main() {
    vec2 st = gl_FragCoord.xy / u_res.xy * 2.7;
    st.x *= u_res.x / u_res.y;

    vec2 q = vec2(0.0);
    q.x = fbm(st + vec2(0.0, 0.04 * u_time));
    q.y = fbm(st + vec2(1.0, 0.18));

    vec2 r = vec2(0.0);
    r.x = fbm(st + 1.0 * q + vec2(1.7, 9.2) + 0.045 * u_time);
    r.y = fbm(st + 1.0 * q + vec2(8.3, 2.8) + 0.038 * u_time);

    float f = fbm(st + r);

    vec3 ink = vec3(0.006, 0.012, 0.026);
    vec3 deepBlue = vec3(0.0, 0.105, 0.22);
    vec3 violet = vec3(0.13, 0.035, 0.22);
    vec3 glacier = vec3(0.12, 0.92, 0.88);

    vec3 color = mix(ink, deepBlue, clamp(f * f * 3.0, 0.0, 1.0));
    color = mix(color, violet, clamp(length(q) * 0.42, 0.0, 1.0));
    color = mix(color, glacier, clamp(length(r) * 0.22, 0.0, 1.0));

    vec2 mouseNorm = u_mouse / u_res;
    mouseNorm.y = 1.0 - mouseNorm.y;
    float dist = length((gl_FragCoord.xy / u_res.xy) - mouseNorm);
    color += vec3(0.0, 0.45, 0.72) * smoothstep(0.42, 0.0, dist) * 0.18;

    float vignette = smoothstep(1.05, 0.22, length((gl_FragCoord.xy / u_res.xy) - vec2(0.5)));
    color *= mix(0.5, 1.0, vignette);

    gl_FragColor = vec4(color, 0.96);
  }
`;

interface LiquidAuroraBackgroundProps {
  className?: string;
  showCursor?: boolean;
}

function compileShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function shouldUseStaticFallback() {
  if (typeof window === "undefined") return true;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const smallScreen = window.matchMedia("(max-width: 767px)").matches;
  const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
  return reduced || smallScreen || coarsePointer;
}

export default function LiquidAuroraBackground({ className, showCursor = false }: LiquidAuroraBackgroundProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cursorDotRef = useRef<HTMLSpanElement | null>(null);
  const cursorRingRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (!rootRef.current || !canvasRef.current || shouldUseStaticFallback()) return;
    const rootElement = rootRef.current;
    const canvasElement = canvasRef.current;

    const glContext = canvasElement.getContext("webgl", {
      alpha: true,
      antialias: false,
      depth: false,
      powerPreference: "low-power",
      stencil: false,
    });
    if (!glContext) return;

    const gl = glContext;
    const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
    const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
    if (!vertexShader || !fragmentShader) return;

    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program);
      return;
    }
    gl.useProgram(program);

    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);

    const positionLocation = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    const resolutionLocation = gl.getUniformLocation(program, "u_res");
    const timeLocation = gl.getUniformLocation(program, "u_time");
    const mouseLocation = gl.getUniformLocation(program, "u_mouse");

    let mouseX = window.innerWidth / 2;
    let mouseY = window.innerHeight / 2;
    let frame = 0;

    function updatePointer(event: PointerEvent) {
      mouseX = event.clientX;
      mouseY = event.clientY;
      rootElement.style.setProperty("--auth-cursor-x", `${event.clientX}px`);
      rootElement.style.setProperty("--auth-cursor-y", `${event.clientY}px`);
    }

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const width = Math.floor(window.innerWidth * dpr);
      const height = Math.floor(window.innerHeight * dpr);
      if (canvasElement.width !== width || canvasElement.height !== height) {
        canvasElement.width = width;
        canvasElement.height = height;
        canvasElement.style.width = `${window.innerWidth}px`;
        canvasElement.style.height = `${window.innerHeight}px`;
        gl.viewport(0, 0, width, height);
      }
    }

    function render(time: number) {
      resize();
      gl.uniform2f(resolutionLocation, canvasElement.width, canvasElement.height);
      gl.uniform1f(timeLocation, time * 0.001);
      gl.uniform2f(mouseLocation, mouseX * Math.min(window.devicePixelRatio || 1, 1.5), mouseY * Math.min(window.devicePixelRatio || 1, 1.5));
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      frame = window.requestAnimationFrame(render);
    }

    window.addEventListener("pointermove", updatePointer, { passive: true });
    frame = window.requestAnimationFrame(render);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", updatePointer);
      gl.deleteBuffer(positionBuffer);
      gl.deleteProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
    };
  }, []);

  useEffect(() => {
    if (!showCursor || shouldUseStaticFallback()) return;
    if (!cursorDotRef.current || !cursorRingRef.current) return;
    const dotElement = cursorDotRef.current;
    const ringElement = cursorRingRef.current;

    let mouseX = window.innerWidth / 2;
    let mouseY = window.innerHeight / 2;
    let ringX = mouseX;
    let ringY = mouseY;
    let frame = 0;

    function updatePointer(event: PointerEvent) {
      mouseX = event.clientX;
      mouseY = event.clientY;
      dotElement.style.transform = `translate3d(${mouseX}px, ${mouseY}px, 0) translate(-50%, -50%)`;
    }

    function animate() {
      ringX += (mouseX - ringX) * 0.16;
      ringY += (mouseY - ringY) * 0.16;
      ringElement.style.transform = `translate3d(${ringX}px, ${ringY}px, 0) translate(-50%, -50%)`;
      frame = window.requestAnimationFrame(animate);
    }

    window.addEventListener("pointermove", updatePointer, { passive: true });
    frame = window.requestAnimationFrame(animate);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", updatePointer);
    };
  }, [showCursor]);

  return (
    <div ref={rootRef} className={cn("liquid-aurora-root", className)} aria-hidden="true">
      <div className="liquid-aurora-fallback" />
      <canvas ref={canvasRef} className="liquid-aurora-canvas" />
      <div className="liquid-pointer-glow" />
      <div className="liquid-film-grain" />
      {showCursor ? (
        <>
          <span ref={cursorDotRef} className="liquid-cursor-dot" />
          <span ref={cursorRingRef} className="liquid-cursor-ring" />
        </>
      ) : null}
    </div>
  );
}
