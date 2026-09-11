import * as THREE from "three";
import * as BufferGeometryUtils from "three/addons/utils/BufferGeometryUtils.js";

export class DirtSystem {
  constructor(scene) {
    this.scene = scene;
    const isMobile =
      typeof navigator !== "undefined" &&
      (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent,
      ) || window.innerWidth < 768);

    this.config = {
      particleAmount: 5,
      baseSize: 0.12,
      sizeVariety: 0.6,
      rollingSpeed: 2.2,
      moundRadius: 2.85,
      moundHeight: 1.15,
      roughnessNoise: 0.12,
      decorativeRockCount: 12,
      grassBladeCount: isMobile ? 12000 : 26000,
      flowerCount: 70,
    };

    // Shared uniform for GPU wind sway across all grass blades and foliage
    this.grassUniforms = { uTime: { value: 0 } };

    // Floating island root — centered under the hero camera look-at
    this.islandBaseY = -7.85;
    this.buoyancyOffset = 0;
    this.islandGroup = new THREE.Group();
    this.islandGroup.position.y = this.islandBaseY;
    this.scene.add(this.islandGroup);

    // Rich color palette matching sample_mound.png (deep greens and warm sedimentary stone)
    this.palette = {
      grassLight: new THREE.Color(0x8ecc30),   // Warm sunlit lime crests
      grassMid: new THREE.Color(0x569620),     // Rich vibrant spring green
      grassDark: new THREE.Color(0x2e5214),    // Shaded moss hollows
      turfEdge: new THREE.Color(0x42581e),     // Overhanging turf lip
      stoneLight: new THREE.Color(0x85766e),   // Warm sunlit stone shelf
      stoneMid: new THREE.Color(0x61524b),     // Sedimentary stone grey
      stoneDark: new THREE.Color(0x3e322d),    // Deep rock fissures
      stoneUnder: new THREE.Color(0x221a18),   // Deep underside ambient occlusion
      mossPatch: new THREE.Color(0x4a7322),    // Rock moss cling
      dirtSoil: new THREE.Color(0x3d2c1f),     // Earth under turf
      vineStem: new THREE.Color(0x42681d),     // Dangling vine stem
      flowerWhite: new THREE.Color(0xfcfcff),  // White daisy petals
      flowerYellow: new THREE.Color(0xffd54f), // Daisy center
      flowerLilac: new THREE.Color(0xd3b8f5),  // Soft lilac flower
    };

    // Materials
    this.dirtMaterial = new THREE.MeshStandardMaterial({
      color: 0x4a3726,
      roughness: 0.85,
      flatShading: true,
      envMapIntensity: 1.0,
    });

    // Unified island landmass material (opaque solid PBR with rich vertex colors)
    this.islandMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      vertexColors: true,
      roughness: 0.82,
      metalness: 0.03,
      flatShading: false,
      side: THREE.DoubleSide,
      depthTest: true,
      depthWrite: true,
      envMapIntensity: 1.1,
    });

    // Protruding faceted rock slabs & crags material
    this.rockMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      vertexColors: true,
      roughness: 0.9,
      metalness: 0.05,
      flatShading: true,
      side: THREE.DoubleSide,
      depthTest: true,
      depthWrite: true,
      envMapIntensity: 0.85,
    });

    // Grass blades material with GPU wind sway
    this.grassTuftMaterial = new THREE.MeshStandardMaterial({
      roughness: 0.65,
      metalness: 0.0,
      flatShading: false,
      side: THREE.DoubleSide,
      vertexColors: true,
      envMapIntensity: 1.1,
    });

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
          float sway = sin(uTime * 2.0 + phase) * 0.055 + sin(uTime * 0.9 + phase * 1.4) * 0.03;
          transformed.x += sway * aBend;
          transformed.z += sway * 0.55 * aBend;`,
        );
    };

    this.particles = [];
    this.floatingRocks = [];
    this.rockGeometries = [
      new THREE.DodecahedronGeometry(1, 0),
      new THREE.IcosahedronGeometry(1, 0),
    ];

    // Build the complete floating island
    this.initIsland();
    this.initRockLedgesAndCrags();
    this.initVinesAndRoots();
    this.initFloatingRocks();
    this.initDecorations();
    this.initLightRibbon();

    // Aliases for compatibility
    this.mound = this.islandMesh;
    this.meadowMesh = this.islandMesh;
  }

  // Multi-octave 3D pseudo-noise for organic terrain and rock displacement
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

  // Organic, non-circular perimeter radius: natural rock promontories and bays
  _getRimRadius(angle) {
    const baseR = this.config.moundRadius;
    const r1 = Math.sin(angle * 3.0) * 0.12;
    const r2 = Math.cos(angle * 5.0) * 0.08;
    const r3 = Math.sin(angle * 8.0 + 1.2) * 0.04;
    return baseR + r1 + r2 + r3;
  }

  // Dynamic surface height above island origin (used by tree trunk base, watering can, dirt particles)
  calculateSurfaceHeight(radius, x, z) {
    const angle = Math.atan2(z, x);
    const rRim = this._getRimRadius(angle);
    if (radius >= rRim) {
      return 0.0;
    }

    const normR = radius / rRim;
    // Smooth gentle dome plateau: flat crest near tree, soft rounding toward rim
    const profile = Math.cos(normR * (Math.PI / 2));
    const baseHeight = this.config.moundHeight * Math.pow(profile, 1.32);

    const macroNoise =
      this._fbm(x * 0.8, z * 0.8, 3) * this.config.roughnessNoise;
    const microNoise =
      Math.sin(x * 4.5 + z * 2.5) * (this.config.roughnessNoise * 0.16);

    return Math.max(0.0, baseHeight + macroNoise + microNoise);
  }

  // Unified, seamless, watertight floating island landmass
  initIsland() {
    const geo = this._createUnifiedIslandGeometry();
    this.islandMesh = new THREE.Mesh(geo, this.islandMaterial);
    this.islandMesh.castShadow = true;
    this.islandMesh.receiveShadow = true;
    this.islandGroup.add(this.islandMesh);
  }

  _createUnifiedIslandGeometry() {
    const radialSegs = 64;
    const meadowRings = 20;
    const cliffRings = 8;
    const keelRings = 12;
    const totalRings = meadowRings + cliffRings + keelRings; // 40 rings total

    const vertices = [];
    const colors = [];
    const uvs = [];
    const indices = [];

    const tmpColor = new THREE.Color();

    // 1. Center top vertex (index 0)
    const centerH = this.calculateSurfaceHeight(0, 0, 0);
    vertices.push(0, centerH, 0);
    tmpColor.copy(this.palette.grassMid).lerp(this.palette.grassLight, 0.5);
    colors.push(tmpColor.r, tmpColor.g, tmpColor.b);
    uvs.push(0.5, 0.5);

    // 2. Continuous rings from top center, down the cliff, to the keel tip
    for (let r = 1; r <= totalRings; r++) {
      for (let s = 0; s < radialSegs; s++) {
        const angle = (s / radialSegs) * Math.PI * 2;
        const rRim = this._getRimRadius(angle);
        let x, y, z, ringRadius;

        if (r <= meadowRings) {
          // --- ZONE 1: MEADOW PLATEAU (r: 1 -> 20) ---
          const u = r / meadowRings;
          ringRadius = rRim * Math.pow(u, 0.94);
          x = Math.cos(angle) * ringRadius;
          z = Math.sin(angle) * ringRadius;
          y = this.calculateSurfaceHeight(ringRadius, x, z);

          // Meadow vertex colors: rich lush greens with golden crests & moss hollows
          const hT = THREE.MathUtils.clamp(y / this.config.moundHeight, 0, 1);
          const patchNoise = this._fbm(x * 1.5, z * 1.5, 2);
          tmpColor
            .copy(this.palette.grassMid)
            .lerp(this.palette.grassLight, hT * 0.75 + patchNoise * 0.25);
          if (patchNoise < -0.22) {
            tmpColor.lerp(this.palette.grassDark, 0.45);
          }
          if (u > 0.88) {
            // Organic transition to turf edge & soil lip
            const edgeT = (u - 0.88) / 0.12;
            tmpColor.lerp(this.palette.turfEdge, edgeT * 0.7);
            if (u > 0.96) {
              tmpColor.lerp(this.palette.dirtSoil, 0.5);
            }
          }
        } else if (r <= meadowRings + cliffRings) {
          // --- ZONE 2: ROCK CLIFF RIM (r: 21 -> 28) ---
          const v = (r - meadowRings) / cliffRings; // 0 to 1
          const cliffDepth = 0.45;
          y = -v * cliffDepth;

          // Rugged horizontal sedimentary strata and stepped ledges
          const strata =
            Math.sin(v * Math.PI * 2.0) * 0.05 +
            Math.sin(y * 14.0 + angle * 3.0) * 0.04;
          ringRadius = rRim * (1.0 + strata);
          x = Math.cos(angle) * ringRadius;
          z = Math.sin(angle) * ringRadius;

          // Cliff vertex colors: stratified stone + moss clings
          const rockNoise = this._fbm(x * 1.6, z * 1.6, 2);
          tmpColor.copy(this.palette.stoneMid);
          if (v < 0.25 && rockNoise > 0.0) {
            tmpColor.lerp(this.palette.mossPatch, 0.6);
          } else {
            tmpColor.lerp(
              this.palette.stoneDark,
              (Math.sin(y * 16.0) + 1.0) * 0.3,
            );
          }
        } else {
          // --- ZONE 3: INVERTED STALACTITE KEEL (r: 29 -> 40) ---
          const w = (r - (meadowRings + cliffRings)) / keelRings; // 0 to 1
          const keelDepth = 1.82;
          y = -0.45 - w * (keelDepth - 0.45);

          // Conical taper down to craggy rock tip
          const taper = Math.pow(1.0 - w, 0.72);
          const cragNoise =
            this._fbm(
              Math.cos(angle) * 1.5,
              Math.sin(angle) * 1.5 + y * 0.7,
              3,
            ) *
            0.22 *
            taper;
          ringRadius = Math.max(0.06, rRim * taper + cragNoise);

          // Asymmetric rock keel tip offset
          const tipOffsetX = w * 0.12;
          const tipOffsetZ = -w * 0.08;
          x = Math.cos(angle) * ringRadius + tipOffsetX;
          z = Math.sin(angle) * ringRadius + tipOffsetZ;

          // Keel vertex colors: weathered stone grading into dark underside ambient occlusion
          tmpColor.copy(this.palette.stoneMid).lerp(this.palette.stoneDark, w * 0.7);
          if (w > 0.45) {
            const aoDarken = (w - 0.45) / 0.55;
            tmpColor.lerp(this.palette.stoneUnder, aoDarken * 0.85);
          }
        }

        vertices.push(x, y, z);
        colors.push(tmpColor.r, tmpColor.g, tmpColor.b);
        uvs.push(0.5 + x / (rRim * 2.2), 0.5 + z / (rRim * 2.2));

        // Generate triangles
        if (r === 1) {
          const curr = 1 + s;
          const next = 1 + ((s + 1) % radialSegs);
          indices.push(0, next, curr);
        } else {
          const prevRing = 1 + (r - 2) * radialSegs;
          const currRing = 1 + (r - 1) * radialSegs;
          const nextS = (s + 1) % radialSegs;

          const p1 = prevRing + s;
          const p2 = prevRing + nextS;
          const c1 = currRing + s;
          const c2 = currRing + nextS;

          indices.push(p1, p2, c1);
          indices.push(p2, c2, c1);
        }
      }
    }

    // 3. Bottom keel tip point (converging vertex)
    const tipIndex = vertices.length / 3;
    vertices.push(0.12, -1.82, -0.08);
    tmpColor.copy(this.palette.stoneUnder);
    colors.push(tmpColor.r, tmpColor.g, tmpColor.b);
    uvs.push(0.5, 0.5);

    const lastRingStart = 1 + (totalRings - 1) * radialSegs;
    for (let s = 0; s < radialSegs; s++) {
      const curr = lastRingStart + s;
      const next = lastRingStart + ((s + 1) % radialSegs);
      indices.push(curr, tipIndex, next);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }

  // The iconic right-side rock crag, embedded boulders, and protruding rock slabs along the rim
  initRockLedgesAndCrags() {
    const cragGroup = new THREE.Group();

    // 1. Prominent Jagged Rock Crag (matching sample_mound.png on the right side)
    const cragGeo = this._createFacetedCragGeometry(0.5, 0.95, 0.4);
    const cragMesh = new THREE.Mesh(cragGeo, this.rockMaterial);
    const cragX = 1.35;
    const cragZ = -0.32;
    const cragY = this.calculateSurfaceHeight(
      Math.hypot(cragX, cragZ),
      cragX,
      cragZ,
    );
    cragMesh.position.set(cragX, cragY - 0.1, cragZ);
    cragMesh.rotation.set(0.12, -0.45, -0.15);
    cragMesh.castShadow = true;
    cragMesh.receiveShadow = true;
    cragGroup.add(cragMesh);

    // 2. Embedded Mossy Boulders (natural weathered stones nestled into turf)
    const boulderConfigs = [
      // Medium front-facing mossy boulder
      { x: -0.42, z: 1.15, scale: [0.32, 0.22, 0.28], rot: [0.3, 1.1, 0.1] },
      // Secondary mid-ground stone
      { x: 1.05, z: 0.82, scale: [0.24, 0.18, 0.22], rot: [0.5, -0.8, 0.2] },
      // Small root stone
      { x: -0.28, z: -0.45, scale: [0.18, 0.14, 0.16], rot: [0.4, 2.1, 0.1] },
    ];

    boulderConfigs.forEach((cfg) => {
      const dist = Math.hypot(cfg.x, cfg.z);
      const y = this.calculateSurfaceHeight(dist, cfg.x, cfg.z);
      const bGeo = this._createMossyBoulderGeometry(cfg.scale);
      const bMesh = new THREE.Mesh(bGeo, this.rockMaterial);
      bMesh.position.set(cfg.x, y - cfg.scale[1] * 0.42, cfg.z);
      bMesh.rotation.set(cfg.rot[0], cfg.rot[1], cfg.rot[2]);
      bMesh.castShadow = true;
      bMesh.receiveShadow = true;
      cragGroup.add(bMesh);
    });

    // 3. Protruding Horizontal Rock Slabs along the Rim Cliff (matching sample_mound.png)
    const slabCount = 8;
    for (let i = 0; i < slabCount; i++) {
      const angle = (i / slabCount) * Math.PI * 2 + 0.15;
      const rRim = this._getRimRadius(angle);
      const sx = Math.cos(angle) * (rRim + 0.04);
      const sz = Math.sin(angle) * (rRim + 0.04);
      const sy = -0.06 - (i % 3) * 0.08;

      const slabGeo = new THREE.DodecahedronGeometry(0.32, 0);
      slabGeo.scale(1.1, 0.35, 0.75);

      const sPos = slabGeo.attributes.position;
      const sCols = new Float32Array(sPos.count * 3);
      for (let j = 0; j < sPos.count; j++) {
        const ny = sPos.getY(j);
        const col = ny > 0 ? this.palette.mossPatch : this.palette.stoneMid;
        sCols[j * 3] = col.r;
        sCols[j * 3 + 1] = col.g;
        sCols[j * 3 + 2] = col.b;
      }
      slabGeo.setAttribute("color", new THREE.BufferAttribute(sCols, 3));
      slabGeo.computeVertexNormals();

      const slabMesh = new THREE.Mesh(slabGeo, this.rockMaterial);
      slabMesh.position.set(sx, sy, sz);
      slabMesh.rotation.set(0.08, angle + Math.PI / 2, (Math.random() - 0.5) * 0.25);
      slabMesh.castShadow = true;
      slabMesh.receiveShadow = true;
      cragGroup.add(slabMesh);
    }

    this.islandGroup.add(cragGroup);
  }

  _createFacetedCragGeometry(width, height, depth) {
    const geo = new THREE.ConeGeometry(width, height, 6, 4);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);

    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i);
      let y = pos.getY(i);
      let z = pos.getZ(i);

      const t = (y + height / 2) / height;
      x += (Math.sin(y * 6.0) * 0.08 + (Math.random() - 0.5) * 0.04) * (1 - t * 0.5);
      z += (Math.cos(x * 5.0) * 0.07 + (Math.random() - 0.5) * 0.04) * (1 - t * 0.5);
      pos.setXYZ(i, x, y + height / 2, z);

      // Crag colors: warm sedimentary stone with moss on upper ledges
      const isTopLedge = t > 0.55 && Math.sin(x * 8.0) > 0.2;
      const strata = (Math.sin(y * 14.0) + 1.0) * 0.5;
      const col = new THREE.Color();
      if (isTopLedge) {
        col.copy(this.palette.mossPatch);
      } else {
        col.copy(this.palette.stoneMid).lerp(this.palette.stoneDark, strata * 0.5);
      }
      colors[i * 3] = col.r;
      colors[i * 3 + 1] = col.g;
      colors[i * 3 + 2] = col.b;
    }

    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    return geo;
  }

  _createMossyBoulderGeometry(scale) {
    const geo = new THREE.DodecahedronGeometry(1, 1);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);

    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i);
      let y = pos.getY(i);
      let z = pos.getZ(i);

      const noise = Math.sin(x * 4.0) * Math.cos(z * 4.0) * 0.14;
      x = (x + noise) * scale[0];
      y = (y + noise * 0.8) * scale[1];
      z = (z + noise) * scale[2];
      pos.setXYZ(i, x, y, z);

      const normY = pos.getY(i) / scale[1];
      const col = new THREE.Color();
      if (normY > 0.62) {
        col.copy(this.palette.mossPatch);
      } else {
        const shadow = THREE.MathUtils.clamp(normY * 0.5 + 0.5, 0, 1);
        col.copy(this.palette.stoneDark).lerp(this.palette.stoneMid, shadow);
      }
      colors[i * 3] = col.r;
      colors[i * 3 + 1] = col.g;
      colors[i * 3 + 2] = col.b;
    }

    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    return geo;
  }

  // Hanging creeping vines draped over the cliff rim & dangling roots underneath
  initVinesAndRoots() {
    const vinesGroup = new THREE.Group();
    const vineMat = new THREE.MeshStandardMaterial({
      color: 0x486e20,
      roughness: 0.75,
      metalness: 0.05,
      side: THREE.DoubleSide,
    });

    const rootMat = new THREE.MeshStandardMaterial({
      color: 0x3d2f24,
      roughness: 0.9,
      metalness: 0.0,
    });

    // 1. Creeping Vines Draping off the Rim (matching sample_mound.png front loops)
    const vinePaths = [
      // Prominent looping front vine
      [
        new THREE.Vector3(0.5, 0.02, 2.75),
        new THREE.Vector3(0.72, -0.22, 2.82),
        new THREE.Vector3(0.98, -0.52, 2.72),
        new THREE.Vector3(1.22, -0.62, 2.55),
        new THREE.Vector3(1.45, -0.38, 2.42),
        new THREE.Vector3(1.6, 0.02, 2.3),
      ],
      // Front-left dangling vine
      [
        new THREE.Vector3(-0.35, 0.04, 2.78),
        new THREE.Vector3(-0.48, -0.28, 2.8),
        new THREE.Vector3(-0.55, -0.65, 2.65),
        new THREE.Vector3(-0.48, -0.92, 2.45),
      ],
      // Front-right trailing tendril
      [
        new THREE.Vector3(1.75, 0.02, 2.15),
        new THREE.Vector3(1.92, -0.32, 2.05),
        new THREE.Vector3(2.05, -0.72, 1.85),
        new THREE.Vector3(2.0, -1.05, 1.7),
      ],
      // Left rim drape
      [
        new THREE.Vector3(-2.1, 0.02, 1.8),
        new THREE.Vector3(-2.3, -0.28, 1.68),
        new THREE.Vector3(-2.42, -0.68, 1.45),
        new THREE.Vector3(-2.35, -1.02, 1.3),
      ],
      // Back rim vines
      [
        new THREE.Vector3(-1.2, 0.02, -2.52),
        new THREE.Vector3(-1.32, -0.38, -2.45),
        new THREE.Vector3(-1.28, -0.82, -2.32),
      ],
      [
        new THREE.Vector3(1.4, 0.02, -2.42),
        new THREE.Vector3(1.52, -0.35, -2.35),
        new THREE.Vector3(1.48, -0.78, -2.22),
      ],
    ];

    vinePaths.forEach((pts) => {
      const curve = new THREE.CatmullRomCurve3(pts);
      const tubeGeo = new THREE.TubeGeometry(curve, 20, 0.022, 6, false);
      const tubeMesh = new THREE.Mesh(tubeGeo, vineMat);
      tubeMesh.castShadow = true;
      vinesGroup.add(tubeMesh);

      // Add small leaf clusters along each vine
      const leafGeo = new THREE.PlaneGeometry(0.07, 0.1);
      leafGeo.translate(0, 0.05, 0);
      const numLeaves = 6;
      for (let i = 1; i < numLeaves; i++) {
        const t = i / numLeaves;
        const pt = curve.getPoint(t);
        const tangent = curve.getTangent(t);
        const lMesh = new THREE.Mesh(leafGeo, vineMat);
        lMesh.position.copy(pt);
        lMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent);
        lMesh.rotateZ((Math.random() - 0.5) * 1.2);
        lMesh.rotateY(Math.random() * Math.PI * 2);
        vinesGroup.add(lMesh);
      }
    });

    // 2. Dangling Roots from the Underbelly Keel
    const rootPaths = [
      [
        new THREE.Vector3(0.2, -1.3, 0.28),
        new THREE.Vector3(0.26, -1.75, 0.2),
        new THREE.Vector3(0.22, -2.15, 0.14),
      ],
      [
        new THREE.Vector3(-0.35, -1.15, -0.14),
        new THREE.Vector3(-0.42, -1.65, -0.2),
        new THREE.Vector3(-0.36, -2.05, -0.16),
      ],
    ];

    rootPaths.forEach((pts) => {
      const curve = new THREE.CatmullRomCurve3(pts);
      const tubeGeo = new THREE.TubeGeometry(curve, 14, 0.015, 5, false);
      const tubeMesh = new THREE.Mesh(tubeGeo, rootMat);
      vinesGroup.add(tubeMesh);
    });

    this.islandGroup.add(vinesGroup);
  }

  // Weightless detached rock fragments hovering around and beneath the island
  initFloatingRocks() {
    const floatGroup = new THREE.Group();
    const rockDefs = [
      // Hanging below the keel tip
      { pos: [0.38, -2.05, 0.38], scale: 0.26, rot: [0.4, 0.6, 0.2] },
      { pos: [-0.62, -2.25, -0.28], scale: 0.2, rot: [0.2, 1.2, -0.5] },
      { pos: [0.82, -2.12, -0.42], scale: 0.17, rot: [0.8, -0.4, 0.3] },
      { pos: [-0.16, -2.42, 0.16], scale: 0.13, rot: [0.1, 0.9, 0.7] },
      // Hovering around the rim perimeter
      { pos: [-3.2, -0.38, 0.62], scale: 0.22, rot: [0.5, 0.3, -0.2] },
      { pos: [-2.8, -0.65, -1.55], scale: 0.24, rot: [-0.3, 0.8, 0.4] },
      { pos: [3.22, -0.25, 0.48], scale: 0.2, rot: [0.6, -0.7, 0.1] },
      { pos: [2.85, -0.55, -1.18], scale: 0.18, rot: [0.2, 1.4, -0.3] },
    ];

    rockDefs.forEach((def, i) => {
      const geo = this.rockGeometries[i % this.rockGeometries.length].clone();
      geo.scale(def.scale, def.scale * (0.85 + (i % 3) * 0.2), def.scale);

      const pos = geo.attributes.position;
      const colors = new Float32Array(pos.count * 3);
      for (let j = 0; j < pos.count; j++) {
        const ny = pos.getY(j);
        const col = ny > 0 ? this.palette.stoneLight : this.palette.stoneDark;
        colors[j * 3] = col.r;
        colors[j * 3 + 1] = col.g;
        colors[j * 3 + 2] = col.b;
      }
      geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      geo.computeVertexNormals();

      const mesh = new THREE.Mesh(geo, this.rockMaterial);
      mesh.position.set(def.pos[0], def.pos[1], def.pos[2]);
      mesh.rotation.set(def.rot[0], def.rot[1], def.rot[2]);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      floatGroup.add(mesh);

      this.floatingRocks.push({
        mesh,
        baseY: def.pos[1],
        bobSpeed: 1.2 + (i % 4) * 0.35,
        bobAmp: 0.035 + (i % 3) * 0.02,
        phase: i * 1.15,
        rotSpeedX: (Math.random() - 0.5) * 0.25,
        rotSpeedY: (Math.random() - 0.5) * 0.35,
      });
    });

    this.islandGroup.add(floatGroup);
  }

  // Lush meadow grass blades & delicate wildflowers (white and lilac)
  initDecorations() {
    // 1. Instanced Grass Blades (fine, velvety high-density blades)
    const bladeGeo = this._createBladeGeometry(0.085, 0.012, 2);
    this._scatterInstances({
      geometry: bladeGeo,
      material: this.grassTuftMaterial,
      count: this.config.grassBladeCount,
      radiusRange: [0.06, this.config.moundRadius * 0.94],
      scaleRange: [0.75, 1.25],
      sinkInto: 0.005,
      randomRotation: true,
      uprightOnly: true,
      radiusPower: 0.82,
    });

    // 2. White Daisy Wildflowers (delicate 5-petaled flowers with gold centers)
    const whiteFlowerGeo = this._createFlowerGeometry(
      this.palette.flowerWhite,
      this.palette.flowerYellow,
    );
    const whiteFlowerMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.55,
      side: THREE.DoubleSide,
    });
    this._scatterInstances({
      geometry: whiteFlowerGeo,
      material: whiteFlowerMat,
      count: 42,
      radiusRange: [0.3, this.config.moundRadius * 0.88],
      scaleRange: [0.65, 1.1],
      sinkInto: -0.015,
      randomRotation: false,
      uprightOnly: true,
      followSlope: true,
    });

    // 3. Soft Lilac / Purple Florets (tying together portfolio aesthetic)
    const lilacFlowerGeo = this._createFlowerGeometry(
      this.palette.flowerLilac,
      this.palette.flowerWhite,
    );
    const lilacFlowerMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.6,
      side: THREE.DoubleSide,
    });
    this._scatterInstances({
      geometry: lilacFlowerGeo,
      material: lilacFlowerMat,
      count: 32,
      radiusRange: [0.25, this.config.moundRadius * 0.84],
      scaleRange: [0.6, 1.0],
      sinkInto: -0.015,
      randomRotation: false,
      uprightOnly: true,
      followSlope: true,
    });
  }

  _createBladeGeometry(height = 0.085, width = 0.012, heightSegments = 2) {
    const geo = new THREE.PlaneGeometry(width, height, 1, heightSegments);
    geo.translate(0, height / 2, 0);

    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const bend = new Float32Array(pos.count);

    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const t = THREE.MathUtils.clamp(y / height, 0, 1);

      pos.setX(i, pos.getX(i) * (1 - t * 0.85));
      pos.setZ(i, t * t * height * 0.16);

      const col = new THREE.Color()
        .copy(this.palette.grassDark)
        .lerp(this.palette.grassLight, Math.pow(t, 0.65));
      colors[i * 3] = col.r;
      colors[i * 3 + 1] = col.g;
      colors[i * 3 + 2] = col.b;

      bend[i] = t;
    }

    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.setAttribute("aBend", new THREE.BufferAttribute(bend, 1));
    geo.computeVertexNormals();
    return geo;
  }

  _createFlowerGeometry(petalColor, centerColor) {
    const geos = [];

    // Center disc
    const centerGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.01, 6);
    const cPos = centerGeo.attributes.position;
    const cCols = new Float32Array(cPos.count * 3);
    for (let i = 0; i < cPos.count; i++) {
      cCols[i * 3] = centerColor.r;
      cCols[i * 3 + 1] = centerColor.g;
      cCols[i * 3 + 2] = centerColor.b;
    }
    centerGeo.setAttribute("color", new THREE.BufferAttribute(cCols, 3));
    geos.push(centerGeo);

    // 5 Petals
    const numPetals = 5;
    const petalBaseGeo = new THREE.PlaneGeometry(0.03, 0.05);
    petalBaseGeo.translate(0, 0.025, 0);

    for (let p = 0; p < numPetals; p++) {
      const angle = (p / numPetals) * Math.PI * 2;
      const pGeo = petalBaseGeo.clone();
      pGeo.rotateX(Math.PI / 2 - 0.15);
      pGeo.rotateY(angle);

      const pos = pGeo.attributes.position;
      const cols = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) {
        cols[i * 3] = petalColor.r;
        cols[i * 3 + 1] = petalColor.g;
        cols[i * 3 + 2] = petalColor.b;
      }
      pGeo.setAttribute("color", new THREE.BufferAttribute(cols, 3));
      geos.push(pGeo);
    }

    petalBaseGeo.dispose();
    const merged = BufferGeometryUtils.mergeGeometries(geos);
    geos.forEach((g) => g.dispose());
    return merged;
  }

  // Delicate ethereal light streak swirling gracefully around the island
  initLightRibbon() {
    const curvePoints = [
      new THREE.Vector3(-1.1, 0.45, 0.85),
      new THREE.Vector3(-2.2, 0.12, 1.75),
      new THREE.Vector3(-0.35, -0.15, 2.85),
      new THREE.Vector3(1.8, 0.08, 2.25),
      new THREE.Vector3(2.85, 0.38, 0.25),
      new THREE.Vector3(2.05, 0.75, -1.6),
      new THREE.Vector3(-0.8, 0.85, -1.75),
      new THREE.Vector3(-1.55, 0.62, -0.35),
    ];

    this.ribbonCurve = new THREE.CatmullRomCurve3(curvePoints, true);

    // Thin core light streak
    const ribbonGeo = new THREE.TubeGeometry(
      this.ribbonCurve,
      128,
      0.007,
      6,
      true,
    );
    this.ribbonMaterial = new THREE.MeshBasicMaterial({
      color: 0xeff6ff,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const ribbonMesh = new THREE.Mesh(ribbonGeo, this.ribbonMaterial);
    this.islandGroup.add(ribbonMesh);

    // Soft outer glow halo
    const glowGeo = new THREE.TubeGeometry(
      this.ribbonCurve,
      128,
      0.022,
      6,
      true,
    );
    this.glowMaterial = new THREE.MeshBasicMaterial({
      color: 0xc7d9fe,
      transparent: true,
      opacity: 0.18,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const glowMesh = new THREE.Mesh(glowGeo, this.glowMaterial);
    this.islandGroup.add(glowMesh);

    // Subtle glowing sparkles traveling along the ribbon
    this.sparkles = [];
    const sparkleGeo = new THREE.SphereGeometry(0.035, 8, 8);
    const sparkleMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    for (let i = 0; i < 4; i++) {
      const sMesh = new THREE.Mesh(sparkleGeo, sparkleMat);
      this.islandGroup.add(sMesh);
      this.sparkles.push({
        mesh: sMesh,
        t: i * 0.25,
        speed: 0.035 + (i % 2) * 0.015,
      });
    }
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
      const radius =
        radiusRange[0] +
        Math.pow(Math.random(), radiusPower) *
          (radiusRange[1] - radiusRange[0]);
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const surfaceY = this.calculateSurfaceHeight(radius, x, z);

      dummy.position.set(x, surfaceY - sinkInto, z);

      const scale =
        scaleRange[0] + Math.random() * (scaleRange[1] - scaleRange[0]);
      dummy.scale.set(scale, scale, scale);

      if (followSlope) {
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
    this.islandGroup.add(mesh);
  }

  // Interactive dirt particle spawning: rolls down the meadow and tumbles off the cliff into the clouds!
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

    const halfVariety = this.config.sizeVariety / 2;
    const scaleModifier =
      1 - halfVariety + Math.random() * this.config.sizeVariety;
    const finalScale = this.config.baseSize * growthSizeScale * scaleModifier;

    pMesh.scale.set(finalScale, finalScale, finalScale);

    this.particles.push({
      mesh: pMesh,
      angle: randomAngle,
      currentRadius: randomStartRadius,
      speed: randomizedSpeed,
      isFalling: false,
      fallVelY: 0,
      createdAt: performance.now(),
      delay: Math.random() * 200,
      rotSpeedX: (Math.random() - 0.5) * 6,
      rotSpeedZ: (Math.random() - 0.5) * 6,
    });
  }

  update(dt) {
    this.grassUniforms.uTime.value += dt;
    const now = performance.now();
    const timeSec = now * 0.001;

    // Island buoyancy — slow, heavy bob so the whole landmass feels afloat
    this.buoyancyOffset =
      Math.sin(timeSec * 0.55) * 0.055 + Math.sin(timeSec * 0.23 + 1.1) * 0.02;
    this.islandGroup.position.y = this.islandBaseY + this.buoyancyOffset;

    // 1. Animate weightless floating satellite rocks
    this.floatingRocks.forEach((rock) => {
      rock.mesh.position.y =
        rock.baseY + Math.sin(timeSec * rock.bobSpeed + rock.phase) * rock.bobAmp;
      rock.mesh.rotation.x += rock.rotSpeedX * dt;
      rock.mesh.rotation.y += rock.rotSpeedY * dt;
    });

    // 2. Animate ethereal light ribbon sparkles & pulse
    if (this.ribbonCurve && this.sparkles) {
      this.sparkles.forEach((s) => {
        s.t = (s.t + s.speed * dt) % 1.0;
        const pt = this.ribbonCurve.getPoint(s.t);
        s.mesh.position.copy(pt);
      });
      if (this.ribbonMaterial) {
        this.ribbonMaterial.opacity = 0.45 + Math.sin(timeSec * 2.5) * 0.15;
      }
      if (this.glowMaterial) {
        this.glowMaterial.opacity = 0.15 + Math.sin(timeSec * 2.5) * 0.06;
      }
    }

    // 3. Dirt particle rolling & cliff fall physics
    const islandBaseY = this.islandGroup.position.y;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];

      if (now - p.createdAt < p.delay) {
        p.mesh.visible = false;
        continue;
      }
      p.mesh.visible = true;

      if (!p.isFalling) {
        p.currentRadius += p.speed * dt;

        const currentX = Math.cos(p.angle) * p.currentRadius;
        const currentZ = Math.sin(p.angle) * p.currentRadius;
        const currentY =
          this.calculateSurfaceHeight(p.currentRadius, currentX, currentZ) +
          0.5 * p.mesh.scale.y;

        p.mesh.position.set(currentX, islandBaseY + currentY, currentZ);

        p.mesh.rotation.x += p.rotSpeedX * dt;
        p.mesh.rotation.z += p.rotSpeedZ * dt;

        // When reaching the cliff rim, tumble off the edge into freefall
        const rRim = this._getRimRadius(p.angle);
        if (p.currentRadius >= rRim) {
          p.isFalling = true;
          p.fallVelY = -0.4;
          p.fallVelX = Math.cos(p.angle) * p.speed * 0.5;
          p.fallVelZ = Math.sin(p.angle) * p.speed * 0.5;
        }
      } else {
        p.fallVelY -= 9.8 * dt;
        p.mesh.position.y += p.fallVelY * dt;
        p.mesh.position.x += p.fallVelX * dt;
        p.mesh.position.z += p.fallVelZ * dt;

        p.mesh.rotation.x += p.rotSpeedX * 1.5 * dt;
        p.mesh.rotation.z += p.rotSpeedZ * 1.5 * dt;

        if (p.mesh.position.y < -13.5) {
          this.scene.remove(p.mesh);
          this.particles.splice(i, 1);
        }
      }
    }
  }
}
