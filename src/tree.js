import * as THREE from "three";
import * as BufferGeometryUtils from "three/addons/utils/BufferGeometryUtils.js";
import { PROJECT_IDS } from "./projects.js";

const leafPalettes = [
  new THREE.Color("#4a8505"), // Vibrant fresh green
  new THREE.Color("#70a904"), // Lighter warm green
  new THREE.Color("#387002"), // Dark leaf green
  new THREE.Color("#9ac20a"), // Lime green accent
  new THREE.Color("#55823b"), // Organic forest green
];

const saplingLeafPalette = [
  new THREE.Color("#2ebd2b"), // Vibrant true green
  new THREE.Color("#22a826"), // Deep rich emerald green
  new THREE.Color("#34c738"), // Bright lush foliage green
  new THREE.Color("#1c9920"), // Rich botanical green
  new THREE.Color("#3fd944"), // Vibrant sunlit green highlight
];

export class Tree {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.renderOrder = 2;
    this.scene.add(this.group);

    this.barkTexture = this._createProceduralBarkTexture();
    this.trunkMaterial = new THREE.MeshStandardMaterial({
      map: this.barkTexture,
      bumpMap: this.barkTexture,
      bumpScale: 0.05,
      roughness: 0.6,
      metalness: 0.0,
      envMapIntensity: 1.6,
      vertexColors: true,
    });

    this.leafMaterial = new THREE.MeshStandardMaterial({
      roughness: 0.45,
      metalness: 0.0,
      side: THREE.DoubleSide,
      shadowSide: THREE.DoubleSide,
      envMapIntensity: 1.35,
    });
    this._initWindShader();

    this.baseCylinderGeo = new THREE.CylinderGeometry(0.55, 1, 1, 5, 1, false);
    this.baseCylinderGeo.translate(0, 0.5, 0);

    this.leafClumpGeometry = this._createLeafClumpGeometry();
    this.singleLeafGeometry = this._createSingleLeafGeometry();

    this.isMobile =
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent,
      ) || window.innerWidth < 768;

    // Cache Fruit Geometries and Materials for performance
    const fruitDetail = this.isMobile ? 8 : 12;
    this.fruitGeo = new THREE.SphereGeometry(0.35, fruitDetail, fruitDetail);
    this.fruitMat = new THREE.MeshStandardMaterial({
      color: "#ff0000",
      roughness: 0.1,
      metalness: 0.2,
      emissive: "#880000",
      envMapIntensity: 2.5,
    });

    this.haloGeo = new THREE.SphereGeometry(0.48, fruitDetail, fruitDetail);
    this.haloMatTemplate = new THREE.ShaderMaterial({
      uniforms: {
        opacity: { value: 0.0 },
        activeInstance: { value: -1.0 },
      },
      vertexShader: `
        varying vec3 vNormal;
        varying float vInstanceId;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vInstanceId = float(gl_InstanceID);
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float opacity;
        uniform float activeInstance;
        varying vec3 vNormal;
        varying float vInstanceId;
        vec3 brightnessToColor(float b){
            b *= 0.25;
            return (vec3(b, b*b, b*b*b*b)/0.25)*0.6;
        }
        void main() {
          vec3 n = normalize(vNormal);
          float fresnel = pow(1.0 - abs(dot(n, vec3(0.0, 0.0, 1.0))), 3.0);
          vec3 col = brightnessToColor(fresnel * 2.0 + 1.2);
          float alpha = (abs(vInstanceId - activeInstance) < 0.1) ? opacity : 0.0;
          gl_FragColor = vec4(col, fresnel * alpha);
        }
      `,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    });

    this.fruitInstancedMesh = null;
    this.haloInstancedMesh = null;
    this.fruitData = []; // Store metadata for raycasting

    this.leafTransforms = [];
    this.leafColors = [];
    this.saplingLeafTransforms = [];
    this.saplingLeafColors = [];
    this.fruitTransforms = [];
    this.branchGeometries = [];
    this.instancedTwigTransforms = [];

    // Shared scratch variables
    this._vertex = new THREE.Vector3();
    this._radialDir = new THREE.Vector3();
    this._centerPoint = new THREE.Vector3();
    this._upRef = new THREE.Vector3(0, 1, 0);
    this._scratchVec1 = new THREE.Vector3();
    this._scratchVec2 = new THREE.Vector3();
    this._scratchQuat = new THREE.Quaternion();
    this._scratchScale = new THREE.Vector3();
  }

  _initWindShader() {
    this.leafMaterial.onBeforeCompile = (shader) => {
      shader.uniforms.time = { value: 0 };
      this.leafMaterial.userData.shader = shader;

      shader.vertexShader =
        `
        uniform float time;
      ` + shader.vertexShader;

      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        `
        #include <begin_vertex>
        
        float localWind = sin(time * 2.0 + position.y * 5.0 + position.x * 2.0) * 0.03;
        float globalWind = sin(time * 0.8) * 0.02;
        
        float swayScale = clamp(length(position) * 1.5, 0.0, 1.0);
        
        transformed.x += (localWind + globalWind) * swayScale;
        transformed.z += (localWind * 0.5 + globalWind) * swayScale;
        transformed.y += sin(time * 3.0 + position.z * 4.0) * 0.01 * swayScale;
        `,
      );
    };
  }

  _createProceduralBarkTexture() {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 512, 512);

    for (let i = 0; i < 800; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      const w = 4 + Math.random() * 12;
      const h = 40 + Math.random() * 120;
      ctx.fillStyle = Math.random() > 0.5 ? "#b0b0b0" : "#e0e0e0";
      ctx.fillRect(x, y, w, h);
      if (x + w > 512) ctx.fillRect(x - 512, y, w, h);
      if (y + h > 512) ctx.fillRect(x, y - 512, w, h);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1, 4);
    return texture;
  }

  _createLeafClumpGeometry() {
    const baseLeafShape = new THREE.Shape();
    baseLeafShape.moveTo(0, 0);
    baseLeafShape.quadraticCurveTo(0.15, 0.15, 0.12, 0.4);
    baseLeafShape.quadraticCurveTo(0.05, 0.7, 0, 0.85);
    baseLeafShape.quadraticCurveTo(-0.05, 0.7, -0.12, 0.4);
    baseLeafShape.quadraticCurveTo(-0.15, 0.15, 0, 0);

    const singleLeafGeo = new THREE.ShapeGeometry(baseLeafShape);
    const posAttr = singleLeafGeo.attributes.position;
    const uvs = new Float32Array(posAttr.count * 2);
    for (let i = 0; i < posAttr.count; i++) {
      uvs[i * 2] = (posAttr.getX(i) + 0.15) / 0.3;
      uvs[i * 2 + 1] = posAttr.getY(i) / 0.85;
    }
    singleLeafGeo.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));

    const leafGeometries = [];
    const numLeavesInClump = 6;
    for (let i = 0; i < numLeavesInClump; i++) {
      const leafCopy = singleLeafGeo.clone();
      const angle = (i / numLeavesInClump) * Math.PI * 2;
      const dummy = new THREE.Object3D();

      dummy.position.set(
        Math.cos(angle) * 0.25,
        (Math.random() - 0.5) * 0.05,
        Math.sin(angle) * 0.25,
      );
      dummy.rotation.set(
        0.2 + Math.random() * 0.2,
        angle,
        0.3 * (Math.random() - 0.5),
      );

      const leafScale = 0.5 + Math.random() * 0.3;
      dummy.scale.set(leafScale * 1.3, leafScale, leafScale);
      dummy.updateMatrix();
      leafCopy.applyMatrix4(dummy.matrix);
      leafGeometries.push(leafCopy);
    }

    const mergedGeometry = BufferGeometryUtils.mergeGeometries(leafGeometries);
    singleLeafGeo.dispose();
    leafGeometries.forEach((geo) => geo.dispose());

    return mergedGeometry;
  }

  _createSingleLeafGeometry() {
    const geom = new THREE.BufferGeometry();

    // Botanical leaf unit:
    // - Slender 3D petiole stalk (Y: 0.0 -> 0.28) that anchors into the branch wood
    // - Folded 3D leaf blade with natural midrib V-crease (Y: 0.28 -> 1.00)
    // 8 radial segments on petiole for smooth circular stalk; 6 longitudinal blade sections.
    const positions = [];
    const uvs = [];
    const indices = [];

    const petioleRings = 3; // ring 0 (y=0), ring 1 (y=0.14), ring 2 (y=0.28)
    const petioleSegs = 8;
    const ringHeights = [0.0, 0.14, 0.28];
    const ringRadii = [0.024, 0.019, 0.014];
    const ringZCtr = [0.0, 0.012, 0.022];

    // Petiole rings (vertices 0 .. 23)
    for (let r = 0; r < petioleRings; r++) {
      const y = ringHeights[r];
      const rad = ringRadii[r];
      const zc = ringZCtr[r];
      for (let s = 0; s < petioleSegs; s++) {
        const theta = (s / petioleSegs) * Math.PI * 2;
        const x = Math.cos(theta) * rad;
        const z = zc + Math.sin(theta) * rad;
        positions.push(x, y, z);
        uvs.push((x + 0.25) / 0.5, y / 1.0);
      }
    }

    // Petiole tube faces: Ring 0 -> 1, and Ring 1 -> 2
    for (let r = 0; r < petioleRings - 1; r++) {
      const b1 = r * petioleSegs;
      const b2 = (r + 1) * petioleSegs;
      for (let s = 0; s < petioleSegs; s++) {
        const sNext = (s + 1) % petioleSegs;
        indices.push(b1 + s, b2 + s, b1 + sNext);
        indices.push(b1 + sNext, b2 + s, b2 + sNext);
      }
    }

    // Leaf Blade vertices:
    // Spine vertices down center (midrib): S0 (junction) to S5 (tip)
    const spineData = [
      { y: 0.28, z: 0.022 }, // S0 (junction)
      { y: 0.44, z: 0.042 }, // S1
      { y: 0.62, z: 0.062 }, // S2 (widest)
      { y: 0.8, z: 0.052 }, // S3
      { y: 0.92, z: 0.034 }, // S4
      { y: 1.0, z: 0.02 }, // S5 (tip)
    ];

    const bladeWidths = [
      0.16, // at y = 0.44
      0.24, // at y = 0.62 (widest)
      0.18, // at y = 0.80
      0.09, // at y = 0.92
    ];

    const bladeEdgeZ = [
      0.075, // at y = 0.44
      0.1, // at y = 0.62
      0.08, // at y = 0.80
      0.05, // at y = 0.92
    ];

    const spineIdxStart = positions.length / 3;
    for (let i = 0; i < spineData.length; i++) {
      positions.push(0.0, spineData[i].y, spineData[i].z);
      uvs.push(0.5, spineData[i].y / 1.0);
    }

    // Seal top petiole ring (Ring 2) into blade base spine (S0)
    const ring2Base = 2 * petioleSegs;
    const S0 = spineIdxStart;
    for (let s = 0; s < petioleSegs; s++) {
      const sNext = (s + 1) % petioleSegs;
      indices.push(ring2Base + s, ring2Base + sNext, S0);
    }

    const leftIdxStart = positions.length / 3;
    for (let i = 0; i < bladeWidths.length; i++) {
      positions.push(-bladeWidths[i], spineData[i + 1].y, bladeEdgeZ[i]);
      uvs.push((-bladeWidths[i] + 0.25) / 0.5, spineData[i + 1].y / 1.0);
    }

    const rightIdxStart = positions.length / 3;
    for (let i = 0; i < bladeWidths.length; i++) {
      positions.push(bladeWidths[i], spineData[i + 1].y, bladeEdgeZ[i]);
      uvs.push((bladeWidths[i] + 0.25) / 0.5, spineData[i + 1].y / 1.0);
    }

    // Left blade triangles (facing +Z, CCW winding)
    // S0, S1, L1
    indices.push(S0, spineIdxStart + 1, leftIdxStart);
    // Quads between spine segments 1..4
    for (let i = 0; i < 3; i++) {
      const si = spineIdxStart + 1 + i;
      const siNext = si + 1;
      const li = leftIdxStart + i;
      const liNext = li + 1;
      indices.push(si, siNext, li);
      indices.push(siNext, liNext, li);
    }
    // Tip triangle: S4, S5, L4
    indices.push(spineIdxStart + 4, spineIdxStart + 5, leftIdxStart + 3);

    // Right blade triangles (facing +Z, CCW winding)
    // S0, R1, S1
    indices.push(S0, rightIdxStart, spineIdxStart + 1);
    // Quads between spine segments 1..4
    for (let i = 0; i < 3; i++) {
      const si = spineIdxStart + 1 + i;
      const siNext = si + 1;
      const ri = rightIdxStart + i;
      const riNext = ri + 1;
      indices.push(si, ri, siNext);
      indices.push(siNext, ri, riNext);
    }
    // Tip triangle: S4, R4, S5
    indices.push(spineIdxStart + 4, rightIdxStart + 3, spineIdxStart + 5);

    geom.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(positions), 3),
    );
    geom.setAttribute(
      "uv",
      new THREE.BufferAttribute(new Float32Array(uvs), 2),
    );
    geom.setIndex(indices);
    geom.computeVertexNormals();

    return geom;
  }

  _getSaplingScale(growthValue) {
    if (growthValue <= 0.06 || growthValue >= 0.45) return 0;
    if (growthValue < 0.25) {
      return THREE.MathUtils.smoothstep(growthValue, 0.06, 0.25);
    } else if (growthValue <= 0.28) {
      return 1.0;
    } else {
      return 1.0 - THREE.MathUtils.smoothstep(growthValue, 0.28, 0.45);
    }
  }

  _addSaplingLeaf(
    position,
    direction,
    scale,
    rollAngle = 0,
    colorIdx = 0,
    faceNormal = null,
  ) {
    const matrix = new THREE.Matrix4();
    const up = direction.clone().normalize();

    // Align blade face towards camera (+Z) and sky (+Y) by default
    const targetFace = faceNormal
      ? faceNormal.clone().normalize()
      : this._scratchVec1.set(0.0, 0.45, 0.89).normalize();

    let right = new THREE.Vector3().crossVectors(targetFace, up);
    if (right.lengthSq() < 0.001) {
      right = new THREE.Vector3().crossVectors(this._upRef.set(0, 1, 0), up);
      if (right.lengthSq() < 0.001) {
        right = new THREE.Vector3(1, 0, 0);
      }
    }
    right.normalize();

    const forward = new THREE.Vector3().crossVectors(up, right).normalize();

    if (rollAngle !== 0) {
      right.applyAxisAngle(up, rollAngle);
      forward.applyAxisAngle(up, rollAngle);
    }

    matrix.makeBasis(right, up, forward);
    matrix.setPosition(position);
    matrix.multiply(new THREE.Matrix4().makeScale(scale, scale, scale));

    this.saplingLeafTransforms.push(matrix);

    const baseColor =
      saplingLeafPalette[colorIdx % saplingLeafPalette.length].clone();
    const hueOffset = (Math.sin(colorIdx * 1.7) - 0.5) * 0.015;
    const lightOffset = (Math.cos(colorIdx * 2.3) - 0.5) * 0.03;
    baseColor.offsetHSL(hueOffset, 0, lightOffset);
    this.saplingLeafColors.push(baseColor);
  }

  _buildSaplingStage(
    growthValue,
    baseTrunkStart,
    baseTrunkDir,
    currentTrunkLen,
    currentTrunkRadius,
    calculatedInternalGrowth,
  ) {
    const saplingScale = this._getSaplingScale(growthValue);
    if (saplingScale <= 0.001) return;

    // Evaluate the exact trunk curve matching _generateLSystem
    const maxTrunkWobble = 2.2;
    const currentWobble = calculatedInternalGrowth * maxTrunkWobble;
    const cp1 = new THREE.Vector3()
      .copy(baseTrunkStart)
      .addScaledVector(baseTrunkDir, currentTrunkLen * 0.35);
    const cp2 = new THREE.Vector3()
      .copy(baseTrunkStart)
      .addScaledVector(baseTrunkDir, currentTrunkLen * 0.7)
      .add(new THREE.Vector3(currentWobble, 0, currentWobble * 0.5));
    const endPos = new THREE.Vector3()
      .copy(baseTrunkStart)
      .addScaledVector(baseTrunkDir, currentTrunkLen);
    const trunkCurve = new THREE.CubicBezierCurve3(
      baseTrunkStart,
      cp1,
      cp2,
      endPos,
    );

    const leafBaseScale = 0.44 * saplingScale;
    let leafCounter = 0;

    // --- TRUNK LEAF (Right side below fork, as seen in first_stage.png) ---
    const tTrunkLeaf = 0.55;
    const pTrunk = trunkCurve.getPointAt(tTrunkLeaf);
    const rTrunk = THREE.MathUtils.lerp(
      currentTrunkRadius,
      currentTrunkRadius * 0.45,
      tTrunkLeaf,
    );
    const trunkLeafPos = pTrunk
      .clone()
      .add(
        new THREE.Vector3(
          rTrunk * 0.6,
          0.02 * saplingScale,
          0.02 * saplingScale,
        ),
      );
    this._addSaplingLeaf(
      trunkLeafPos,
      new THREE.Vector3(0.68, 0.7, 0.22),
      leafBaseScale * 1.05,
      0.0,
      leafCounter++,
      new THREE.Vector3(0.15, 0.5, 0.85),
    );

    // --- LEFT BRANCH (Shorter, slightly more horizontal ~37° angle, Catmull-Rom) ---
    const tBranch1 = 0.62;
    const p1 = trunkCurve.getPointAt(tBranch1);
    const r1 = THREE.MathUtils.lerp(
      currentTrunkRadius,
      currentTrunkRadius * 0.45,
      tBranch1,
    );
    const leftP0 = p1
      .clone()
      .add(
        new THREE.Vector3(-r1 * 0.45, 0.02 * saplingScale, 0.02 * saplingScale),
      );
    const leftP1 = leftP0
      .clone()
      .add(
        new THREE.Vector3(
          -0.17 * saplingScale,
          0.23 * saplingScale,
          0.06 * saplingScale,
        ),
      );
    const leftP2 = leftP0
      .clone()
      .add(
        new THREE.Vector3(
          -0.38 * saplingScale,
          0.48 * saplingScale,
          0.12 * saplingScale,
        ),
      );
    const leftP3 = leftP0
      .clone()
      .add(
        new THREE.Vector3(
          -0.52 * saplingScale,
          0.7 * saplingScale,
          0.14 * saplingScale,
        ),
      );
    const leftCurve = new THREE.CatmullRomCurve3(
      [leftP0, leftP1, leftP2, leftP3],
      false,
      "catmullrom",
      0.5,
    );

    const leftBranchGeo = this._createBranchGeometry(
      leftCurve,
      Math.max(0.016, r1 * 0.44 * saplingScale),
      Math.max(0.008, 0.026 * saplingScale),
      r1,
      14,
      12,
      1,
      true,
    );
    this.branchGeometries.push(leftBranchGeo);

    // --- LEAVES ON LEFT BRANCH (2 on each side: lower pair near root larger, upper pair smaller) ---
    const leftRStart = Math.max(0.016, r1 * 0.44 * saplingScale);
    const leftREnd = Math.max(0.008, 0.026 * saplingScale);

    // Side 1 (Outer / Left side):
    // 1. Lower Outer Leaf (near root/bottom, larger)
    const tL_outLow = 0.32;
    const pL_outLow = leftCurve.getPointAt(tL_outLow);
    const rL_outLow = THREE.MathUtils.lerp(leftRStart, leftREnd, tL_outLow);
    const dirL_outLow = new THREE.Vector3(-0.78, 0.58, 0.24).normalize();
    this._addSaplingLeaf(
      pL_outLow.clone().addScaledVector(dirL_outLow, rL_outLow * 0.65),
      dirL_outLow,
      leafBaseScale * 1.26,
      0.0,
      leafCounter++,
      new THREE.Vector3(-0.15, 0.5, 0.85),
    );

    // 2. Upper Outer Leaf (upper branch, slightly smaller)
    const tL_outHigh = 0.68;
    const pL_outHigh = leftCurve.getPointAt(tL_outHigh);
    const rL_outHigh = THREE.MathUtils.lerp(leftRStart, leftREnd, tL_outHigh);
    const dirL_outHigh = new THREE.Vector3(-0.72, 0.66, 0.2).normalize();
    this._addSaplingLeaf(
      pL_outHigh.clone().addScaledVector(dirL_outHigh, rL_outHigh * 0.65),
      dirL_outHigh,
      leafBaseScale * 0.95,
      0.0,
      leafCounter++,
      new THREE.Vector3(-0.12, 0.52, 0.84),
    );

    // Side 2 (Inner / Right side):
    // 3. Lower Inner Leaf (near root/bottom, larger)
    const tL_inLow = 0.38;
    const pL_inLow = leftCurve.getPointAt(tL_inLow);
    const rL_inLow = THREE.MathUtils.lerp(leftRStart, leftREnd, tL_inLow);
    const dirL_inLow = new THREE.Vector3(0.55, 0.8, 0.22).normalize();
    this._addSaplingLeaf(
      pL_inLow.clone().addScaledVector(dirL_inLow, rL_inLow * 0.65),
      dirL_inLow,
      leafBaseScale * 1.22,
      0.0,
      leafCounter++,
      new THREE.Vector3(0.1, 0.5, 0.86),
    );

    // 4. Upper Inner Leaf (upper branch, slightly smaller)
    const tL_inHigh = 0.76;
    const pL_inHigh = leftCurve.getPointAt(tL_inHigh);
    const rL_inHigh = THREE.MathUtils.lerp(leftRStart, leftREnd, tL_inHigh);
    const dirL_inHigh = new THREE.Vector3(0.48, 0.85, 0.2).normalize();
    this._addSaplingLeaf(
      pL_inHigh.clone().addScaledVector(dirL_inHigh, rL_inHigh * 0.65),
      dirL_inHigh,
      leafBaseScale * 0.92,
      0.0,
      leafCounter++,
      new THREE.Vector3(0.1, 0.52, 0.85),
    );

    // --- RIGHT BRANCH (Shorter, slightly more horizontal ~37° angle, Catmull-Rom) ---
    const tBranch2 = 0.72;
    const p2 = trunkCurve.getPointAt(tBranch2);
    const r2 = THREE.MathUtils.lerp(
      currentTrunkRadius,
      currentTrunkRadius * 0.45,
      tBranch2,
    );
    const rightP0 = p2
      .clone()
      .add(
        new THREE.Vector3(r2 * 0.45, 0.02 * saplingScale, -0.02 * saplingScale),
      );
    const rightP1 = rightP0
      .clone()
      .add(
        new THREE.Vector3(
          0.15 * saplingScale,
          0.22 * saplingScale,
          -0.04 * saplingScale,
        ),
      );
    const rightP2 = rightP0
      .clone()
      .add(
        new THREE.Vector3(
          0.35 * saplingScale,
          0.46 * saplingScale,
          -0.08 * saplingScale,
        ),
      );
    const rightP3 = rightP0
      .clone()
      .add(
        new THREE.Vector3(
          0.48 * saplingScale,
          0.65 * saplingScale,
          -0.1 * saplingScale,
        ),
      );
    const rightCurve = new THREE.CatmullRomCurve3(
      [rightP0, rightP1, rightP2, rightP3],
      false,
      "catmullrom",
      0.5,
    );

    const rightRStart = Math.max(0.015, r2 * 0.42 * saplingScale);
    const rightREnd = Math.max(0.008, 0.024 * saplingScale);
    const rightBranchGeo = this._createBranchGeometry(
      rightCurve,
      rightRStart,
      rightREnd,
      r2,
      14,
      12,
      1,
      true,
    );
    this.branchGeometries.push(rightBranchGeo);

    // --- LEAVES ON RIGHT BRANCH (2 on each side: lower pair near root larger, upper pair smaller) ---
    // Side 1 (Inner / Left side):
    // 1. Lower Inner Leaf (near root/bottom, larger)
    const tR_inLow = 0.32;
    const pR_inLow = rightCurve.getPointAt(tR_inLow);
    const rR_inLow = THREE.MathUtils.lerp(rightRStart, rightREnd, tR_inLow);
    const dirR_inLow = new THREE.Vector3(-0.52, 0.82, 0.22).normalize();
    this._addSaplingLeaf(
      pR_inLow.clone().addScaledVector(dirR_inLow, rR_inLow * 0.65),
      dirR_inLow,
      leafBaseScale * 1.22,
      0.0,
      leafCounter++,
      new THREE.Vector3(-0.1, 0.5, 0.86),
    );

    // 2. Upper Inner Leaf (upper branch, slightly smaller)
    const tR_inHigh = 0.68;
    const pR_inHigh = rightCurve.getPointAt(tR_inHigh);
    const rR_inHigh = THREE.MathUtils.lerp(rightRStart, rightREnd, tR_inHigh);
    const dirR_inHigh = new THREE.Vector3(-0.48, 0.85, 0.2).normalize();
    this._addSaplingLeaf(
      pR_inHigh.clone().addScaledVector(dirR_inHigh, rR_inHigh * 0.65),
      dirR_inHigh,
      leafBaseScale * 0.92,
      0.0,
      leafCounter++,
      new THREE.Vector3(-0.1, 0.52, 0.85),
    );

    // Side 2 (Outer / Right side):
    // 3. Lower Outer Leaf (near root/bottom, larger)
    const tR_outLow = 0.38;
    const pR_outLow = rightCurve.getPointAt(tR_outLow);
    const rR_outLow = THREE.MathUtils.lerp(rightRStart, rightREnd, tR_outLow);
    const dirR_outLow = new THREE.Vector3(0.78, 0.58, 0.2).normalize();
    this._addSaplingLeaf(
      pR_outLow.clone().addScaledVector(dirR_outLow, rR_outLow * 0.65),
      dirR_outLow,
      leafBaseScale * 1.26,
      0.0,
      leafCounter++,
      new THREE.Vector3(0.15, 0.5, 0.85),
    );

    // 4. Upper Outer Leaf (upper branch, slightly smaller)
    const tR_outHigh = 0.76;
    const pR_outHigh = rightCurve.getPointAt(tR_outHigh);
    const rR_outHigh = THREE.MathUtils.lerp(rightRStart, rightREnd, tR_outHigh);
    const dirR_outHigh = new THREE.Vector3(0.72, 0.66, 0.18).normalize();
    this._addSaplingLeaf(
      pR_outHigh.clone().addScaledVector(dirR_outHigh, rR_outHigh * 0.65),
      dirR_outHigh,
      leafBaseScale * 0.95,
      0.0,
      leafCounter++,
      new THREE.Vector3(0.12, 0.52, 0.84),
    );

    // --- CROWN LEAVES (Directly crowning the top of the main trunk, NO extra branch) ---
    const pTrunkUpper = trunkCurve.getPointAt(0.85);
    this._addSaplingLeaf(
      pTrunkUpper.clone().add(new THREE.Vector3(-0.04, 0.02, 0.02)),
      new THREE.Vector3(-0.52, 0.82, 0.22),
      leafBaseScale * 0.95,
      0.0,
      leafCounter++,
      new THREE.Vector3(-0.12, 0.52, 0.84),
    );

    // Apex crown at the very top of the trunk (endPos)
    this._addSaplingLeaf(
      endPos,
      new THREE.Vector3(0.05, 0.98, 0.15),
      leafBaseScale * 1.15,
      0.0,
      leafCounter++,
      new THREE.Vector3(0.0, 0.4, 0.91),
    );
    this._addSaplingLeaf(
      endPos,
      new THREE.Vector3(-0.48, 0.85, 0.18),
      leafBaseScale * 1.02,
      0.0,
      leafCounter++,
      new THREE.Vector3(-0.15, 0.5, 0.85),
    );
    this._addSaplingLeaf(
      endPos,
      new THREE.Vector3(0.46, 0.86, 0.16),
      leafBaseScale * 1.02,
      0.0,
      leafCounter++,
      new THREE.Vector3(0.15, 0.5, 0.85),
    );
    this._addSaplingLeaf(
      endPos,
      new THREE.Vector3(0.08, 0.88, 0.46),
      leafBaseScale * 0.95,
      0.0,
      leafCounter++,
      new THREE.Vector3(0.0, 0.45, 0.89),
    );
  }

  _getStage2ShootScale(growthValue) {
    if (growthValue < 0.28 || growthValue >= 0.75) return 0;
    if (growthValue < 0.5) {
      return THREE.MathUtils.smoothstep(growthValue, 0.28, 0.5);
    }
    if (growthValue <= 0.55) return 1;
    return 1 - THREE.MathUtils.smoothstep(growthValue, 0.55, 0.75);
  }

  _decorateShootLikeStage1(curve, rStart, rEnd, leafBaseScale, flipX = false) {
    const sx = flipX ? -1 : 1;
    const along = [
      {
        t: 0.32,
        dir: new THREE.Vector3(-0.78 * sx, 0.58, 0.24),
        scale: 1.26,
        face: new THREE.Vector3(-0.15 * sx, 0.5, 0.85),
      },
      {
        t: 0.68,
        dir: new THREE.Vector3(-0.72 * sx, 0.66, 0.2),
        scale: 0.95,
        face: new THREE.Vector3(-0.12 * sx, 0.52, 0.84),
      },
      {
        t: 0.38,
        dir: new THREE.Vector3(0.55 * sx, 0.8, 0.22),
        scale: 1.22,
        face: new THREE.Vector3(0.1 * sx, 0.5, 0.86),
      },
      {
        t: 0.76,
        dir: new THREE.Vector3(0.48 * sx, 0.85, 0.2),
        scale: 0.92,
        face: new THREE.Vector3(0.1 * sx, 0.52, 0.85),
      },
    ];

    for (const spec of along) {
      const t = spec.t;
      const p = curve.getPointAt(t);
      const r = THREE.MathUtils.lerp(rStart, rEnd, t);
      const dir = spec.dir.clone().normalize();
      this._addSaplingLeaf(
        p.clone().addScaledVector(dir, r * 0.65),
        dir,
        leafBaseScale * spec.scale,
        0.0,
        this.saplingLeafTransforms.length,
        spec.face,
      );
    }

    const tip = curve.getPointAt(1);
    const crown = [
      [new THREE.Vector3(0.05, 0.98, 0.15), 1.15, new THREE.Vector3(0.0, 0.4, 0.91)],
      [new THREE.Vector3(-0.48 * sx, 0.85, 0.18), 1.02, new THREE.Vector3(-0.15 * sx, 0.5, 0.85)],
      [new THREE.Vector3(0.46 * sx, 0.86, 0.16), 1.02, new THREE.Vector3(0.15 * sx, 0.5, 0.85)],
      [new THREE.Vector3(0.08, 0.88, 0.46), 0.95, new THREE.Vector3(0.0, 0.45, 0.89)],
    ];
    for (const [dir, scale, face] of crown) {
      this._addSaplingLeaf(
        tip,
        dir,
        leafBaseScale * scale,
        0.0,
        this.saplingLeafTransforms.length,
        face,
      );
    }
  }

  _buildStage2Shoots(
    growthValue,
    baseTrunkStart,
    baseTrunkDir,
    currentTrunkLen,
    currentTrunkRadius,
    calculatedInternalGrowth,
  ) {
    const s = this._getStage2ShootScale(growthValue);
    if (s <= 0.001) return;

    const wobble = calculatedInternalGrowth * 2.2;
    const trunkCurve = new THREE.CubicBezierCurve3(
      baseTrunkStart,
      new THREE.Vector3()
        .copy(baseTrunkStart)
        .addScaledVector(baseTrunkDir, currentTrunkLen * 0.35),
      new THREE.Vector3()
        .copy(baseTrunkStart)
        .addScaledVector(baseTrunkDir, currentTrunkLen * 0.7)
        .add(new THREE.Vector3(wobble, 0, wobble * 0.5)),
      new THREE.Vector3()
        .copy(baseTrunkStart)
        .addScaledVector(baseTrunkDir, currentTrunkLen),
    );

    const k = currentTrunkLen * s * 0.55;
    const leafScale = 0.5 * s;
    const radiusAt = (t) =>
      THREE.MathUtils.lerp(currentTrunkRadius, currentTrunkRadius * 0.45, t);

    const makeShoot = (t, outward, offsets, radiusMul, flipX) => {
      const parentR = radiusAt(t);
      const origin = trunkCurve
        .getPointAt(t)
        .addScaledVector(outward.clone().normalize(), parentR * 0.55);
      const points = [origin.clone()];
      for (const o of offsets) {
        points.push(
          origin.clone().add(new THREE.Vector3(o[0], o[1], o[2]).multiplyScalar(k)),
        );
      }
      const r0 = Math.max(0.016, parentR * radiusMul * 0.72);
      const r1 = Math.max(0.007, r0 * 0.28);
      const curve = new THREE.CatmullRomCurve3(points, false, "catmullrom", 0.5);
      this.branchGeometries.push(
        this._createBranchGeometry(curve, r0, r1, parentR, 16, 10, 1, true),
      );
      this._decorateShootLikeStage1(curve, r0, r1, leafScale, flipX);
    };

    // Left, right, middle; the rear shoot stays as-is.
    makeShoot(
      0.56,
      new THREE.Vector3(-0.75, 0.22, 0.42),
      [
        [-0.16, 0.22, 0.08],
        [-0.34, 0.5, 0.14],
        [-0.3, 0.82, 0.12],
      ],
      0.58,
      false,
    );
    makeShoot(
      0.46,
      new THREE.Vector3(0.84, 0.2, -0.2),
      [
        [0.14, 0.16, -0.04],
        [0.3, 0.4, -0.08],
        [0.34, 0.62, -0.05],
      ],
      0.5,
      true,
    );
    makeShoot(
      0.7,
      new THREE.Vector3(0.05, 0.55, 0.38),
      [
        [0.02, 0.2, 0.06],
        [0.03, 0.44, 0.1],
        [0.02, 0.66, 0.12],
      ],
      0.42,
      false,
    );
    makeShoot(
      0.4,
      new THREE.Vector3(0.3, 0.16, -0.78),
      [
        [0.08, 0.12, -0.1],
        [0.16, 0.3, -0.2],
        [0.18, 0.46, -0.24],
      ],
      0.4,
      true,
    );

    // Botanical leaves on the tip of the main trunk
    const trunkTip = trunkCurve.getPointAt(1);
    const trunkTipR = radiusAt(1);
    const crown = [
      [new THREE.Vector3(0.05, 0.98, 0.15), 1.12, new THREE.Vector3(0.0, 0.4, 0.91)],
      [new THREE.Vector3(-0.48, 0.85, 0.18), 1.0, new THREE.Vector3(-0.15, 0.5, 0.85)],
      [new THREE.Vector3(0.46, 0.86, 0.16), 1.0, new THREE.Vector3(0.15, 0.5, 0.85)],
      [new THREE.Vector3(0.08, 0.88, 0.46), 0.92, new THREE.Vector3(0.0, 0.45, 0.89)],
    ];
    for (const [dir, scale, face] of crown) {
      this._addSaplingLeaf(
        trunkTip.clone().addScaledVector(dir, trunkTipR * 0.4),
        dir,
        leafScale * scale,
        0.0,
        this.saplingLeafTransforms.length,
        face,
      );
    }
  }

  rebuild(growthValue) {
    const startTime = performance.now();

    this.group.traverse((child) => {
      if (child.isMesh || child.isInstancedMesh) {
        if (
          child.geometry &&
          child.geometry !== this.baseCylinderGeo &&
          child.geometry !== this.leafClumpGeometry &&
          child.geometry !== this.singleLeafGeometry &&
          child.geometry !== this.fruitGeo &&
          child.geometry !== this.haloGeo
        ) {
          child.geometry.dispose();
        }
      }
    });
    this.group.clear();

    this.fruitData = [];
    this.leafTransforms = [];
    this.leafColors = [];
    this.saplingLeafTransforms = [];
    this.saplingLeafColors = [];
    this.fruitTransforms = [];
    this.branchGeometries = [];
    this.instancedTwigTransforms = [];

    // Young stems are smooth and green; bark only reads in as the tree matures.
    const barkProgress = THREE.MathUtils.smoothstep(growthValue, 0.15, 0.55);
    this.trunkMaterial.color.lerpColors(
      this._youngStemColor ||
        (this._youngStemColor = new THREE.Color("#65913f")),
      this._matureBarkColor ||
        (this._matureBarkColor = new THREE.Color("#827161")), // Beautiful warm gray-brown bark
      barkProgress,
    );
    this.trunkMaterial.bumpScale = THREE.MathUtils.lerp(
      0.0,
      0.05,
      barkProgress,
    );

    const calculatedInternalGrowth = growthValue * 0.62;
    const baseTrunkStart = new THREE.Vector3(0, -7.5, 0);
    const baseTrunkDir = new THREE.Vector3(0, 1, 0).normalize();
    const baseTrunkMaxLen = 9.5;
    const currentTrunkLen =
      baseTrunkMaxLen * Math.min(1.0, calculatedInternalGrowth * 1.5);
    const currentTrunkRadius =
      0.85 * Math.log1p(calculatedInternalGrowth * 1.5);

    this._generateLSystem(
      baseTrunkStart,
      baseTrunkDir,
      currentTrunkLen,
      currentTrunkRadius,
      0,
      5,
      calculatedInternalGrowth,
      null,
      growthValue,
      "0",
    );

    // Build the realistic Stage 1 sapling branches & leaves (separated from L-system)
    this._buildSaplingStage(
      growthValue,
      baseTrunkStart,
      baseTrunkDir,
      currentTrunkLen,
      currentTrunkRadius,
      calculatedInternalGrowth,
    );

    this._buildStage2Shoots(
      growthValue,
      baseTrunkStart,
      baseTrunkDir,
      currentTrunkLen,
      currentTrunkRadius,
      calculatedInternalGrowth,
    );

    if (this.branchGeometries.length > 0) {
      const mergedBranchGeometry = BufferGeometryUtils.mergeGeometries(
        this.branchGeometries,
      );
      const unifiedBranchMesh = new THREE.Mesh(
        mergedBranchGeometry,
        this.trunkMaterial,
      );
      unifiedBranchMesh.castShadow = true;
      unifiedBranchMesh.receiveShadow = true;
      this.group.add(unifiedBranchMesh);
      this.branchGeometries.forEach((geo) => geo.dispose());
    }

    if (this.instancedTwigTransforms.length > 0) {
      const twigInstancedMesh = new THREE.InstancedMesh(
        this.baseCylinderGeo,
        this.trunkMaterial,
        this.instancedTwigTransforms.length,
      );
      twigInstancedMesh.castShadow = true;
      twigInstancedMesh.receiveShadow = true;
      twigInstancedMesh.frustumCulled = false;
      const twigColor = new THREE.Color("#62784d");
      for (let i = 0; i < this.instancedTwigTransforms.length; i++) {
        twigInstancedMesh.setMatrixAt(i, this.instancedTwigTransforms[i]);
        twigInstancedMesh.setColorAt(i, twigColor);
      }
      twigInstancedMesh.instanceMatrix.needsUpdate = true;
      if (twigInstancedMesh.instanceColor)
        twigInstancedMesh.instanceColor.needsUpdate = true;
      this.group.add(twigInstancedMesh);
    }

    if (this.leafTransforms.length > 0) {
      const leafInstancedMesh = new THREE.InstancedMesh(
        this.leafClumpGeometry,
        this.leafMaterial,
        this.leafTransforms.length,
      );
      leafInstancedMesh.castShadow = true;
      leafInstancedMesh.receiveShadow = true;
      leafInstancedMesh.frustumCulled = false;
      for (let i = 0; i < this.leafTransforms.length; i++) {
        leafInstancedMesh.setMatrixAt(i, this.leafTransforms[i]);
        leafInstancedMesh.setColorAt(i, this.leafColors[i]);
      }
      leafInstancedMesh.instanceMatrix.needsUpdate = true;
      if (leafInstancedMesh.instanceColor)
        leafInstancedMesh.instanceColor.needsUpdate = true;
      this.group.add(leafInstancedMesh);
    }

    if (this.saplingLeafTransforms.length > 0) {
      const saplingLeafMesh = new THREE.InstancedMesh(
        this.singleLeafGeometry,
        this.leafMaterial,
        this.saplingLeafTransforms.length,
      );
      saplingLeafMesh.castShadow = true;
      saplingLeafMesh.receiveShadow = true;
      saplingLeafMesh.frustumCulled = false;
      for (let i = 0; i < this.saplingLeafTransforms.length; i++) {
        saplingLeafMesh.setMatrixAt(i, this.saplingLeafTransforms[i]);
        saplingLeafMesh.setColorAt(i, this.saplingLeafColors[i]);
      }
      saplingLeafMesh.instanceMatrix.needsUpdate = true;
      if (saplingLeafMesh.instanceColor)
        saplingLeafMesh.instanceColor.needsUpdate = true;
      this.group.add(saplingLeafMesh);
    }

    if (growthValue > 0.9 && this.fruitTransforms.length > 0) {
      const fruitScale = THREE.MathUtils.clamp((growthValue - 0.9) / 0.1, 0, 1);
      this._renderFruits(fruitScale);
    }

    return performance.now() - startTime;
  }

  _renderFruits(individualScale = 1.0) {
    const poolSize = this.fruitTransforms.length;
    if (poolSize === 0) return;

    const sortedPool = [...this.fruitTransforms].sort((a, b) =>
      a.path.localeCompare(b.path),
    );

    const numTotalApples = 25;
    const count = Math.min(numTotalApples, poolSize);
    const used = new Set();
    const indicesToRender = [];

    for (let i = 0; i < count; i++) {
      let idx = Math.round((i / Math.max(count - 1, 1)) * (poolSize - 1));
      while (used.has(idx) && used.size < poolSize) {
        idx = (idx + 1) % poolSize;
      }
      used.add(idx);
      indicesToRender.push({
        index: idx,
        project: PROJECT_IDS[i % PROJECT_IDS.length],
      });
    }

    this.fruitInstancedMesh = new THREE.InstancedMesh(
      this.fruitGeo,
      this.fruitMat,
      indicesToRender.length,
    );
    this.haloInstancedMesh = new THREE.InstancedMesh(
      this.haloGeo,
      this.haloMatTemplate,
      indicesToRender.length,
    );

    this.fruitInstancedMesh.castShadow = true;
    this.fruitInstancedMesh.frustumCulled = false;
    this.haloInstancedMesh.frustumCulled = false;
    this.fruitInstancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.haloInstancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    this.fruitData = [];
    const matrix = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const sc = new THREE.Vector3();

    indicesToRender.forEach((item, i) => {
      const fruitData = sortedPool[item.index];
      if (!fruitData) return;

      // Decompose to ignore branch scale
      fruitData.matrix.decompose(pos, quat, sc);

      matrix.compose(
        pos,
        quat,
        new THREE.Vector3(individualScale, individualScale, individualScale),
      );

      this.fruitInstancedMesh.setMatrixAt(i, matrix);
      this.haloInstancedMesh.setMatrixAt(i, matrix);

      this.fruitData[i] = {
        path: fruitData.path,
        social: item.project,
        matrix: matrix.clone(),
      };
    });

    this.fruitInstancedMesh.instanceMatrix.needsUpdate = true;
    this.haloInstancedMesh.instanceMatrix.needsUpdate = true;

    this.group.add(this.fruitInstancedMesh);
    this.group.add(this.haloInstancedMesh);
  }

  updateWind(time) {
    if (this.leafMaterial.userData.shader) {
      this.leafMaterial.userData.shader.uniforms.time.value = time;
    }
  }

  _createBranchGeometry(
    curve,
    startRadius,
    endRadius,
    parentRadius,
    segments,
    radialSegments,
    currentDepth,
    pinchTip = false,
  ) {
    const geometry = new THREE.TubeGeometry(
      curve,
      segments,
      startRadius,
      radialSegments,
      false,
    );
    const positionAttribute = geometry.attributes.position;
    const targetBaseRadius = startRadius + (parentRadius - startRadius) * 0.45;

    const colors = [];
    const brown = new THREE.Color("#59402a");
    const green = new THREE.Color("#62784d");
    const tempColor = new THREE.Color();

    for (let i = 0; i <= segments; i++) {
      const progression = i / segments;
      const standardRadius = THREE.MathUtils.lerp(
        startRadius,
        endRadius,
        progression,
      );
      const flareDropoff = Math.exp(-progression * 6.0);
      let actualRadius = THREE.MathUtils.lerp(
        standardRadius,
        targetBaseRadius,
        flareDropoff,
      );

      const isTrunk = currentDepth === 0;
      if (isTrunk && progression > 0.95) {
        const pinchFactor = THREE.MathUtils.mapLinear(
          progression,
          0.95,
          1.0,
          1.0,
          0.5,
        );
        actualRadius *= pinchFactor;
      } else if (pinchTip && progression > 0.75) {
        const t = (progression - 0.75) / 0.25;
        const pinchFactor = Math.cos(t * Math.PI * 0.5);
        actualRadius *= Math.max(0.0001, pinchFactor);
      }

      const blendFactor = THREE.MathUtils.clamp(
        (currentDepth / 4.0) * 0.3 + progression * 0.7,
        0,
        1,
      );
      tempColor.lerpColors(brown, green, blendFactor);

      curve.getPointAt(progression, this._centerPoint);
      for (let j = 0; j <= radialSegments; j++) {
        const vertexIndex = i * (radialSegments + 1) + j;
        if (vertexIndex < positionAttribute.count) {
          this._vertex.fromBufferAttribute(positionAttribute, vertexIndex);
          this._radialDir.copy(this._vertex).sub(this._centerPoint).normalize();
          this._vertex
            .copy(this._centerPoint)
            .addScaledVector(this._radialDir, actualRadius);
          positionAttribute.setXYZ(
            vertexIndex,
            this._vertex.x,
            this._vertex.y,
            this._vertex.z,
          );
          colors.push(tempColor.r, tempColor.g, tempColor.b);
        }
      }
    }

    positionAttribute.needsUpdate = true;
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    return geometry;
  }

  _generateLSystem(
    startPos,
    direction,
    length,
    radius,
    currentDepth,
    maxDepth,
    growthFactor,
    parentRadius = null,
    originalGrowth = 0,
    path = "0",
  ) {
    if (currentDepth > maxDepth || length < 0.03 || radius < 0.001) return;

    const endPos = new THREE.Vector3()
      .copy(startPos)
      .addScaledVector(direction, length);
    let curveAxis = new THREE.Vector3(0, 1, 0).cross(direction).normalize();
    if (curveAxis.lengthSq() < 0.001) curveAxis.set(1, 0, 0);
    const secondaryAxis = new THREE.Vector3()
      .copy(curveAxis)
      .cross(direction)
      .normalize();
    const cp1 = new THREE.Vector3();
    const cp2 = new THREE.Vector3();

    if (currentDepth === 0) {
      const maxTrunkWobble = 2.2;
      const currentWobble = growthFactor * maxTrunkWobble;
      cp1.copy(startPos).addScaledVector(direction, length * 0.35);
      cp2
        .copy(startPos)
        .addScaledVector(direction, length * 0.7)
        .add(this._scratchVec1.set(currentWobble, 0, currentWobble * 0.5));
    } else {
      const proportionalOffset = length * 0.35;
      cp1.copy(startPos).addScaledVector(direction, length * 0.33);
      cp2
        .copy(startPos)
        .addScaledVector(direction, length * 0.66)
        .addScaledVector(curveAxis, proportionalOffset)
        .addScaledVector(secondaryAxis, proportionalOffset * 0.2);
    }

    const branchCurve = new THREE.CubicBezierCurve3(startPos, cp1, cp2, endPos);

    // Geometry Simplification
    let segments =
      currentDepth === 0
        ? 20
        : currentDepth === 1
          ? 12
          : currentDepth === 2
            ? 6
            : currentDepth === 3
              ? 3
              : 2;
    let radialSegments =
      currentDepth === 0
        ? 10
        : currentDepth === 1
          ? 8
          : currentDepth === 2
            ? 5
            : currentDepth === 3
              ? 3
              : 3;

    if (this.isMobile) {
      segments = Math.max(1, Math.floor(segments * 0.7));
      radialSegments =
        currentDepth === 0
          ? 8
          : currentDepth === 1
            ? 6
            : currentDepth === 2
              ? 4
              : 3;
    }

    const targetEndRadius = currentDepth === 0 ? radius * 0.45 : radius * 0.55;

    if (currentDepth >= 4) {
      const matrix = new THREE.Matrix4();
      this._upRef.set(0, 1, 0);
      this._scratchQuat.setFromUnitVectors(this._upRef, direction);
      this._scratchScale.set(radius, length, radius);
      matrix.compose(startPos, this._scratchQuat, this._scratchScale);
      this.instancedTwigTransforms.push(matrix);

      if (originalGrowth > 0.8) {
        const fruitMatrix = new THREE.Matrix4().copy(matrix);
        fruitMatrix.multiply(new THREE.Matrix4().makeTranslation(0, 1.0, 0));
        this.fruitTransforms.push({ matrix: fruitMatrix, path: path + "-tip" });
      }
    } else {
      const branchGeo = this._createBranchGeometry(
        branchCurve,
        radius,
        targetEndRadius,
        parentRadius === null ? radius * 1.15 : parentRadius,
        segments,
        radialSegments,
        currentDepth,
      );
      this.branchGeometries.push(branchGeo);
    }

    const nextDepth = currentDepth + 1;
    const nextLength = currentDepth === 0 ? length * 0.65 : length * 0.72;
    const nextRadius = radius * 0.48;

    if (currentDepth === 3 && growthFactor > 0.05) {
      const fineAvailability = THREE.MathUtils.clamp(
        (growthFactor - 0.05) / 0.45,
        0.0,
        1.0,
      );
      for (let k = 1; k <= segments; k++) {
        const splitProgress = k / segments;
        const splitOrigin = branchCurve.getPointAt(splitProgress);
        const seed = currentDepth * 3000 + k * 51.17;
        const goldenAngleStep = k * 2.39996 + Math.cos(seed * 0.7) * 0.3;
        const fineDir = new THREE.Vector3(
          Math.cos(goldenAngleStep) * 0.5,
          0.5,
          Math.sin(goldenAngleStep) * 0.5,
        ).normalize();
        const adjustedAvailability = THREE.MathUtils.clamp(
          (fineAvailability - 0.1) / 0.9,
          0,
          1,
        );
        const localGrowth = Math.min(1.0, adjustedAvailability * 1.8);
        this._generateLSystem(
          splitOrigin,
          fineDir,
          nextLength * localGrowth,
          nextRadius * Math.pow(localGrowth, 1.2),
          nextDepth,
          maxDepth,
          growthFactor,
          THREE.MathUtils.lerp(radius, targetEndRadius, splitProgress),
          originalGrowth,
          path + "-k" + k,
        );
      }
    }

    if (currentDepth === 4 && growthFactor > 0.05) {
      const leafGrowth = THREE.MathUtils.clamp(
        (growthFactor - 0.05) / 0.32,
        0.0,
        1.0,
      );
      const clumpsPerSegment = 6;
      const stepDelta = Math.max(1, Math.floor(segments / 8));
      for (let k = 1; k <= segments; k += stepDelta) {
        const progress = k / segments;
        const leafPos = branchCurve.getPointAt(progress);
        const branchForward = branchCurve.getTangentAt(progress).normalize();
        const heightFromBase = leafPos.y + 7.5;
        let hScale =
          heightFromBase > 4.0 && heightFromBase < 18.0
            ? Math.sin(((heightFromBase - 4.0) / 14.0) * Math.PI)
            : 0;
        if (hScale >= 0.1) {
          let refUp = this._upRef.set(0, 1, 0);
          if (Math.abs(branchForward.dot(refUp)) > 0.95) refUp.set(1, 0, 0);
          const bRight = new THREE.Vector3()
            .crossVectors(branchForward, refUp)
            .normalize();
          const bUp = new THREE.Vector3()
            .crossVectors(bRight, branchForward)
            .normalize();
          for (let l = 0; l < clumpsPerSegment; l++) {
            const seed =
              currentDepth * 4000 + (k * clumpsPerSegment + l) * 53.17;
            const randB = Math.cos(seed * 1.4) * 0.5 + 0.5;
            const sAngle = (l / clumpsPerSegment) * Math.PI * 2;
            const thick = THREE.MathUtils.lerp(
              radius,
              targetEndRadius,
              progress,
            );
            const finalPos = new THREE.Vector3()
              .copy(leafPos)
              .addScaledVector(
                bRight,
                Math.cos(sAngle) * thick * (0.8 + randB * 1.1),
              )
              .addScaledVector(
                bUp,
                Math.sin(sAngle) * thick * (0.8 + randB * 1.1),
              );
            const outward = new THREE.Vector3()
              .addScaledVector(bRight, Math.cos(sAngle))
              .addScaledVector(bUp, Math.sin(sAngle))
              .normalize();
            const cForward = new THREE.Vector3()
              .copy(outward)
              .multiplyScalar(0.8)
              .addScaledVector(branchForward, 0.2)
              .add(new THREE.Vector3(0, -0.15, 0))
              .normalize();
            let cUp = new THREE.Vector3(0, 1, 0);
            if (Math.abs(cForward.dot(cUp)) > 0.95) cUp.set(1, 0, 0);
            const cRight = new THREE.Vector3()
              .crossVectors(cForward, cUp)
              .normalize();
            cUp.crossVectors(cRight, cForward).normalize();
            const matrix = new THREE.Matrix4();
            matrix.makeBasis(cRight, cUp, cForward);
            matrix.setPosition(finalPos);
            const fScale =
              (0.35 + Math.sin(seed * 0.5 + 0.5) * 0.4) *
              leafGrowth *
              hScale *
              1.38;
            matrix.multiply(
              new THREE.Matrix4().makeScale(fScale, fScale, fScale),
            );
            this.leafTransforms.push(matrix);
            if (originalGrowth > 0.95 && l === 0 && k % 12 === 0) {
              const fMat = new THREE.Matrix4()
                .copy(matrix)
                .multiply(new THREE.Matrix4().makeTranslation(0, -0.2, 0));
              this.fruitTransforms.push({
                matrix: fMat,
                path: path + "-l" + k + "-" + l,
              });
            }
            this.leafColors.push(
              leafPalettes[Math.floor(randB * leafPalettes.length)]
                .clone()
                .offsetHSL(
                  (Math.sin(seed * 0.5 + 0.5) - 0.5) * 0.06,
                  0,
                  (Math.sin(seed * 0.5 + 0.5) - 0.5) * 0.1,
                ),
            );
          }
        }
      }
    }

    if (currentDepth === 0 && growthFactor > 0.08) {
      const bAvail = (growthFactor - 0.08) / 0.92;
      for (let i = 0; i < 12; i++) {
        const seed = i * 43.19;
        const progress = 0.35 + (i / 12) * 0.52 + Math.sin(seed) * 0.03;
        const angle = i * 2.39996 + Math.cos(seed * 1.7) * 0.2;
        const pitch = THREE.MathUtils.clamp(
          0.45 + (i / 12) * 0.15 + Math.sin(seed * 2.3) * 0.08,
          0.3,
          0.7,
        );
        const bDir = new THREE.Vector3(
          Math.cos(angle) * (1.0 - pitch),
          pitch,
          Math.sin(angle) * (1.0 - pitch),
        ).normalize();
        const lGrowth = Math.min(
          1.0,
          THREE.MathUtils.clamp(
            (bAvail - (i / 12) * 0.15) / (1.0 - (i / 12) * 0.15),
            0,
            1,
          ) * 1.5,
        );
        if (lGrowth > 0.01)
          this._generateLSystem(
            branchCurve.getPointAt(progress),
            bDir,
            nextLength * lGrowth,
            nextRadius * Math.pow(lGrowth, 1.2),
            nextDepth,
            maxDepth,
            growthFactor,
            THREE.MathUtils.lerp(radius, targetEndRadius, progress),
            originalGrowth,
            path + "-s" + i,
          );
      }
    } else if (currentDepth === 1 && growthFactor > 0.12) {
      const tAvail = (growthFactor - 0.12) / 0.88;
      for (let i = 0; i < 3; i++) {
        const progress = 0.35 + i * 0.2;
        const tangent = branchCurve.getTangentAt(progress);
        const side = new THREE.Vector3(0, 1, 0).cross(tangent).normalize();
        if (side.lengthSq() < 0.001) side.set(1, 0, 0);
        const tDir = new THREE.Vector3()
          .copy(tangent)
          .addScaledVector(side, (i === 0 ? 1.0 : i === 1 ? -1.0 : 0.3) * 0.85);
        tDir.y += 0.1;
        this._generateLSystem(
          branchCurve.getPointAt(progress),
          tDir.normalize(),
          nextLength * Math.min(1.0, tAvail * 1.5),
          nextRadius * Math.pow(Math.min(1.0, tAvail * 1.5), 1.2),
          nextDepth,
          maxDepth,
          growthFactor,
          THREE.MathUtils.lerp(radius, targetEndRadius, progress),
          originalGrowth,
          path + "-t" + i,
        );
      }
    } else if (currentDepth === 2 && growthFactor > 0.22) {
      const fAvail = (growthFactor - 0.22) / 0.78;
      for (let i = 0; i < 3; i++) {
        const progress = 0.4 + i * 0.22;
        const lat = new THREE.Vector3(
          Math.cos((i / 3) * Math.PI * 2),
          0.3,
          Math.sin((i / 3) * Math.PI * 2),
        ).normalize();
        const sDir = new THREE.Vector3()
          .copy(branchCurve.getTangentAt(progress))
          .addScaledVector(lat, 0.7)
          .normalize();
        this._generateLSystem(
          branchCurve.getPointAt(progress),
          sDir,
          nextLength * Math.min(1.0, fAvail * 1.7),
          nextRadius * Math.pow(Math.min(1.0, fAvail * 1.7), 1.2),
          nextDepth,
          maxDepth,
          growthFactor,
          THREE.MathUtils.lerp(radius, targetEndRadius, progress),
          originalGrowth,
          path + "-sh" + i,
        );
      }
    }
  }
}
