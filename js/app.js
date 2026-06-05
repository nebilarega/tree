import { SceneManager } from './scene.js';
import { Tree } from './tree.js';
import { DirtSystem } from './dirt.js';
import { WateringCanSystem } from './watering.js';
import { fpsValEl, rebuildValEl } from './ui.js';
import * as THREE from 'three';

class App {
  constructor() {
    this.targetGrowth = 0.0;
    this.currentGrowth = 0.0;
    this.pendingGrowth = null;
    this.growthStep = 0.005;
    this.lastFpsUpdate = 0;
    this.framesCount = 0;
    this.lastTimestamp = 0;
    
    // Transition State
    this.isTransitioning = false;
    this.currentSectionIndex = 0;
    this.growthStages = [0, 0.25, 0.5, 0.75, 1.0];

    // Interaction State
    this.mouse = new THREE.Vector2();
    this.raycaster = new THREE.Raycaster();
    this.hoveredApple = null;
    this.panningToApple = false;
    this.panTargetPos = new THREE.Vector3();
    this.panTargetLookAt = new THREE.Vector3();
    this.userInteracted = false;

    // Custom Smooth Scroll State
    this.currentScrollY = window.scrollY;
    this.targetScrollY = window.scrollY;
    this.scrollLerpFactor = 0.04;

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
    if ('scrollRestoration' in history) {
      history.scrollRestoration = 'manual';
    }

    window.scrollTo(0, 0);
    this.currentScrollY = 0;
    this.targetScrollY = 0;
    this.currentSectionIndex = 0;

    this.sceneManager.controls.enabled = false;

    this.sceneManager.onResize();
    this.tree.rebuild(0);
    
    window.addEventListener('resize', () => this.sceneManager.onResize());
    window.addEventListener('wheel', (e) => this.handleWheel(e), { passive: false });
    window.addEventListener('keydown', (e) => this.handleKey(e));
    window.addEventListener('mousemove', (e) => this.handleMouseMove(e));
    window.addEventListener('click', (e) => this.handleClick(e));

    const homeLink = document.getElementById('home-link');
    if (homeLink) {
      homeLink.addEventListener('click', (e) => {
        e.preventDefault();
        this.panningToApple = false;
        this.userInteracted = false;
        if (!this.isTransitioning && this.currentSectionIndex !== 0) {
          this.goToSection(0);
        }
      });
    }

    requestAnimationFrame((timestamp) => {
      this.lastFpsUpdate = timestamp;
      this.lastTimestamp = timestamp;
      this.animate(timestamp);
    });

    this.updateSectionVisibility();
    setTimeout(() => window.scrollTo(0, 0), 10);
  }

  handleMouseMove(e) {
    this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
  }

  handleClick(e) {
    if (this.currentGrowth < 0.95 || this.isTransitioning) return;
    
    this.raycaster.setFromCamera(this.mouse, this.sceneManager.camera);
    const intersects = this.raycaster.intersectObjects(this.tree.group.children, true);
    const fruit = intersects.find(intersect => intersect.object.userData && intersect.object.userData.type === 'fruit');

    if (fruit) {
      this.panningToApple = true;
      this.userInteracted = true; 
      
      const targetObj = fruit.object;
      targetObj.getWorldPosition(this.panTargetLookAt);
      
      const dir = new THREE.Vector3().subVectors(this.sceneManager.camera.position, this.panTargetLookAt).normalize();
      this.panTargetPos.copy(this.panTargetLookAt).addScaledVector(dir, 6);
    }
  }

  handleWheel(e) {
    if (this.isTransitioning || this.panningToApple) {
      if (this.panningToApple && Math.abs(e.deltaY) > 20) {
        this.panningToApple = false;
        this.userInteracted = false;
      }
      e.preventDefault();
      return;
    }

    if (Math.abs(e.deltaY) < 10) return;

    if (e.deltaY > 0 && this.currentSectionIndex < this.sections.length - 1) {
      this.goToSection(this.currentSectionIndex + 1);
    } else if (e.deltaY < 0 && this.currentSectionIndex > 0) {
      this.goToSection(this.currentSectionIndex - 1);
    }
    
    e.preventDefault();
  }

  handleKey(e) {
    if (this.isTransitioning) return;
    if (e.key === 'ArrowDown' || e.key === ' ') {
      if (this.currentSectionIndex < this.sections.length - 1) this.goToSection(this.currentSectionIndex + 1);
    } else if (e.key === 'ArrowUp') {
      if (this.currentSectionIndex > 0) this.goToSection(this.currentSectionIndex - 1);
    }
  }

  goToSection(index) {
    this.isTransitioning = true;
    this.currentSectionIndex = index;
    const nextTarget = this.growthStages[index];
    this.targetScrollY = this.sections[index].offsetTop;

    if (nextTarget > this.currentGrowth) {
      this.pendingGrowth = nextTarget;
      this.wateringCan.trigger();
    } else {
      this.targetGrowth = nextTarget;
    }
  }

  updateSectionVisibility() {
    this.sectionContents.forEach((content, index) => {
      if (index === this.currentSectionIndex) {
        content.classList.add('visible');
      } else {
        content.classList.remove('visible');
      }
    });
  }

  animate(timestamp) {
    requestAnimationFrame((t) => this.animate(t));
    this.framesCount++;

    const dt = (timestamp - this.lastTimestamp) / 1000;
    this.lastTimestamp = timestamp;

    if (Math.abs(this.targetScrollY - this.currentScrollY) > 0.5) {
      this.currentScrollY += (this.targetScrollY - this.currentScrollY) * this.scrollLerpFactor;
      window.scrollTo(0, this.currentScrollY);
      if (Math.abs(this.targetScrollY - this.currentScrollY) < 50) {
         this.updateSectionVisibility();
      }
    }

    if (timestamp > this.lastFpsUpdate + 500) {
      const fps = Math.round((this.framesCount * 1000) / (timestamp - this.lastFpsUpdate));
      if (fpsValEl) fpsValEl.innerText = fps;
      this.lastFpsUpdate = timestamp;
      this.framesCount = 0;
    }

    const peakHeight = -7.10 + this.dirtSystem.config.moundHeight;
    this.wateringCan.update(dt || 0, peakHeight);

    // Apple Hover Logic (Halo/Bloom)
    if (this.currentGrowth >= 0.95 && !this.isTransitioning) {
      this.raycaster.setFromCamera(this.mouse, this.sceneManager.camera);
      const intersects = this.raycaster.intersectObjects(this.tree.group.children, true);
      const fruit = intersects.find(intersect => intersect.object.userData && intersect.object.userData.type === 'fruit');

      if (fruit) {
        if (this.hoveredApple !== fruit.object) {
          if (this.hoveredApple) {
            const oldHalo = this.hoveredApple.getObjectByName('halo');
            if (oldHalo) oldHalo.material.opacity = 0;
          }
          this.hoveredApple = fruit.object;
          const halo = this.hoveredApple.getObjectByName('halo');
          if (halo) halo.material.opacity = 0.6;
          document.body.style.cursor = 'pointer';
        }
      } else {
        if (this.hoveredApple) {
          const halo = this.hoveredApple.getObjectByName('halo');
          if (halo) halo.material.opacity = 0;
          this.hoveredApple = null;
          document.body.style.cursor = 'default';
        }
      }
    }

    if (!this.wateringCan.isActive && this.pendingGrowth !== null) {
      this.targetGrowth = this.pendingGrowth;
      this.pendingGrowth = null;
    }

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
      if (rebuildValEl) {
        const appleCount = this.tree.fruitTransforms ? this.tree.fruitTransforms.length : 0;
        rebuildValEl.innerText = `${duration.toFixed(2)}ms | Apples: ${appleCount}`;
      }
    }

    const isScrollDone = Math.abs(this.targetScrollY - this.currentScrollY) < 1.0;
    if (this.isTransitioning && isScrollDone && !this.wateringCan.isActive && this.currentGrowth === this.targetGrowth) {
      this.isTransitioning = false;
    }

    this.dirtSystem.update(dt || 0);

    if (this.panningToApple) {
      this.sceneManager.camera.position.lerp(this.panTargetPos, 0.05);
      this.sceneManager.controls.target.lerp(this.panTargetLookAt, 0.05);
      
      if (Math.abs(this.targetScrollY - this.currentScrollY) > 10) {
        this.panningToApple = false;
        this.userInteracted = false;
      }
    } else {
      const isMobile = window.innerWidth < 768;
      const camStart = { x: -2, y: -4, z: 8 };
      const camEnd = isMobile ? { x: 3, y: 7, z: 35 } : { x: 3, y: 5, z: 25 };
      
      this.sceneManager.camera.position.x = this._lerp(camStart.x, camEnd.x, this.currentGrowth);
      this.sceneManager.camera.position.y = this._lerp(camStart.y, camEnd.y, this.currentGrowth);
      this.sceneManager.camera.position.z = this._lerp(camStart.z, camEnd.z, this.currentGrowth);

      const targetStart = { x: 0, y: -6, z: 0 };
      const targetEnd = isMobile ? { x: 0, y: 6, z: 0 } : { x: 0, y: 4, z: 0 };
      this.sceneManager.controls.target.x = this._lerp(targetStart.x, targetEnd.x, this.currentGrowth);
      this.sceneManager.controls.target.y = this._lerp(targetStart.y, targetEnd.y, this.currentGrowth);
      this.sceneManager.controls.target.z = this._lerp(targetStart.z, targetEnd.z, this.currentGrowth);
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
