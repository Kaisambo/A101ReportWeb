// ╔══════════════════════════════════════════════════════════╗
// ║  app.js — логика формы аналитического отчёта v4         ║
// ╚══════════════════════════════════════════════════════════╝

document.addEventListener("DOMContentLoaded", () => {
  // ─── Элементы ────────────────────────────────────────────
  const form            = document.getElementById("report-form");
  const submitBtn       = document.getElementById("submit-btn");
  const submitLabel     = submitBtn.querySelector(".submit-btn__label");
  const submitSpinner   = submitBtn.querySelector(".submit-btn__spinner");
  const resultBox       = document.getElementById("result");

  const reportTypeTabs  = document.querySelectorAll(".report-type-tab");
  const reportTypeInput = document.getElementById("reportType");

  const sectionEmployee = document.getElementById("section-employee");
  const sectionGeneral  = document.getElementById("section-general");
  const employeeSelect  = document.getElementById("employee");
  const employeeLoading = document.getElementById("employee-loading");

  const sheetUrlInput   = document.getElementById("sheetUrl");
  const sheetHint       = document.getElementById("sheet-hint");

  const reasonsContainer = document.getElementById("reasons-container");
  const btnAddReason     = document.getElementById("btn-add-reason");

  // ─── Тип отчёта ─────────────────────────────────────────
  function setReportType(type) {
    reportTypeInput.value = type;

    reportTypeTabs.forEach((tab) => {
      tab.classList.toggle("active", tab.dataset.type === type);
    });

    if (type === "employee") {
      sectionEmployee.hidden = false;
      sectionGeneral.hidden  = true;
      employeeSelect.required = true;
    } else {
      sectionEmployee.hidden = true;
      sectionGeneral.hidden  = false;
      employeeSelect.required = false;
    }
  }

  reportTypeTabs.forEach((tab) => {
    tab.addEventListener("click", () => setReportType(tab.dataset.type));
  });

  // ─── Google Sheet URL ────────────────────────────────────
  function parseSheetId(url) {
    if (!url) return null;
    const m = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    return m ? m[1] : null;
  }

  function parseSheetGid(url) {
    if (!url) return null;
    const m = url.match(/[#&]gid=(\d+)/);
    return m ? m[1] : null;
  }

  sheetUrlInput.addEventListener("input", () => {
    const val = sheetUrlInput.value.trim();
    if (!val) {
      sheetHint.textContent = "";
      sheetHint.className = "hint";
      return;
    }
    const id = parseSheetId(val);
    if (id) {
      sheetHint.textContent = "✓ ID таблицы: " + id;
      sheetHint.className = "hint hint--ok";
    } else {
      sheetHint.textContent = "✗ Не удалось распознать ссылку";
      sheetHint.className = "hint hint--err";
    }
  });

  // ─── Причины (макс. 2) ──────────────────────────────────
  let reasonCount = 1;

  btnAddReason.addEventListener("click", () => {
    if (reasonCount >= 2) return;
    reasonCount = 2;

    const row = document.createElement("div");
    row.className = "reason-row";
    row.id = "reason2-row";
    row.innerHTML =
      '<input type="text" name="reason2" placeholder="Причина 2 (например: Долгое ожидание ответа)">' +
      '<button type="button" class="btn-icon btn-icon--danger" id="btn-remove-reason" title="Убрать">×</button>';
    reasonsContainer.appendChild(row);
    btnAddReason.hidden = true;

    document.getElementById("btn-remove-reason").addEventListener("click", () => {
      row.remove();
      reasonCount = 1;
      btnAddReason.hidden = false;
    });
  });

  // ─── Загрузка сотрудников ────────────────────────────────
  async function loadEmployees() {
    const url = CONFIG.N8N_BASE + CONFIG.EMPLOYEES_PATH;

    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error("HTTP " + resp.status);

      const data = await resp.json();
      // n8n может вернуть массив или объект
      const list = Array.isArray(data)
        ? (data[0]?.employees || [])
        : (data.employees || []);

      employeeSelect.innerHTML = '<option value="">— Выберите сотрудника —</option>';
      list.forEach((name) => {
        const opt = document.createElement("option");
        opt.value = name;
        opt.textContent = name;
        employeeSelect.appendChild(opt);
      });

      employeeLoading.hidden = true;
      employeeSelect.hidden  = false;
    } catch (err) {
      console.error("Ошибка загрузки сотрудников:", err);
      employeeLoading.innerHTML =
        '⚠️ Не удалось загрузить список. <a href="#" class="retry-link">Повторить</a>';
      employeeLoading.querySelector(".retry-link").addEventListener("click", (e) => {
        e.preventDefault();
        employeeLoading.innerHTML =
          '<span class="spinner"></span> Загрузка списка сотрудников…';
        loadEmployees();
      });
    }
  }

  loadEmployees();

  // ─── Отправка формы ──────────────────────────────────────
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    // Валидация sheet URL
    const sheetUrl = sheetUrlInput.value.trim();
    const sheetId  = parseSheetId(sheetUrl);

    if (!sheetId) {
      showResult("error", "Некорректная ссылка на Google Sheet.");
      return;
    }

    // Собираем данные
    const fd = new FormData(form);
    const payload = {};
    fd.forEach((v, k) => { payload[k] = v; });

    // Дополняем
    payload.source   = "Из архива";
    payload.sheetUrl = sheetUrl;
    payload.sheetId  = sheetId;
    payload.sheetGid = parseSheetGid(sheetUrl) || "0";

    if (payload.reportType === "general") {
      payload.employee = "Все сотрудники";
    }

    // UI: лоадер
    submitBtn.disabled = true;
    submitLabel.textContent = "Отправка…";
    submitSpinner.hidden = false;
    resultBox.hidden = true;

    try {
      const url  = CONFIG.N8N_BASE + CONFIG.WEBHOOK_PATH;
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!resp.ok) throw new Error("Сервер ответил " + resp.status);
      await resp.json();

      showResult("ok", "Запрос принят! Отчёт будет отправлен в Telegram после обработки.");
    } catch (err) {
      showResult("error", "Ошибка отправки: " + err.message);
    } finally {
      submitBtn.disabled = false;
      submitLabel.textContent = "Сформировать отчёт";
      submitSpinner.hidden = true;
    }
  });

  // ─── Показать результат ──────────────────────────────────
  function showResult(type, msg) {
    resultBox.hidden = false;
    resultBox.className = "result result--" + type;
    resultBox.textContent = (type === "ok" ? "✅ " : "❌ ") + msg;
  }
});
