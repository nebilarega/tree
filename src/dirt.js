import * as THREE from "three";

export class DirtSystem {
  constructor(scene) {
    this.scene = scene;
    this.config = {
      particleAmount: 5,
      baseSize: 0.12,
      sizeVariety: 0.6,
      rollingSpeed: 2.0,
      moundRadius: 2.8,
      moundHeight: 1.2,
      roughnessNoise: 0.12,
      // --- new: purely visual, doesn't affect particle behavior ---
      decorativeRockCount: 18,
      grassBladeCount: 10000,
      flowerCount: 14,
    };

    // Shared uniform object — mutated once per frame in update(), read by
    // the GPU for every blade at once. No per-instance JS work at runtime.
    this.grassUniforms = { uTime: { value: 0 } };

    this.dirtMaterial = new THREE.MeshStandardMaterial({
      color: 0x4d3a26, // Dark bark-brown soil
      roughness: 0.8,
      flatShading: true,
      envMapIntensity: 1.2,
    });

    // Vertex-colored so the mound reads as painted, not flat-shaded
    this.moundMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      vertexColors: true,
      roughness: 0.85,
      flatShading: false,
      envMapIntensity: 1.0,
    });

    this.rockMaterial = new THREE.MeshStandardMaterial({
      color: 0x9a9088,
      roughness: 0.9,
      flatShading: true,
    });

    this.grassTuftMaterial = new THREE.MeshStandardMaterial({
      color: 0x8fae5a,
      roughness: 0.75,
      flatShading: false,
      side: THREE.DoubleSide,
      vertexColors: true,
    });
    // Inject wind sway into the vertex shader. This runs on the GPU for
    // every blade every frame — the only CPU cost is the single uTime
    // uniform write in update(), regardless of blade count.
    this.grassTuftMaterial.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.grassUniforms.uTime;
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          "#include <common>\nuniform float uTime;\nattribute float aBend;",
        )
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
          float phase = dot(instanceMatrix[3].xyz, vec3(12.9898, 78.233, 37.719));
          float sway = sin(uTime * 1.6 + phase) * 0.05 + sin(uTime * 0.7 + phase * 1.3) * 0.03;
          transformed.x += sway * aBend;
          transformed.z += sway * 0.5 * aBend;`,
        );
    };

    this.flowerMaterial = new THREE.MeshStandardMaterial({
      color: 0xc9a6e0,
      roughness: 0.6,
      emissive: 0x2a1a33,
      emissiveIntensity: 0.15,
    });

    this.particles = [];
    this.rockGeometries = [
      new THREE.DodecahedronGeometry(1, 0),
      new THREE.IcosahedronGeometry(1, 0),
    ];

    // Palette used for vertex-color blending on the mound surface
    this.palette = {
      grassLight: new THREE.Color(0x9fc36a),
      grassDark: new THREE.Color(0x4f6e34),
      moss: new THREE.Color(0x5c7a3f),
      dirt: new THREE.Color(0x4d3a26),
      rock: new THREE.Color(0x746358),
    };

    this.initMound();
    this.initContactShadow();
    this.initDecorations();
  }

  // Cheap multi-octave pseudo-noise (no external deps). Called only at
  // mesh-build time, never per-frame, so extra octaves are free at runtime.
  _fbm(x, z, octaves = 3) {
    let value = 0;
    let amp = 1;
    let freq = 1;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      value += amp * (Math.sin(x * freq * 2.3) * Math.cos(z * freq * 2.1));
      norm += amp;
      amp *= 0.5;
      freq *= 2.15;
    }
    return value / norm;
  }

  calculateSurfaceHeight(radius, x, z) {
    if (radius >= this.config.moundRadius) return 0;

    const baseHeight =
      Math.cos((radius / this.config.moundRadius) * (Math.PI / 2)) *
      this.config.moundHeight;

    const macroNoise =
      this._fbm(x * 1.0, z * 1.0, 3) * this.config.roughnessNoise;
    const microNoise =
      Math.sin(x * 6.0 + z * 3.0) * (this.config.roughnessNoise * 0.15);

    return Math.max(0, baseHeight + macroNoise + microNoise);
  }

  // New: per-vertex color for the mound — bright grass on top, mossy
  // shadow in the mid-slope, blending to dirt/rock near the base edge.
  _surfaceColor(radius, height, x, z, target) {
    const edgeT = THREE.MathUtils.clamp(radius / this.config.moundRadius, 0, 1);
    const heightT = THREE.MathUtils.clamp(
      height / this.config.moundHeight,
      0,
      1,
    );
    const patchNoise = this._fbm(x * 1.7, z * 1.7, 2); // -1..1

    // Grass gets lighter toward the crown, darker/mossier in dips
    target
      .copy(this.palette.grassDark)
      .lerp(
        this.palette.grassLight,
        THREE.MathUtils.clamp(heightT + patchNoise * 0.25, 0, 1),
      );
    // subtle moss patches independent of height
    if (patchNoise < -0.35) {
      target.lerp(this.palette.moss, 0.4);
    }
    // transition to soil near the outer rim, like ground peeking
    // out from under the grass at the base of the tree
    const rimBlend = THREE.MathUtils.smoothstep(edgeT, 0.72, 0.98);
    target.lerp(this.palette.dirt, rimBlend);

    // fake ambient occlusion: darken the very outer/underside band so it
    // reads as receding into shadow instead of a flat lit wall
    const aoDarken = THREE.MathUtils.smoothstep(edgeT, 0.88, 1.0);
    target.multiplyScalar(1 - aoDarken * 0.45);

    return target;
  }

  // Single blade: a tapered, gently curved plane. Cheap geometry (a
  // handful of vertices) — the per-instance cost is just a matrix, so a
  // few hundred of these via InstancedMesh is effectively free.
  _createBladeGeometry(height = 0.16, width = 0.02, heightSegments = 4) {
    const geo = new THREE.PlaneGeometry(width, height, 1, heightSegments);
    geo.translate(0, height / 2, 0); // pin base at local y = 0

    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const bend = new Float32Array(pos.count);

    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const t = THREE.MathUtils.clamp(y / height, 0, 1); // 0 base, 1 tip

      // taper narrower toward the tip
      pos.setX(i, pos.getX(i) * (1 - t * 0.85));
      // slight forward curve at rest, like a real blade leaning
      pos.setZ(i, t * t * height * 0.12);

      // uniform brighten toward the tip — same value on all 3 channels
      // so it tints intensity only, not hue
      const shade = THREE.MathUtils.lerp(0.55, 1.15, t);
      colors[i * 3] = shade;
      colors[i * 3 + 1] = shade;
      colors[i * 3 + 2] = shade;

      // separate channel purely for the wind shader's bend weight
      bend[i] = t;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.setAttribute("aBend", new THREE.BufferAttribute(bend, 1));
    geo.computeVertexNormals();
    return geo;
  }

  // Soft radial-gradient texture for the contact shadow beneath the
  // mound — built once, applied to a single static transparent plane.
  _createRadialShadowTexture(size = 256) {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    const grad = ctx.createRadialGradient(
      size / 2,
      size / 2,
      0,
      size / 2,
      size / 2,
      size / 2,
    );
    grad.addColorStop(0, "rgba(0,0,0,0.5)");
    grad.addColorStop(0.55, "rgba(0,0,0,0.22)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }

  // One extra static draw call — this is what actually grounds the mound
  // against the page background instead of it reading as floating.
  initContactShadow() {
    const tex = this._createRadialShadowTexture();
    const geo = new THREE.CircleGeometry(this.config.moundRadius * 1.3, 32);
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });
    this.contactShadow = new THREE.Mesh(geo, mat);
    this.contactShadow.rotation.x = -Math.PI / 2;
    this.contactShadow.position.y = -7.6 - 0.06;
    this.contactShadow.renderOrder = -1;
    this.scene.add(this.contactShadow);
  }

  initMound() {
    const segs = 64; // one-time cost only, smoother silhouette for vertex colors
    const geo = new THREE.SphereGeometry(this.config.moundRadius, segs, segs);
    geo.scale(1, this.config.moundHeight / this.config.moundRadius, 1);

    const posAttr = geo.attributes.position;
    const vertex = new THREE.Vector3();
    const colors = new Float32Array(posAttr.count * 3);
    const tmpColor = new THREE.Color();

    for (let i = 0; i < posAttr.count; i++) {
      vertex.fromBufferAttribute(posAttr, i);
      let radius, height;

      if (vertex.y <= 0) {
        // Lower-hemisphere point of the source sphere. Instead of a hard
        // flat clamp (which left a near-vertical wall at ~full radius —
        // the "coin edge" look), taper it: shrink radius and ease the
        // depth in as it curves under, so it reads as a rounded lip.
        const bevelDepth = 0.14;
        const flatDepth = 0.05;
        const rawRadius = Math.sqrt(vertex.x * vertex.x + vertex.z * vertex.z);
        const t = THREE.MathUtils.smoothstep(-vertex.y, 0, bevelDepth);
        const shrink = 1 - t * 0.22;

        vertex.x *= shrink;
        vertex.z *= shrink;
        vertex.y = -flatDepth * t;

        radius = rawRadius * shrink;
        height = 0;
      } else {
        radius = Math.sqrt(vertex.x * vertex.x + vertex.z * vertex.z);
        height = this.calculateSurfaceHeight(radius, vertex.x, vertex.z);
        vertex.y = height;
      }

      posAttr.setXYZ(i, vertex.x, vertex.y, vertex.z);

      this._surfaceColor(radius, height, vertex.x, vertex.z, tmpColor);
      colors[i * 3] = tmpColor.r;
      colors[i * 3 + 1] = tmpColor.g;
      colors[i * 3 + 2] = tmpColor.b;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    this.mound = new THREE.Mesh(geo, this.moundMaterial);
    this.mound.position.y = -7.6;
    this.mound.castShadow = true;
    this.mound.receiveShadow = true;
    this.scene.add(this.mound);
  }

  // Static decorative detail: rocks, grass tufts, and flowers scattered
  // over the mound. All three are InstancedMesh, so no matter the count
  // each is exactly one draw call — negligible runtime cost, generated once.
  initDecorations() {
    this._scatterInstances({
      geometry: this.rockGeometries[0],
      material: this.rockMaterial,
      count: this.config.decorativeRockCount,
      radiusRange: [
        this.config.moundRadius * 0.55,
        this.config.moundRadius * 1.05,
      ],
      scaleRange: [0.06, 0.16],
      sinkInto: 0.4,
      randomRotation: true,
    });

    const bladeGeo = this._createBladeGeometry();
    this._scatterInstances({
      geometry: bladeGeo,
      material: this.grassTuftMaterial,
      count: this.config.grassBladeCount,
      radiusRange: [0, this.config.moundRadius * 0.85],
      scaleRange: [0.7, 1.4],
      sinkInto: 0,
      randomRotation: true,
      uprightOnly: true,
    });

    const flowerGeo = new THREE.SphereGeometry(0.045, 6, 6);
    this._scatterInstances({
      geometry: flowerGeo,
      material: this.flowerMaterial,
      count: this.config.flowerCount,
      radiusRange: [0.2, this.config.moundRadius * 0.9],
      scaleRange: [0.8, 1.2],
      sinkInto: -0.02,
      randomRotation: false,
      uprightOnly: true,
    });
  }

  _scatterInstances({
    geometry,
    material,
    count,
    radiusRange,
    scaleRange,
    sinkInto,
    randomRotation,
    uprightOnly,
    radiusPower = 1,
    followSlope = false,
  }) {
    if (count <= 0) return;
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    const dummy = new THREE.Object3D();
    const up = new THREE.Vector3(0, 1, 0);
    const normal = new THREE.Vector3();
    const eps = 0.05;

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      // radiusPower > 1 biases samples toward the center, so density
      // thins out patchily toward the outer range instead of a hard cutoff
      const radius =
        radiusRange[0] +
        Math.pow(Math.random(), radiusPower) *
          (radiusRange[1] - radiusRange[0]);
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const surfaceY = this.calculateSurfaceHeight(radius, x, z);

      dummy.position.set(x, -7.6 + surfaceY - sinkInto, z);

      const scale =
        scaleRange[0] + Math.random() * (scaleRange[1] - scaleRange[0]);
      dummy.scale.set(scale, scale, scale);

      if (followSlope) {
        // Approximate the surface normal via finite differences (done
        // once here, at init — no runtime cost) so blades on the sloped
        // rim lean with the ground instead of standing straight up.
        const hL = this.calculateSurfaceHeight(radius, x - eps, z);
        const hR = this.calculateSurfaceHeight(radius, x + eps, z);
        const hD = this.calculateSurfaceHeight(radius, x, z - eps);
        const hU = this.calculateSurfaceHeight(radius, x, z + eps);
        normal.set(hL - hR, 2 * eps, hD - hU).normalize();
        dummy.quaternion.setFromUnitVectors(up, normal);
        dummy.quaternion.multiply(
          new THREE.Quaternion().setFromAxisAngle(
            up,
            Math.random() * Math.PI * 2,
          ),
        );
      } else if (uprightOnly) {
        dummy.rotation.set(0, Math.random() * Math.PI * 2, 0);
      } else if (randomRotation) {
        dummy.rotation.set(
          Math.random() * Math.PI,
          Math.random() * Math.PI,
          Math.random() * Math.PI,
        );
      }

      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    this.scene.add(mesh);
  }

  spawn(growthFactor = 0) {
    const growthSizeScale = 0.4 + growthFactor * 0.8;
    const growthSpeedScale = 0.5 + growthFactor * 0.5;

    const geo =
      this.rockGeometries[
        Math.floor(Math.random() * this.rockGeometries.length)
      ];
    const pMesh = new THREE.Mesh(geo, this.dirtMaterial);
    pMesh.castShadow = true;
    this.scene.add(pMesh);

    const randomAngle = Math.random() * Math.PI * 2;
    const randomStartRadius =
      0.02 + Math.random() * (this.config.moundRadius * 0.1);

    const randomizedSpeed =
      this.config.rollingSpeed *
      growthSpeedScale *
      (0.85 + Math.random() * 0.3);

    const maxDistance = this.config.moundRadius + 0.2 + Math.random() * 0.5;

    const halfVariety = this.config.sizeVariety / 2;
    const scaleModifier =
      1 - halfVariety + Math.random() * this.config.sizeVariety;
    const finalScale = this.config.baseSize * growthSizeScale * scaleModifier;

    pMesh.scale.set(finalScale, finalScale, finalScale);

    this.particles.push({
      mesh: pMesh,
      angle: randomAngle,
      currentRadius: randomStartRadius,
      maxDistance: maxDistance,
      speed: randomizedSpeed,
      createdAt: performance.now(),
      delay: Math.random() * 200,
      rotSpeedX: (Math.random() - 0.5) * 6,
      rotSpeedZ: (Math.random() - 0.5) * 6,
    });
  }

  update(dt) {
    this.grassUniforms.uTime.value += dt;

    const now = performance.now();

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];

      if (now - p.createdAt < p.delay) {
        p.mesh.visible = false;
        continue;
      }
      p.mesh.visible = true;

      p.currentRadius += p.speed * dt;

      const currentX = Math.cos(p.angle) * p.currentRadius;
      const currentZ = Math.sin(p.angle) * p.currentRadius;

      const currentY =
        this.calculateSurfaceHeight(p.currentRadius, currentX, currentZ) +
        0.5 * p.mesh.scale.y;

      p.mesh.position.set(currentX, -7.6 + currentY, currentZ);

      p.mesh.rotation.x += p.rotSpeedX * dt;
      p.mesh.rotation.z += p.rotSpeedZ * dt;

      if (p.currentRadius >= p.maxDistance) {
        this.scene.remove(p.mesh);
        this.particles.splice(i, 1);
      }
    }
  }
}
