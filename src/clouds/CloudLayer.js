import * as THREE from 'three';
import { createCloudMaterial, createCloudUniforms, DEFAULT_APPEARANCE } from './material.js';
import { createCloudPlanes, DEFAULT_CAMERA, DEFAULT_LAYOUT } from './planes.js';
import { createMouseTrail } from './mouseTrail.js';

/**
 * Instanced volumetric cloud layer with pointer-reactive distortion.
 *
 * @example
 * const clouds = new CloudLayer({
 *   renderer,
 *   textures: { detail, shape },
 *   resolution: new THREE.Vector2(canvas.width, canvas.height),
 * });
 * scene.add(clouds.group);
 * clouds.update(elapsed);
 * clouds.setPointer(event.clientX, event.clientY, domElement);
 */
export class CloudLayer {
  constructor({
    renderer,
    textures,
    resolution,
    layout = DEFAULT_LAYOUT,
    appearance,
    timeScale = 0.35,
    mouseLerp = 0.06,
  }) {
    this.renderer = renderer;
    this.timeScale = timeScale;
    this.mouseLerp = mouseLerp;
    this.layout = {
      position: [...layout.position],
      rotationDeg: [...layout.rotationDeg],
      scale: layout.scale ? [...layout.scale] : [1, 1, 1],
    };

    this.uniforms = createCloudUniforms(
      { detail: textures.detail, shape: textures.shape, mouse: null },
      resolution,
      appearance
    );
    this.material = createCloudMaterial(this.uniforms, appearance);
    this.mouseTrail = createMouseTrail(renderer, textures.detail);
    this.uniforms.tMouse.value = this.mouseTrail.texture;

    const layers = createCloudPlanes(this.material, this.layout);
    this.group = layers.group;
    this.foreground = layers.foreground;
    this.middleground = layers.middleground;

    this.mouseNdc = new THREE.Vector2();
    this.mouseTarget = new THREE.Vector2();
    this.mouseVelocity = new THREE.Vector2();
    this.prevMouse = new THREE.Vector2();
  }

  setLayout({ position, rotationDeg, scale } = {}) {
    if (position) {
      this.layout.position = [...position];
      this.group.position.fromArray(position);
    }
    if (rotationDeg) {
      this.layout.rotationDeg = [...rotationDeg];
      this.group.rotation.set(
        THREE.MathUtils.degToRad(rotationDeg[0]),
        THREE.MathUtils.degToRad(rotationDeg[1]),
        THREE.MathUtils.degToRad(rotationDeg[2])
      );
    }
    if (scale) {
      this.layout.scale = [...scale];
      this.group.scale.fromArray(scale);
    }
  }

  setAppearance({
    size,
    thinness,
    opacity,
    distortion,
    brightness,
    colorLight,
    colorDark,
  } = {}) {
    if (size) {
      this.material.uniforms.uSize.value.set(size[0], size[1]);
    }
    if (thinness !== undefined) {
      this.uniforms.uThinness.value = thinness;
    }
    if (opacity !== undefined) {
      this.uniforms.uOpacity.value = opacity;
    }
    if (distortion !== undefined) {
      this.uniforms.uDistortion.value = distortion;
    }
    if (brightness !== undefined) {
      this.uniforms.uBrightness.value = brightness;
    }
    if (colorLight) {
      this.uniforms.uColorLight.value.set(colorLight[0], colorLight[1], colorLight[2]);
    }
    if (colorDark) {
      this.uniforms.uColorDark.value.set(colorDark[0], colorDark[1], colorDark[2]);
    }
  }

  update(elapsed, skipMouseTrail = false) {
    const time = elapsed * this.timeScale;
    this.uniforms.uTime.value = time;

    if (!skipMouseTrail) {
      this.mouseNdc.lerp(this.mouseTarget, this.mouseLerp);
      this.mouseVelocity.subVectors(this.mouseNdc, this.prevMouse);
      this.prevMouse.copy(this.mouseNdc);
      this.mouseTrail.update(time, this.mouseNdc, this.mouseVelocity);
      this.uniforms.tMouse.value = this.mouseTrail.texture;
    }
  }

  setPointer(clientX, clientY, domElement) {
    const rect = domElement.getBoundingClientRect();
    this.mouseTarget.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.mouseTarget.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  }

  setResolution(bufferWidth, bufferHeight, aspectRatio) {
    this.uniforms.uResolution.value.set(bufferWidth, bufferHeight);
    this.uniforms.uRatio.value = aspectRatio ?? bufferWidth / bufferHeight;
  }

  dispose() {
    this.mouseTrail.dispose();
    this.material.dispose();
    this.foreground.geometry.dispose();
    this.middleground.geometry.dispose();
  }
}

export { createCloudMaterial, createCloudUniforms, DEFAULT_APPEARANCE } from './material.js';
export { createCloudPlanes, DEFAULT_CAMERA, DEFAULT_LAYOUT } from './planes.js';
export { createMouseTrail } from './mouseTrail.js';
