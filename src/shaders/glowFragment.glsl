uniform vec3 uColor;
uniform float uIntensity;
uniform float uPulse;
varying vec3 vNormal;
varying vec3 vPosition;

void main() {
  // Fresnel rim glow
  vec3 viewDir = normalize(-vPosition);
  float fresnel = 1.0 - dot(viewDir, vNormal);
  fresnel = pow(fresnel, 2.5);

  // Core glow
  float core = 0.3 + 0.15 * uPulse;

  // Combined
  float intensity = (fresnel * 0.8 + core) * uIntensity;
  gl_FragColor = vec4(uColor * intensity, fresnel * 0.9 + core * 0.6);
}
