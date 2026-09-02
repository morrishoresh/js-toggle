async function load() {
  const { disabledSites = [] } = await browser.storage.local.get("disabledSites");
  document.getElementById("sites").value = disabledSites.join("\n");
}

document.getElementById("save").addEventListener("click", async () => {
  const raw = document.getElementById("sites").value;
  const list = [
    ...new Set(
      raw
        .split("\n")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
    )
  ];
  await browser.storage.local.set({ disabledSites: list });
  const status = document.getElementById("status");
  status.textContent = "Saved.";
  setTimeout(() => (status.textContent = ""), 1500);
});

load();
