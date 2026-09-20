export function setupGrowthButtons(onChange) {
  const stageButtons = document.querySelectorAll(".stage-btn");
  stageButtons.forEach((btn) => {
    btn.addEventListener("click", (event) => {
      stageButtons.forEach((b) => b.classList.remove("active"));
      const clicked = event.currentTarget;
      clicked.classList.add("active");
      onChange(parseFloat(clicked.getAttribute("data-val")) / 100);
    });
  });
}
