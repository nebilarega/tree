import { SceneManager } from './scene.js';
import { Tree } from './tree.js';
import { DirtSystem } from './dirt.js';
import { WateringCanSystem } from './watering.js';
import { fpsValEl, rebuildValEl } from './ui.js';

class App {
  constructor() {
    this.targetGrowth = 0.0;
    this.currentGrowth = 0.0;
    this.pendingGrowth = null;
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
      (r, x, z) => Math.max(-7.01, this.dirtSystem.calculateSurfaceHeight(r, x, z) - 7.10)
    );

    this.sections = document.querySelectorAll('section');
    this.sectionContents = document.querySelectorAll('.section-content');

    this.initialize();
  }

  initialize() {
    this.sceneManager.controls.enabled = false; // Disable orbit controls for a guided experience

    this.sceneManager.onResize();
    this.tree.rebuild(0);
    
    window.addEventListener('resize', () => this.sceneManager.onResize());
    window.addEventListener('scroll', () => this.handleScroll());

    requestAnimationFrame((timestamp) => {
      this.lastFpsUpdate = timestamp;
      this.lastTimestamp = timestamp;
      this.animate(timestamp);
    });

    this.handleScroll(); // Initial check
  }

  handleScroll() {
    const scrollY = window.scrollY;
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    const scrollProgress = scrollY / maxScroll;

    // Map scroll sections to discrete growth stages: 0, 0.25, 0.5, 0.75, 1.0
    let nextTarget = 0;
    if (scrollProgress < 0.1) {
      nextTarget = 0;
    } else if (scrollProgress < 0.3) {
      nextTarget = 0.25;
    } else if (scrollProgress < 0.5) {
      nextTarget = 0.5;
    } else if (scrollProgress < 0.75) {
      nextTarget = 0.75;
    } else {
      nextTarget = 1.0;
    }

    if (nextTarget !== this.targetGrowth && nextTarget !== this.pendingGrowth) {
      // Trigger watering only if growing forward
      if (nextTarget > this.currentGrowth) {
        this.pendingGrowth = nextTarget;
        this.wateringCan.trigger();
      } else {
        // Just shrink immediately if scrolling up
        this.targetGrowth = nextTarget;
      }
    }

    // Handle section visibility
    this.sections.forEach((section, index) => {
      const rect = section.getBoundingClientRect();
      const isVisible = rect.top < window.innerHeight * 0.7 && rect.bottom > window.innerHeight * 0.3;
      if (isVisible) {
        this.sectionContents[index].classList.add('visible');
      } else {
        this.sectionContents[index].classList.remove('visible');
      }
    });
  }

  animate(timestamp) {
    requestAnimationFrame((t) => this.animate(t));
    this.framesCount++;

    const dt = (timestamp - this.lastTimestamp) / 1000;
    this.lastTimestamp = timestamp;

    // FPS Counter
    if (timestamp > this.lastFpsUpdate + 500) {
      const fps = Math.round((this.framesCount * 1000) / (timestamp - this.lastFpsUpdate));
      if (fpsValEl) fpsValEl.innerText = fps;
      this.lastFpsUpdate = timestamp;
      this.framesCount = 0;
    }

    // Watering Can Update
    const peakHeight = -7.10 + this.dirtSystem.config.moundHeight;
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
        for(let i=0; i<amountToSpawn; i++) {
          this.dirtSystem.spawn(this.currentGrowth);
        }
      }
      
      const duration = this.tree.rebuild(this.currentGrowth);
      if (rebuildValEl) rebuildValEl.innerText = duration.toFixed(2);
    }

    this.dirtSystem.update(dt || 0);

    // Dynamic Camera Path
    const camStart = { x: -2, y: -4, z: 8 };
    const camEnd = { x: 3, y: 5, z: 25 };
    
    this.sceneManager.camera.position.x = this._lerp(camStart.x, camEnd.x, this.currentGrowth);
    this.sceneManager.camera.position.y = this._lerp(camStart.y, camEnd.y, this.currentGrowth);
    this.sceneManager.camera.position.z = this._lerp(camStart.z, camEnd.z, this.currentGrowth);

    const targetStart = { x: 0, y: -6, z: 0 };
    const targetEnd = { x: 0, y: 4, z: 0 };
    this.sceneManager.controls.target.x = this._lerp(targetStart.x, targetEnd.x, this.currentGrowth);
    this.sceneManager.controls.target.y = this._lerp(targetStart.y, targetEnd.y, this.currentGrowth);
    this.sceneManager.controls.target.z = this._lerp(targetStart.z, targetEnd.z, this.currentGrowth);

    this.tree.updateWind(timestamp * 0.001);

    this.sceneManager.controls.update();
    this.sceneManager.render();
  }

  _lerp(start, end, t) {
    return start * (1 - t) + end * t;
  }
}

new App();
