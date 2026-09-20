export const PROJECTS = [
  {
    id: "Chilot.et",
    title: "Chilot.et",
    desc: "Lawyers in Ethiopia had no real online marketplace. So I'm cofounding one.",
    url: "https://chilot.et",
    cta: "VIEW PROJECT",
    color: "#c2410c",
  },
  {
    id: "Microdrama Gen",
    title: "Microdrama Gen",
    desc: "Feeding an LLM a premise and watching it hand back a script, then a scene, then a video.",
    url: "https://github.com/nebilarega",
    cta: "VISIT GITHUB",
    color: "#dc2626",
  },
  {
    id: "Illustrator Extension",
    title: "Illustrator Extension",
    desc: "Designers were manually redrawing the same charts all day. Now GPT and a stream of market data do it for them.",
    url: "https://github.com/nebilarega",
    cta: "VISIT GITHUB",
    color: "#ea580c",
  },
  {
    id: "SRS EHR Automation",
    title: "SRS EHR Automation",
    desc: "One doctor could handle a couple of documents a day by hand. The system does 500.",
    url: "https://github.com/nebilarega",
    cta: "VISIT GITHUB",
    color: "#be123c",
  },
  {
    id: "Portfolio Site",
    title: "Portfolio Site",
    desc: "Built the tree you're scrolling through right now: Three.js and a pseudo L-system driving the growth.",
    url: "https://github.com/nebilarega",
    cta: "VISIT GITHUB",
    color: "#ff6666",
  },
];

export const APPLE_COLORS = Object.fromEntries(
  PROJECTS.map((p) => [p.id, p.color]),
);

export const PROJECT_IDS = PROJECTS.map((p) => p.id);
