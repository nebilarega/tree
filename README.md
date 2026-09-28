# tree

Personal site: **[https://nebilarega.et/](https://nebilarega.et/)**

A Three.js portfolio that grows a tree as you scroll — career stages mapped onto canopy, not a gallery grid.

## How it grows

This is a **pseudo L-system**, not the classic rewrite-string turtle (`F`, `+`, `[`). In `src/tree.js`, `_generateLSystem` walks a branch recursively (max depth 5):

- trunk is a cubic curve that leans as growth increases
- primary limbs fork off with a golden-angle spiral
- depth 1–2 add side shoots; depth 3 sprays fine twigs; depth 4 instances leaves
- late growth hangs fruit (project/social apples)

`rebuild(growth)` tears the mesh down and grows it again. Scroll drives growth through `[0, 0.25, 0.5, 0.75, 1.0]`, which is the same arc as the copy on the site: fundamentals → branching out → taking root → bearing fruit.

Early frames also use hand-placed sapling geometry (`_buildSaplingStage`) so the first shoot doesn’t look like a truncated adult tree.

The rest of the scene is dirt, a watering can, clouds, and wind in the leaf shader (`src/app.js`, `src/watering.js`, `src/cloudSystem.js`).

## Stack

Vite, Three.js, Lucide.

```bash
npm install
npm run dev
```

Live: [nebilarega.et](https://nebilarega.et/)
