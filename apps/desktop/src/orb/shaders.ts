export const plasmaVertex = /* glsl */ `
  uniform float uTime;
  uniform float uEnergy;
  varying vec3 vPos;
  varying vec3 vNormal;
  varying vec3 vView;
  float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  float noise(vec3 p) {
    vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i), hash(i+vec3(1,0,0)), f.x), mix(hash(i+vec3(0,1,0)), hash(i+vec3(1,1,0)), f.x), f.y),
               mix(mix(hash(i+vec3(0,0,1)), hash(i+vec3(1,0,1)), f.x), mix(hash(i+vec3(0,1,1)), hash(i+vec3(1,1,1)), f.x), f.y), f.z);
  }
  void main() {
    float n = noise(position * 1.8 + uTime * 0.25);
    vec3 displaced = position * (1.0 + n * (0.05 + uEnergy * 0.14) + sin(uTime * 0.7) * 0.02);
    vec4 mv = modelViewMatrix * vec4(displaced, 1.0);
    vPos = displaced;
    vNormal = normalize(normalMatrix * normal);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

export const plasmaFragment = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uEnergy;
  uniform float uAlert;
  uniform vec3 uDeep;
  uniform vec3 uMid;
  uniform vec3 uHot;
  varying vec3 vPos;
  varying vec3 vNormal;
  varying vec3 vView;
  float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  float noise(vec3 p) {
    vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i), hash(i+vec3(1,0,0)), f.x), mix(hash(i+vec3(0,1,0)), hash(i+vec3(1,1,0)), f.x), f.y),
               mix(mix(hash(i+vec3(0,0,1)), hash(i+vec3(1,0,1)), f.x), mix(hash(i+vec3(0,1,1)), hash(i+vec3(1,1,1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) {
    float v = 0.0; float a = 0.55;
    for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.03 + 0.7; a *= 0.5; }
    return v;
  }
  void main() {
    vec3 warp = vPos + vec3(fbm(vPos + uTime * 0.2), fbm(vPos.yzx - uTime * 0.16), fbm(vPos.zxy + uTime * 0.12));
    float field = fbm(warp * 2.2);
    float fres = pow(1.0 - max(dot(normalize(vNormal), normalize(vView)), 0.0), 2.2);
    vec3 col = mix(uDeep, uMid, smoothstep(0.15, 0.75, field));
    col = mix(col, uHot, pow(field, 2.0) * (0.4 + uEnergy));
    col = mix(col, vec3(1.0, 0.96, 0.88), smoothstep(0.62, 0.95, field) * (0.25 + uEnergy * 0.75));
    col = mix(col, uHot, fres);
    col = mix(col, vec3(1.0, 0.28, 0.06), uAlert * 0.75);
    float alpha = clamp(0.28 + fres * 0.7 + uEnergy * 0.15, 0.0, 1.0);
    gl_FragColor = vec4(col, alpha);
  }
`;
