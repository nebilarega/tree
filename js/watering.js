import * as THREE from "three";

export class WateringCanSystem {
  /**
   * @param {THREE.Scene} scene - Your main Three.js scene instance
   * @param {Function} surfaceHeightCallback - A function passed from your main script that takes (radius, x, z) and returns the floor/mound height so water splashes accurately.
   */
  constructor(scene, surfaceHeightCallback) {
    this.scene = scene;
    this.getSurfaceHeight = surfaceHeightCallback || ((r, x, z) => 0);

    // Core State Variables
    this.animationTime = 0;
    this.isActive = false;

    // Animation path bounds (Home = Bottom-Right foreground viewer space)
    this.HOME_POS = new THREE.Vector3(5.5, -2.0, 5.0); // Moved forward (z: 5.0) to stay in front of camera
    this.HOVER_POS = new THREE.Vector3(-1.8, 1.6 + 1.2, 1.2); 
    this.CAN_Y_ROT = 0.6; // Reversed sign for correct angle

    // Configuration Parameters
    this.maxMistPoints = 350;
    this.mistData = [];
    this.globalTipWorldPos = new THREE.Vector3();

    // Initialize Internal Engines
    this._createCanMesh();
    this._createMistSystem();
  }

  /**
   * Triggers the watering cycle. Call this inside your HTML button click listener.
   */
  trigger() {
    if (this.isActive) return;
    this.isActive = true;
    this.canGroup.visible = true;
    this.animationTime = 0;
  }

  /**
   * Main update driver. Call this inside your requestAnimationFrame loop, passing delta time.
   * @param {number} dt - Clock delta time (seconds)
   * @param {number} currentMoundHeight - Dynamic top height of your dirt/tree center to float above
   */
  update(dt, currentMoundHeight = 1.6) {
    this._updateCanTimeline(dt, currentMoundHeight);
    this._updateMistPhysics(dt);
  }

  /**
   * Completely unloads geometries and textures from GPU memory when abandoning scene.
   */
  dispose() {
    this.scene.remove(this.canGroup);
    this.scene.remove(this.mistParticleSystem);

    this.canGroup.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
    });
    this.mistGeometry.dispose();
    this.mistMaterial.map.dispose();
    this.mistMaterial.dispose();
  }

  // --- INTERNAL ARCHITECTURE METHODS (PRIVATE) ---

  _createCanMesh() {
    this.canGroup = new THREE.Group();
    const metalMat = new THREE.MeshStandardMaterial({
      color: 0x2e5a61,
      roughness: 0.25,
      metalness: 0.75,
    });

    // Sealed Lathe Body Profile
    const points = [new THREE.Vector2(0, -0.35)];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const radius = 0.22 + Math.pow(t - 0.6, 2) * 0.22;
      const height = (t - 0.5) * 0.7;
      points.push(new THREE.Vector2(radius, height));
    }
    points.push(new THREE.Vector2(0, 0.35));

    const bodyGeo = new THREE.LatheGeometry(points, 32);
    const body = new THREE.Mesh(bodyGeo, metalMat);
    body.castShadow = true;
    this.canGroup.add(body);

    // Aligned Spout Cylinder
    const spoutGeo = new THREE.CylinderGeometry(0.015, 0.035, 0.65, 12);
    spoutGeo.rotateZ(-Math.PI / 3.2);
    spoutGeo.translate(0.34, 0.15, 0);
    const spout = new THREE.Mesh(spoutGeo, metalMat);
    spout.castShadow = true;
    this.canGroup.add(spout);

    // Rose Spray Head Tip
    const roseGeo = new THREE.CylinderGeometry(0.05, 0.018, 0.08, 12);
    roseGeo.rotateZ(-Math.PI / 3.2);
    roseGeo.translate(0.62, 0.32, 0);
    const rose = new THREE.Mesh(roseGeo, metalMat);
    this.canGroup.add(rose);

    // Dynamic Position Vector Tracker Object
    this.spoutTipAnchor = new THREE.Object3D();
    this.spoutTipAnchor.position.set(0.65, 0.34, 0);
    this.canGroup.add(this.spoutTipAnchor);

    // Proportional Ergonomic Spline Pipe Handle
    const handleCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.02, 0.28, 0),
      new THREE.Vector3(-0.2, 0.3, 0),
      new THREE.Vector3(-0.32, 0.05, 0),
      new THREE.Vector3(-0.2, -0.25, 0),
    ]);
    const handleGeo = new THREE.TubeGeometry(handleCurve, 24, 0.02, 12, false);
    const handle = new THREE.Mesh(handleGeo, metalMat);
    handle.castShadow = true;
    this.canGroup.add(handle);

    this.canGroup.position.copy(this.HOME_POS);
    this.canGroup.visible = false;
    this.scene.add(this.canGroup);
  }

  _createMistSystem() {
    const mistPositions = new Float32Array(this.maxMistPoints * 3);
    this.mistGeometry = new THREE.BufferGeometry();
    this.mistGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(mistPositions, 3),
    );

    // Procedural soft-glow droplet canvas map creation
    const canvas = document.createElement("canvas");
    canvas.width = 16;
    canvas.height = 16;
    const ctx = canvas.getContext("2d");
    const grad = ctx.createRadialGradient(8, 8, 0, 8, 8, 8);
    grad.addColorStop(0, "rgba(145,230,255,0.9)"); // Restored blue
    grad.addColorStop(1, "rgba(145,230,255,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 16, 16);
    const mistTexture = new THREE.CanvasTexture(canvas);

    this.mistMaterial = new THREE.PointsMaterial({
      size: 0.08, // Increased from 0.045
      map: mistTexture,
      transparent: true,
      opacity: 0.9, // Increased from 0.65
      blending: THREE.NormalBlending, // Changed from Additive to be more visible on light backgrounds
      depthWrite: false,
    });

    this.mistParticleSystem = new THREE.Points(
      this.mistGeometry,
      this.mistMaterial,
    );
    this.mistParticleSystem.frustumCulled = false; // Disable culling to prevent invisibility at close zooms
    this.scene.add(this.mistParticleSystem);
  }

  _emitParticles() {
    const posAttr = this.mistParticleSystem.geometry.attributes.position;
    this.canGroup.updateMatrixWorld(); // Ensure world position is accurate for the current frame
    this.spoutTipAnchor.getWorldPosition(this.globalTipWorldPos);

    // Get the direction the spout is pointing in world space
    // The spout points along local X in our setup
    const spoutDir = new THREE.Vector3(1, 0, 0).applyQuaternion(this.canGroup.quaternion);

    for (let k = 0; k < 5; k++) {
      let slot = -1;
      for (let i = 0; i < this.maxMistPoints; i++) {
        if (!this.mistData[i] || !this.mistData[i].active) {
          slot = i;
          break;
        }
      }
      if (slot === -1) break;

      posAttr.setXYZ(
        slot,
        this.globalTipWorldPos.x,
        this.globalTipWorldPos.y,
        this.globalTipWorldPos.z,
      );

      const speed = 1.4 + Math.random() * 0.9;
      this.mistData[slot] = {
        active: true,
        vx: spoutDir.x * speed,
        vy: spoutDir.y * speed - 0.8 - Math.random() * 0.8,
        vz: spoutDir.z * speed + (Math.random() - 0.5) * 0.8,
      };
    }
    posAttr.needsUpdate = true;
  }

  _updateCanTimeline(dt, currentMoundHeight) {
    if (!this.isActive) return;
    this.animationTime += dt;

    // Dynamically update hover elevation target matrix parameters
    this.HOVER_POS.y = currentMoundHeight + 1.2;

    if (this.animationTime < 1.4) {
      // Phase 1: Sweep up from screen foreground frame margins
      const t = this.animationTime / 1.4;
      const easeOutSky = 1 - (1 - t) * (1 - t);
      this.canGroup.position.lerpVectors(
        this.HOME_POS,
        this.HOVER_POS,
        easeOutSky,
      );
      this.canGroup.rotation.set(0, THREE.MathUtils.lerp(0, this.CAN_Y_ROT, easeOutSky), 0);
    } else if (this.animationTime >= 1.4 && this.animationTime < 4.2) {
      // Phase 2: Action lock window. Tilt and release GPU mist
      const tiltProgress = Math.min((this.animationTime - 1.4) / 0.4, 1.0);
      this.canGroup.rotation.y = this.CAN_Y_ROT;
      this.canGroup.rotation.z = THREE.MathUtils.lerp(
        0,
        -Math.PI / 5.2,
        tiltProgress,
      );

      this._emitParticles();
    } else if (this.animationTime >= 4.2 && this.animationTime < 5.6) {
      // Phase 3: Straighten up and fall out of rendering space bounds
      const t = (this.animationTime - 4.2) / 1.4;
      this.canGroup.rotation.y = THREE.MathUtils.lerp(this.CAN_Y_ROT, 0, t);
      this.canGroup.rotation.z = THREE.MathUtils.lerp(
        -Math.PI / 5.2,
        0,
        Math.min(t * 2, 1.0),
      );
      this.canGroup.position.lerpVectors(this.HOVER_POS, this.HOME_POS, t);
    } else {
      // Reset State Machine Properties
      this.isActive = false;
      this.canGroup.visible = false;
      this.animationTime = 0;
      this.canGroup.position.copy(this.HOME_POS);
    }
  }

  _updateMistPhysics(dt) {
    const posAttr = this.mistParticleSystem.geometry.attributes.position;
    for (let i = 0; i < this.maxMistPoints; i++) {
      if (this.mistData[i] && this.mistData[i].active) {
        let x = posAttr.getX(i);
        let y = posAttr.getY(i);
        let z = posAttr.getZ(i);

        this.mistData[i].vy -= 9.81 * dt; // Apply environmental physics

        x += this.mistData[i].vx * dt;
        y += this.mistData[i].vy * dt;
        z += this.mistData[i].vz * dt;

        const currentRad = Math.sqrt(x * x + z * z);
        const surfaceY = this.getSurfaceHeight(currentRad, x, z);

        if (y <= surfaceY) {
          this.mistData[i].active = false;
          posAttr.setXYZ(i, 0, -999, 0); // Clear slot from scene viewpoint boundaries
        } else {
          posAttr.setXYZ(i, x, y, z);
        }
      }
    }
    posAttr.needsUpdate = true;
  }
}
