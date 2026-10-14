// Aplica o tema salvo antes da primeira pintura (evita o "piscar" claro->escuro). Mantenha em sincronia com src/lib/theme.ts.
(function () {
  try {
    var salvo = localStorage.getItem("pdv-theme");
    if (salvo === "light" || salvo === "dark") document.documentElement.setAttribute("data-theme", salvo);
  } catch (e) {
    /* sem armazenamento: segue o tema do sistema */
  }
})();
