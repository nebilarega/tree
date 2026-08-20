import * as THREE from 'three';
import cloudVert from './shaders/cloud.vert?raw';
import cloudFrag from './shaders/cloud.frag?raw';

function wrapTexture(texture) {
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

/** Default cloud layer appearance. */
export const DEFAULT_APPEARANCE = {
  size: [1, 1],
  thinness: 0,
  opacity: 1,
  distortion: 1,
  brightness: 1,
  colorLight: [1.057, 1.066, 1.074],
  colorDark: [0.82, 0.86, 0.88],
};

/** Shared shader uniforms for instanced cloud planes. */
export function createCloudUniforms(textures, resolution, appearance = DEFAULT_APPEARANCE) {
  return {
    uTime: { value: 0 },
    uResolution: { value: resolution.clone() },
    uRatio: { value: resolution.x / resolution.y },
    uChapter: { value: 0 },
    uTransition: { value: 0 },
    uOpacity: { value: appearance.opacity },
    uThinness: { value: appearance.thinness },
    uDistortion: { value: appearance.distortion },
    uBrightness: { value: appearance.brightness },
    uColorLight: { value: new THREE.Vector3(...appearance.colorLight) },
    uColorDark: { value: new THREE.Vector3(...appearance.colorDark) },
    tNoise: { value: wrapTexture(textures.detail) },
    tPerlin: { value: wrapTexture(textures.shape) },
    tMouse: { value: textures.mouse },
  };
}

/** ShaderMaterial for instanced cloud planes (DoubleSide, transparent). */
export function createCloudMaterial(uniforms, appearance = DEFAULT_APPEARANCE) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uSize: { value: new THREE.Vector2(...appearance.size) },
      uChapter: uniforms.uChapter,
      uTransition: uniforms.uTransition,
      uTime: uniforms.uTime,
      uResolution: uniforms.uResolution,
      uRatio: uniforms.uRatio,
      uOpacity: uniforms.uOpacity,
      uThinness: uniforms.uThinness,
      uDistortion: uniforms.uDistortion,
      uBrightness: uniforms.uBrightness,
      uColorLight: uniforms.uColorLight,
      uColorDark: uniforms.uColorDark,
      tPerlin: uniforms.tPerlin,
      tNoise: uniforms.tNoise,
      tMouse: uniforms.tMouse,
    },
    vertexShader: cloudVert,
    fragmentShader: cloudFrag,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
  });
}
