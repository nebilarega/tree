import { SceneManager } from "./scene.js";
import { Tree } from "./tree.js";
import { DirtSystem } from "./dirt.js";
import { WateringCanSystem } from "./watering.js";
import { fpsValEl, rebuildValEl, setupGrowthButtons } from "./ui.js";

class App {
  constructor() {
    this.targetGrowth = 0.0;
    this.currentGrowth = 0.0;
    this.pendingGrowth = null; // New: storage for growth target during watering
    this.growthStep = 0.005;
    this.lastFpsUpdate = 0;
    this.framesCount = 0;
    this.userInteracted = false;
    this.lastTimestamp = 0;

    this.sceneManager = new SceneManager();
    this.tree = new Tree(this.sceneManager.scene);
    this.dirtSystem = new DirtSystem(this.sceneManager.scene);
    this.wateringCan = new WateringCanSystem(
      this.sceneManager.scene,
      (r, x, z) =>
        Math.max(-7.01, this.dirtSystem.calculateSurfaceHeight(r, x, z) - 7.1),
    );

    this.initialize();
  }

  initialize() {
    this.sceneManager.controls.addEventListener("start", () => {
      this.userInteracted = true;
    });

    setupGrowthButtons((value) => {
      if (value !== this.currentGrowth) {
        this.pendingGrowth = value;
        this.wateringCan.trigger();
      }
    });

    this.sceneManager.onResize();
    this.tree.rebuild(0);

    window.addEventListener("resize", () => this.sceneManager.onResize());

    requestAnimationFrame((timestamp) => {
      this.lastFpsUpdate = timestamp;
      this.lastTimestamp = timestamp;
      this.animate(timestamp);
    });
  }

  animate(timestamp) {
    requestAnimationFrame((t) => this.animate(t));
    this.framesCount++;

    const dt = (timestamp - this.lastTimestamp) / 1000;
    this.lastTimestamp = timestamp;

    // FPS Counter
    if (timestamp > this.lastFpsUpdate + 500) {
      const fps = Math.round(
        (this.framesCount * 1000) / (timestamp - this.lastFpsUpdate),
      );
      fpsValEl.innerText = fps;
      this.lastFpsUpdate = timestamp;
      this.framesCount = 0;
    }

    // Watering Can Update
    const peakHeight = -7.1 + this.dirtSystem.config.moundHeight;
    this.wateringCan.update(dt || 0, peakHeight);

    // If watering is done, apply the pending growth
    if (!this.wateringCan.isActive && this.pendingGrowth !== null) {
      this.targetGrowth = this.pendingGrowth;
      this.pendingGrowth = null;
    }

    // Growth Logic
    if (this.currentGrowth !== this.targetGrowth) {
      const isGrowing = this.targetGrowth > this.currentGrowth;
      this.currentGrowth =
        this.currentGrowth < this.targetGrowth
          ? Math.min(this.currentGrowth + this.growthStep, this.targetGrowth)
          : Math.max(this.currentGrowth - this.growthStep, this.targetGrowth);

      if (isGrowing) {
        const amountToSpawn = 1 + Math.floor(this.currentGrowth * 2.5);
        for (let i = 0; i < amountToSpawn; i++) {
          this.dirtSystem.spawn(this.currentGrowth);
        }
      }

      const duration = this.tree.rebuild(this.currentGrowth);
      rebuildValEl.innerText = duration.toFixed(2);
    }

    // Dirt Update
    this.dirtSystem.update(dt || 0);

    // Camera/Target Lerp
    const camStart = { x: 0, y: -4, z: 6 };
    const camEnd = { x: 0, y: 4, z: 22 };
    if (!this.userInteracted) {
      this.sceneManager.camera.position.x = this._lerp(
        camStart.x,
        camEnd.x,
        this.currentGrowth,
      );
      this.sceneManager.camera.position.y = this._lerp(
        camStart.y,
        camEnd.y,
        this.currentGrowth,
      );
      this.sceneManager.camera.position.z = this._lerp(
        camStart.z,
        camEnd.z,
        this.currentGrowth,
      );
    }

    const targetStart = { x: 0, y: -6, z: 0 };
    const targetEnd = { x: 0, y: 3, z: 0 };
    this.sceneManager.controls.target.x = this._lerp(
      targetStart.x,
      targetEnd.x,
      this.currentGrowth,
    );
    this.sceneManager.controls.target.y = this._lerp(
      targetStart.y,
      targetEnd.y,
      this.currentGrowth,
    );
    this.sceneManager.controls.target.z = this._lerp(
      targetStart.z,
      targetEnd.z,
      this.currentGrowth,
    );

    // Sky/Wind Updates
    if (this.sceneManager.sky.material.uniforms["time"]) {
      this.sceneManager.sky.material.uniforms["time"].value = timestamp * 0.001;
    }
    if (this.sceneManager.sky.material.uniforms["cameraPos"]) {
      this.sceneManager.sky.material.uniforms["cameraPos"].value.copy(
        this.sceneManager.camera.position,
      );
    }

    this.tree.updateWind(timestamp * 0.001);

    this.sceneManager.controls.update();
    this.sceneManager.render();
  }

  _lerp(start, end, t) {
    return start * (1 - t) + end * t;
  }
}

new App();
