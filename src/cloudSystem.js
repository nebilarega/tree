import * as THREE from 'three';
import { CloudLayer } from './clouds/index.js';
/** Layout tuned for the portfolio camera (close-up tree, clouds as distant sky). */
export const PORTFOLIO_CLOUD_LAYOUT = {
  position: [0, 52, -210],
  rotationDeg: [7, -110.5, 0],
};

/** Lilac-tinted palette matching the site gradient. */
export const PORTFOLIO_CLOUD_APPEARANCE = {
  size: [1, 1],
  thinness: 0.02,
  opacity: 0.88,
  distortion: 0.8,
  brightness: 1.05,
  colorLight: [0.98, 0.96, 1.0],
  colorDark: [0.76, 0.8, 0.9],
};

export class CloudSystem {
  static async create(scene, renderer) {
    const loader = new THREE.TextureLoader();
    const [detail, shape] = await Promise.all([
      loader.loadAsync('/textures/cloud-detail.webp'),
      loader.loadAsync('/textures/cloud-shape.webp'),
    ]);

    const resolution = new THREE.Vector2(
      renderer.domElement.width,
      renderer.domElement.height,
    );

    const clouds = new CloudLayer({
      renderer,
      textures: { detail, shape },
      resolution,
      layout: PORTFOLIO_CLOUD_LAYOUT,
      appearance: PORTFOLIO_CLOUD_APPEARANCE,
      timeScale: 0.3,
    });

    scene.add(clouds.group);
    return new CloudSystem(clouds);
  }

  constructor(clouds) {
    this.clouds = clouds;
    this.startTime = performance.now() / 1000;
  }

  update(skipMouseTrail = false) {
    const elapsed = performance.now() / 1000 - this.startTime;
    this.clouds.update(elapsed, skipMouseTrail);
  }

  setPointer(clientX, clientY, domElement) {
    this.clouds.setPointer(clientX, clientY, domElement);
  }

  onResize(renderer) {
    this.clouds.setResolution(
      renderer.domElement.width,
      renderer.domElement.height,
      window.innerWidth / window.innerHeight,
    );
  }
}
