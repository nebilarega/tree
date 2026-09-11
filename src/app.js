import { SceneManager } from "./scene.js";
import { Tree } from "./tree.js";
import { DirtSystem } from "./dirt.js";
import { WateringCanSystem } from "./watering.js";
import { CloudSystem } from "./cloudSystem.js";
import { mountIcons } from "./icons.js";
import { fpsValEl, rebuildValEl } from "./ui.js";
import * as THREE from "three";

const APPLE_COLORS = {
  LinkedIn: "#0077b5",
  GitHub: "#111111",
  Portfolio: "#ff6666",
};

class App {
  constructor() {
    this.targetGrowth = 0.0;
    this.currentGrowth = 0.0;
    this.lastRebuildGrowth = 0.0;
    this.pendingGrowth = null;
    this.growthStep = 0.008;
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
    this.hoveredPath = null; // Track by stable path ID
    this.panningToApple = false;
    this.panTargetPos = new THREE.Vector3();
    this.panTargetLookAt = new THREE.Vector3();
    this._appleWorldPos = new THREE.Vector3();
    this._appleViewDir = new THREE.Vector3();
    this._cameraOffset = new THREE.Vector3();
    this.userInteracted = false;

    // Mobile Touch State
    this.touchStartY = 0;
    this.touchThreshold = 40; // Minimum swipe distance

    // Social UI state
    this.isSocialBoxOpen = false;
    this.pendingSocialType = null; // New: queue the box appearance
    this.socialData = {
      LinkedIn: {
        title: "LinkedIn",
        desc: "Professional background, career history, and how to reach me.",
        url: "https://linkedin.com",
      },
      GitHub: {
        title: "GitHub",
        desc: "Open-source projects, experiments, and the code behind this portfolio.",
        url: "https://github.com",
      },
      Portfolio: {
        title: "Selected Work",
        desc: "Case studies and write-ups on specific projects and architectural decisions.",
        url: "#",
        cta: "VIEW SELECTED WORK",
      },
    };

    // Custom Smooth Scroll State
    this.currentScrollY = window.scrollY;
    this.targetScrollY = window.scrollY;
    this.scrollLerpFactor = 0.04;

    this.sceneManager = new SceneManager();
    this.hdrLoaded = false;
    this.cloudSystem = null;
    this.tree = new Tree(this.sceneManager.scene);
    this.dirtSystem = new DirtSystem(this.sceneManager.scene);
    this.wateringCan = new WateringCanSystem(
      this.sceneManager.scene,
      (r, x, z) =>
        Math.max(-7.51, this.dirtSystem.calculateSurfaceHeight(r, x, z) - 7.6),
    );

    this.sections = document.querySelectorAll("section");
    this.sectionContents = document.querySelectorAll(".section-content");

    this.initialize();
  }

  initialize() {
    if ("scrollRestoration" in history) {
      history.scrollRestoration = "manual";
    }

    window.scrollTo(0, 0);
    this.currentScrollY = 0;
    this.targetScrollY = 0;
    this.currentSectionIndex = 0;

    this.sceneManager.controls.enabled = false;

    mountIcons();

    this.sceneManager.onResize();
    this.tree.rebuild(0);

    window.addEventListener("resize", () => {
      this.sceneManager.onResize();
      if (this.cloudSystem) {
        this.cloudSystem.onResize(this.sceneManager.renderer);
      }
    });
    window.addEventListener("wheel", (e) => this.handleWheel(e), {
      passive: false,
    });
    window.addEventListener("keydown", (e) => this.handleKey(e));
    window.addEventListener("mousemove", (e) => this.handleMouseMove(e));
    window.addEventListener("pointermove", (e) => this.handlePointerMove(e));
    window.addEventListener("click", (e) => this.handleClick(e));

    // Mobile Touch Events
    window.addEventListener("touchstart", (e) => this.handleTouchStart(e), {
      passive: false,
    });
    window.addEventListener("touchmove", (e) => e.preventDefault(), {
      passive: false,
    });
    window.addEventListener("touchend", (e) => this.handleTouchEnd(e), {
      passive: false,
    });

    // Social Box Close Button
    const closeBtn = document.querySelector("#social-box .close-btn");
    if (closeBtn) {
      closeBtn.addEventListener("click", () => this.closeSocialBox());
    }

    const homeLink = document.getElementById("home-link");
    if (homeLink) {
      homeLink.addEventListener("click", (e) => {
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

    // Synchronized Loading: Start HDR load and minimum timer
    let minTimeElapsed = false;
    setTimeout(() => {
      minTimeElapsed = true;
      if (this.hdrLoaded) this.hideLoader();
    }, 2500);

    this.sceneManager.initEnvironment(() => {
      this.hdrLoaded = true;
      if (minTimeElapsed) this.hideLoader();
    });

    CloudSystem.create(this.sceneManager.scene, this.sceneManager.renderer)
      .then((cloudSystem) => {
        this.cloudSystem = cloudSystem;
      })
      .catch(console.error);
  }

  hideLoader() {
    const loader = document.getElementById("loader");
    if (loader && !loader.classList.contains("fade-out")) {
      loader.classList.add("fade-out");
      // Lock scroll briefly to allow entry animation
      document.body.classList.add("locked");
      setTimeout(() => {
        document.body.classList.remove("locked");
        this.goToSection(0); // Trigger hero reveal
      }, 1000);
    }
  }

  handleMouseMove(e) {
    this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
  }

  handlePointerMove(e) {
    if (this.cloudSystem) {
      this.cloudSystem.setPointer(
        e.clientX,
        e.clientY,
        this.sceneManager.renderer.domElement,
      );
    }
  }

  handleTouchStart(e) {
    this.touchStartY = e.touches[0].clientY;
  }

  handleTouchEnd(e) {
    const touch = e.changedTouches[0];
    const deltaY = this.touchStartY - touch.clientY;

    if (Math.abs(deltaY) <= this.touchThreshold) {
      this.mouse.x = (touch.clientX / window.innerWidth) * 2 - 1;
      this.mouse.y = -(touch.clientY / window.innerHeight) * 2 + 1;
      if (this.currentGrowth >= 0.9 && !this.isTransitioning) {
        const fruitData = this.getFruitUnderCursor();
        if (fruitData) {
          this.focusOnApple(fruitData);
          return;
        }
      }
    }

    if (this.isTransitioning || this.panningToApple) return;

    if (Math.abs(deltaY) > this.touchThreshold) {
      if (deltaY > 0 && this.currentSectionIndex < this.sections.length - 1) {
        this.goToSection(this.currentSectionIndex + 1);
      } else if (deltaY < 0 && this.currentSectionIndex > 0) {
        this.goToSection(this.currentSectionIndex - 1);
      }
    }
  }

  getFruitUnderCursor() {
    this.raycaster.setFromCamera(this.mouse, this.sceneManager.camera);
    const intersects = this.raycaster.intersectObjects(
      this.tree.group.children,
      true,
    );

    for (const intersect of intersects) {
      if (
        intersect.object === this.tree.fruitInstancedMesh &&
        intersect.instanceId !== undefined
      ) {
        return this.tree.fruitData[intersect.instanceId];
      }
    }

    return null;
  }

  focusOnApple(fruitData) {
    this.panningToApple = true;
    this.userInteracted = true;

    this._appleWorldPos.setFromMatrixPosition(fruitData.matrix);
    this.panTargetLookAt.copy(this._appleWorldPos);

    this._cameraOffset.subVectors(
      this.sceneManager.camera.position,
      this.sceneManager.controls.target,
    );

    if (this.isSocialBoxOpen && this._cameraOffset.lengthSq() > 1) {
      // Already zoomed: keep the same viewing offset so switching apples pans visibly.
      this.panTargetPos.copy(this._appleWorldPos).add(this._cameraOffset);
    } else {
      this._appleViewDir
        .subVectors(this.sceneManager.camera.position, this._appleWorldPos)
        .normalize();
      if (this._appleViewDir.lengthSq() < 0.0001) {
        this._appleViewDir.set(0.35, 0.25, 1).normalize();
      }
      this.panTargetPos
        .copy(this._appleWorldPos)
        .addScaledVector(this._appleViewDir, 6);
    }

    const social = fruitData.social;
    if (social && this.socialData[social]) {
      if (this.isSocialBoxOpen) {
        this.pendingSocialType = null;
        this.openSocialBox(social);
      } else {
        this.pendingSocialType = social;
      }
    } else {
      this.closeSocialBox(false);
    }
  }

  handleClick(e) {
    if (this.currentGrowth < 0.9 || this.isTransitioning) return;

    const fruitData = this.getFruitUnderCursor();

    if (fruitData) {
      this.focusOnApple(fruitData);
    } else {
      this.closeSocialBox();
    }
  }

  openSocialBox(type) {
    const data = this.socialData[type];
    const box = document.getElementById("social-box");
    const title = document.getElementById("social-title");
    const desc = document.getElementById("social-desc");
    const url = document.getElementById("social-url");

    if (box && data) {
      title.textContent = data.title;
      desc.textContent = data.desc;
      url.href = data.url;
      url.textContent = data.cta || `VISIT ${data.title.toUpperCase()}`;
      this.applySocialTheme(type);
      box.classList.add("visible");
      this.isSocialBoxOpen = true;
    }
  }

  applySocialTheme(type) {
    const box = document.getElementById("social-box");
    if (!box) return;
    const color = APPLE_COLORS[type] || "#7c3aed";
    box.style.setProperty("--social-accent", color);
  }

  closeSocialBox(resetCamera = true) {
    const box = document.getElementById("social-box");
    if (box) {
      box.classList.remove("visible");
      box.style.removeProperty("--social-accent");
    }
    this.isSocialBoxOpen = false;

    if (resetCamera) {
      this.panningToApple = false;
      this.userInteracted = false;
    }
  }

  handleWheel(e) {
    if (this.isTransitioning || this.panningToApple) {
      if (this.panningToApple && Math.abs(e.deltaY) > 20) {
        this.closeSocialBox(); // Reset UI on manual scroll
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
    if (e.key === "ArrowDown" || e.key === " ") {
      if (this.currentSectionIndex < this.sections.length - 1)
        this.goToSection(this.currentSectionIndex + 1);
    } else if (e.key === "ArrowUp") {
      if (this.currentSectionIndex > 0)
        this.goToSection(this.currentSectionIndex - 1);
    }
  }

  goToSection(index) {
    this.closeSocialBox(); // Hide UI on transition start
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
    // Keep the previous section visible while watering plays on forward scrolls
    if (
      this.isTransitioning &&
      this.pendingGrowth !== null &&
      this.wateringCan.isActive
    ) {
      return;
    }

    this.sectionContents.forEach((content, index) => {
      if (index === this.currentSectionIndex) {
        content.classList.add("visible");
      } else {
        content.classList.remove("visible");
      }
    });

    // Update scroll hint text
    const hint = document.getElementById("scroll-hint");
    if (hint) {
      if (this.currentSectionIndex === this.sections.length - 1) {
        hint.textContent = "Scroll to the top";
      } else {
        hint.textContent = "Scroll to continue";
      }
    }
  }

  animate(timestamp) {
    requestAnimationFrame((t) => this.animate(t));
    this.framesCount++;

    const dt = (timestamp - this.lastTimestamp) / 1000;
    this.lastTimestamp = timestamp;

    if (Math.abs(this.targetScrollY - this.currentScrollY) > 0.5) {
      this.currentScrollY +=
        (this.targetScrollY - this.currentScrollY) * this.scrollLerpFactor;
      window.scrollTo(0, this.currentScrollY);
      if (Math.abs(this.targetScrollY - this.currentScrollY) < 50) {
        this.updateSectionVisibility();
      }
    }

    if (timestamp > this.lastFpsUpdate + 500) {
      const fps = Math.round(
        (this.framesCount * 1000) / (timestamp - this.lastFpsUpdate),
      );
      if (fpsValEl) fpsValEl.innerText = fps;
      this.lastFpsUpdate = timestamp;
      this.framesCount = 0;
    }

    const peakHeight = -7.6 + this.dirtSystem.config.moundHeight;
    this.wateringCan.update(dt || 0, peakHeight);

    // Stable Apple Hover Logic (survives rebuilds)
    if (this.currentGrowth >= 0.9) {
      this.raycaster.setFromCamera(this.mouse, this.sceneManager.camera);
      const intersects = this.raycaster.intersectObjects(
        this.tree.group.children,
        true,
      );

      let hoveredFruitData = null;
      let hoveredInstanceId = -1;

      for (const intersect of intersects) {
        if (
          intersect.object === this.tree.fruitInstancedMesh &&
          intersect.instanceId !== undefined
        ) {
          hoveredInstanceId = intersect.instanceId;
          hoveredFruitData = this.tree.fruitData[hoveredInstanceId];
          break;
        }
      }

      const tooltipEl = document.getElementById("apple-tooltip");

      if (hoveredFruitData) {
        const currentPath = hoveredFruitData.path;

        // If we switched apples
        if (this.hoveredPath !== currentPath) {
          this.hoveredPath = currentPath;

          if (tooltipEl) {
            const social = hoveredFruitData.social;
            tooltipEl.textContent = social || "Apple";
            tooltipEl.style.backgroundColor = APPLE_COLORS[social] || "#333333";
            tooltipEl.classList.add("visible");
          }
        }

        // Update halo shader uniforms
        if (this.tree.haloInstancedMesh) {
          this.tree.haloInstancedMesh.material.uniforms.opacity.value = 0.6;
          this.tree.haloInstancedMesh.material.uniforms.activeInstance.value =
            hoveredInstanceId;
        }

        if (tooltipEl) {
          const vector = new THREE.Vector3().setFromMatrixPosition(
            hoveredFruitData.matrix,
          );
          const canvas = this.sceneManager.renderer.domElement;
          vector.project(this.sceneManager.camera);
          const x = (vector.x * 0.5 + 0.5) * canvas.clientWidth;
          const y = (vector.y * -0.5 + 0.5) * canvas.clientHeight;

          tooltipEl.style.left = `${x}px`;
          tooltipEl.style.top = `${y - 40}px`;
        }

        document.body.style.cursor = "pointer";
      } else {
        // MOUSE LEFT: Reset everything
        if (this.tree.haloInstancedMesh) {
          this.tree.haloInstancedMesh.material.uniforms.opacity.value = 0;
          this.tree.haloInstancedMesh.material.uniforms.activeInstance.value =
            -1;
        }
        this.hoveredPath = null;
        if (tooltipEl) tooltipEl.classList.remove("visible");
        document.body.style.cursor = "default";
      }
    }

    if (!this.wateringCan.isActive && this.pendingGrowth !== null) {
      this.targetGrowth = this.pendingGrowth;
      this.pendingGrowth = null;
      this.updateSectionVisibility();
    }

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

      // Throttle rebuilds: dynamically adjusted based on previous rebuild durations to protect FPS
      if (this.rebuildThrottle === undefined) {
        this.rebuildThrottle = 0.012;
      }
      const growthChange = Math.abs(
        this.currentGrowth - this.lastRebuildGrowth,
      );
      const isAtTarget = this.currentGrowth === this.targetGrowth;

      if (growthChange > this.rebuildThrottle || isAtTarget) {
        const duration = this.tree.rebuild(this.currentGrowth);
        this.lastRebuildGrowth = this.currentGrowth;

        // Dynamically adjust throttle based on CPU/rendering performance
        if (duration > 16.0) {
          // Slow CPU: increase throttle up to 0.03 (less rebuild frequency to avoid stutter)
          this.rebuildThrottle = Math.min(this.rebuildThrottle + 0.005, 0.03);
        } else if (duration < 8.0) {
          // Fast CPU: decrease throttle down to 0.01 for buttery smooth animation
          this.rebuildThrottle = Math.max(this.rebuildThrottle - 0.002, 0.01);
        }

        if (rebuildValEl) {
          const appleCount = this.tree.fruitData
            ? this.tree.fruitData.length
            : 0;
          rebuildValEl.innerText = `${duration.toFixed(2)}ms (Throttle: ${this.rebuildThrottle.toFixed(3)}) | Apples: ${appleCount}`;
        }
      }
    }

    const isScrollDone =
      Math.abs(this.targetScrollY - this.currentScrollY) < 1.0;
    if (
      this.isTransitioning &&
      isScrollDone &&
      !this.wateringCan.isActive &&
      this.currentGrowth === this.targetGrowth
    ) {
      this.isTransitioning = false;
    }

    this.dirtSystem.update(dt || 0);

    if (this.panningToApple) {
      const panLerp = 1 - Math.exp(-4.5 * (dt || 0.016));
      this.sceneManager.camera.position.lerp(
        this.panTargetPos,
        panLerp,
      );
      this.sceneManager.controls.target.lerp(
        this.panTargetLookAt,
        panLerp,
      );
      this.sceneManager.camera.lookAt(this.sceneManager.controls.target);

      const posDist = this.sceneManager.camera.position.distanceTo(
        this.panTargetPos,
      );

      if (this.pendingSocialType && posDist < 0.45) {
        this.openSocialBox(this.pendingSocialType);
        this.pendingSocialType = null;
      }

      if (Math.abs(this.targetScrollY - this.currentScrollY) > 10) {
        this.closeSocialBox(); // Reset everything on scroll
      }
    } else {
      const isMobile = window.innerWidth < 768;
      const camStart = isMobile
        ? { x: -2, y: -5, z: 9 }
        : { x: -2, y: -4, z: 8 };
      const camEnd = isMobile ? { x: 3, y: 7, z: 35 } : { x: 3, y: 5, z: 25 };

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

      const targetStart = isMobile
        ? { x: 0, y: -7.5, z: 0 }
        : { x: 0, y: -6, z: 0 };
      const targetEnd = isMobile ? { x: 0, y: 6, z: 0 } : { x: 0, y: 4, z: 0 };
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
    }

    this.tree.updateWind(timestamp * 0.001);
    if (this.cloudSystem) {
      this.cloudSystem.update(this.panningToApple);
    }
    if (!this.panningToApple) {
      this.sceneManager.controls.update();
    }
    this.sceneManager.render();
  }

  _lerp(start, end, t) {
    return start * (1 - t) + end * t;
  }

  _toScreenPosition(obj) {
    const vector = new THREE.Vector3();
    const canvas = this.sceneManager.renderer.domElement;

    obj.updateMatrixWorld();
    vector.setFromMatrixPosition(obj.matrixWorld);
    vector.project(this.sceneManager.camera);

    const x = (vector.x * 0.5 + 0.5) * canvas.clientWidth;
    const y = (vector.y * -0.5 + 0.5) * canvas.clientHeight;

    return { x, y };
  }
}

new App();
