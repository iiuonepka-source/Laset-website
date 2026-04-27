(() => {
  const status = document.getElementById("demo-status");
  const typed = document.getElementById("typed-command");
  const processList = document.getElementById("process-list");
  const panelItems = Array.from(document.querySelectorAll(".panel-item"));

  if (!status || !typed || !processList || panelItems.length === 0) {
    return;
  }

  const steps = [
    {
      panel: 0,
      text: "Open settings...",
      command: "",
      showProcesses: false
    },
    {
      panel: 1,
      text: "Select theme...",
      command: "",
      showProcesses: false
    },
    {
      panel: 2,
      text: "Type start command...",
      command: "start",
      showProcesses: false
    },
    {
      panel: 3,
      text: "Choose target process...",
      command: "start",
      showProcesses: true
    }
  ];

  let idx = 0;

  function renderStep(step) {
    panelItems.forEach((item, i) => {
      item.classList.toggle("active", i === step.panel);
    });

    status.textContent = step.text;
    typed.textContent = step.command;
    processList.classList.toggle("visible", step.showProcesses);

    const processNodes = processList.querySelectorAll(".process");
    processNodes.forEach((node, i) => {
      node.classList.toggle("selected", step.showProcesses && i === 1);
    });
  }

  renderStep(steps[0]);
  setInterval(() => {
    idx = (idx + 1) % steps.length;
    renderStep(steps[idx]);
  }, 1600);
})();
