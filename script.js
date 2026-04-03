const state = {
  expenses: [],
  filtered: [],
  monthFilter: 'all',
  scopeFilter: 'todos',
  search: ''
};

const els = {
  monthFilter: document.getElementById('month-filter'),
  scopeFilter: document.getElementById('scope-filter'),
  searchFilter: document.getElementById('search-filter'),
  summaryPersonal: document.getElementById('summary-personal'),
  summaryNegocio: document.getElementById('summary-negocio'),
  summaryTotal: document.getElementById('summary-total'),
  selectedMonthTitle: document.getElementById('selected-month-title'),
  selectedMonthCount: document.getElementById('selected-month-count'),
  monthBreakdown: document.getElementById('month-breakdown'),
  monthlyTableBody: document.getElementById('monthly-table-body'),
  expensesList: document.getElementById('expenses-list'),
  reloadData: document.getElementById('reload-data')
};

function formatCurrency(value) {
  return new Intl.NumberFormat('es-HN', { style: 'currency', currency: 'HNL', maximumFractionDigits: 2 }).format(Number(value || 0)).replace('HNL', 'L');
}

function formatDate(dateString, withTime = false) {
  if (!dateString) return '—';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString;
  return new Intl.DateTimeFormat('es-HN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: withTime ? '2-digit' : undefined,
    minute: withTime ? '2-digit' : undefined
  }).format(date);
}

function monthKeyFromDate(dateString) {
  const value = String(dateString || '');
  return value.slice(0, 7);
}

function formatMonthLabel(monthKey) {
  if (!monthKey || monthKey === 'all') return 'Todos los meses';
  const [year, month] = monthKey.split('-').map(Number);
  const date = new Date(year, (month || 1) - 1, 1);
  return new Intl.DateTimeFormat('es-HN', { month: 'long', year: 'numeric' }).format(date);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeExpense(entry = {}) {
  const quantity = entry.quantity === '' || entry.quantity === null || entry.quantity === undefined ? null : Number(entry.quantity);
  const unitCost = entry.unitCost === '' || entry.unitCost === null || entry.unitCost === undefined ? null : Number(entry.unitCost);
  const total = Number(entry.total || ((quantity || 0) * (unitCost || 0)) || 0);

  return {
    uid: entry.uid || `exp_${Math.random().toString(36).slice(2, 10)}`,
    scope: entry.scope === 'negocio' ? 'negocio' : 'personal',
    title: String(entry.title || '').trim(),
    description: String(entry.description || '').trim(),
    quantity: Number.isFinite(quantity) ? quantity : null,
    unitCost: Number.isFinite(unitCost) ? unitCost : null,
    total,
    purchaseDate: String(entry.purchaseDate || '').trim(),
    createdAt: String(entry.createdAt || '').trim(),
    updatedAt: String(entry.updatedAt || '').trim(),
    notes: String(entry.notes || '').trim(),
    images: Array.isArray(entry.images) ? entry.images.filter(Boolean) : [],
    quickMode: Boolean(entry.quickMode)
  };
}

function createModal() {
  const template = document.getElementById('receipt-modal-template');
  const fragment = template.content.cloneNode(true);
  document.body.appendChild(fragment);
  const modal = document.getElementById('receipt-modal');
  const image = document.getElementById('receipt-modal-image');
  const close = document.getElementById('close-receipt-modal');
  const hide = () => modal.classList.add('hidden');
  close.addEventListener('click', hide);
  modal.addEventListener('click', (event) => {
    if (event.target === modal) hide();
  });
  return { modal, image, hide };
}

const receiptModal = createModal();

function openReceipt(src) {
  receiptModal.image.src = src;
  receiptModal.modal.classList.remove('hidden');
}

function getAvailableMonths(expenses) {
  const keys = [...new Set(expenses.map(item => monthKeyFromDate(item.purchaseDate)).filter(Boolean))].sort().reverse();
  return keys;
}

function fillMonthOptions() {
  const months = getAvailableMonths(state.expenses);
  const previous = state.monthFilter;
  els.monthFilter.innerHTML = `<option value="all">Todos los meses</option>` + months.map(month => `<option value="${month}">${formatMonthLabel(month)}</option>`).join('');
  state.monthFilter = months.includes(previous) || previous === 'all' ? previous : (months[0] || 'all');
  els.monthFilter.value = state.monthFilter;
}

function computeMonthlySummary(expenses) {
  const summaryMap = new Map();
  expenses.forEach(item => {
    const key = monthKeyFromDate(item.purchaseDate) || 'sin-fecha';
    const current = summaryMap.get(key) || { month: key, personal: 0, negocio: 0, total: 0 };
    if (item.scope === 'negocio') current.negocio += item.total;
    else current.personal += item.total;
    current.total += item.total;
    summaryMap.set(key, current);
  });
  return [...summaryMap.values()].sort((a, b) => b.month.localeCompare(a.month));
}

function applyFilters() {
  const filtered = state.expenses.filter(item => {
    const monthMatch = state.monthFilter === 'all' || monthKeyFromDate(item.purchaseDate) === state.monthFilter;
    const scopeMatch = state.scopeFilter === 'todos' || item.scope === state.scopeFilter;
    const haystack = `${item.title} ${item.description} ${item.notes}`.toLowerCase();
    const searchMatch = !state.search || haystack.includes(state.search);
    return monthMatch && scopeMatch && searchMatch;
  }).sort((a, b) => {
    const byPurchase = String(b.purchaseDate).localeCompare(String(a.purchaseDate));
    if (byPurchase !== 0) return byPurchase;
    return String(b.createdAt).localeCompare(String(a.createdAt));
  });

  state.filtered = filtered;
  renderSelectedMonthSummary();
  renderMonthlyTable();
  renderExpenses();
}

function renderSelectedMonthSummary() {
  const monthBase = state.monthFilter === 'all'
    ? state.expenses
    : state.expenses.filter(item => monthKeyFromDate(item.purchaseDate) === state.monthFilter);

  const personal = monthBase.filter(item => item.scope === 'personal').reduce((sum, item) => sum + item.total, 0);
  const negocio = monthBase.filter(item => item.scope === 'negocio').reduce((sum, item) => sum + item.total, 0);
  const total = personal + negocio;

  els.summaryPersonal.textContent = formatCurrency(personal);
  els.summaryNegocio.textContent = formatCurrency(negocio);
  els.summaryTotal.textContent = formatCurrency(total);
  els.selectedMonthTitle.textContent = `Resumen de ${formatMonthLabel(state.monthFilter)}`;
  els.selectedMonthCount.textContent = `${state.filtered.length} movimiento${state.filtered.length === 1 ? '' : 's'}`;

  els.monthBreakdown.innerHTML = [
    { label: 'Personal', value: personal, helper: 'Gastos del mes seleccionando solo lo personal.' },
    { label: 'Negocios', value: negocio, helper: 'Compras o gastos de negocio registrados.' },
    { label: 'Total', value: total, helper: 'Suma total entre personal y negocio.' }
  ].map(item => `
    <article class="breakdown-box">
      <span>${item.label}</span>
      <strong>${formatCurrency(item.value)}</strong>
      <small>${item.helper}</small>
    </article>
  `).join('');
}

function renderMonthlyTable() {
  const rows = computeMonthlySummary(state.expenses);
  if (!rows.length) {
    els.monthlyTableBody.innerHTML = `<tr><td colspan="4"><div class="empty-state">Aún no hay movimientos guardados en <code>expenses.json</code>.</div></td></tr>`;
    return;
  }
  els.monthlyTableBody.innerHTML = rows.map(row => `
    <tr>
      <td>${escapeHtml(formatMonthLabel(row.month))}</td>
      <td>${escapeHtml(formatCurrency(row.personal))}</td>
      <td>${escapeHtml(formatCurrency(row.negocio))}</td>
      <td>${escapeHtml(formatCurrency(row.total))}</td>
    </tr>
  `).join('');
}

function renderExpenses() {
  if (!state.filtered.length) {
    els.expensesList.innerHTML = `<div class="empty-state">No hay movimientos que coincidan con el filtro actual.</div>`;
    return;
  }

  els.expensesList.innerHTML = state.filtered.map(item => {
    const title = item.title || (item.scope === 'negocio' ? 'Gasto de negocio' : 'Gasto personal');
    const edited = item.updatedAt && item.updatedAt !== item.createdAt;
    const calcInfo = item.quantity && item.unitCost
      ? `${item.quantity} × ${formatCurrency(item.unitCost)}`
      : (item.quickMode ? 'Registro rápido por total directo' : 'Total manual');

    return `
      <article class="expense-card">
        <div>
          <h3>${escapeHtml(title)}</h3>
          <p>${escapeHtml(item.description || 'Sin descripción adicional.')}</p>
          <div class="meta-strip">
            <span class="pill ${item.scope}">${item.scope === 'negocio' ? 'Negocios' : 'Personal'}</span>
            <span class="pill neutral">Compra: ${escapeHtml(formatDate(item.purchaseDate))}</span>
            <span class="pill neutral">Agregado: ${escapeHtml(formatDate(item.createdAt, true))}</span>
            ${edited ? `<span class="pill edited">Editado: ${escapeHtml(formatDate(item.updatedAt, true))}</span>` : ''}
          </div>
          <div class="meta-strip">
            <span class="pill neutral">${escapeHtml(calcInfo)}</span>
            ${item.notes ? `<span class="pill neutral">Nota: ${escapeHtml(item.notes)}</span>` : ''}
          </div>
          ${item.images.length ? `
            <div class="receipt-strip">
              ${item.images.map(src => `<img class="receipt-thumb" src="${escapeHtml(src)}" alt="Factura" data-receipt-src="${escapeHtml(src)}">`).join('')}
            </div>
          ` : ''}
        </div>
        <div class="amount-box">
          <div class="amount">${escapeHtml(formatCurrency(item.total))}</div>
          <div class="minor">${item.quantity ? `${escapeHtml(String(item.quantity))} unidades` : 'Sin cantidad específica'}</div>
        </div>
      </article>
    `;
  }).join('');

  els.expensesList.querySelectorAll('[data-receipt-src]').forEach(img => {
    img.addEventListener('click', () => openReceipt(img.dataset.receiptSrc));
  });
}

async function loadExpenses() {
  els.reloadData.disabled = true;
  try {
    const res = await fetch(`expenses.json?v=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`No se pudo leer expenses.json (${res.status}).`);
    const data = await res.json();
    state.expenses = Array.isArray(data) ? data.map(normalizeExpense) : [];
    fillMonthOptions();
    applyFilters();
  } catch (error) {
    console.error(error);
    els.expensesList.innerHTML = `<div class="empty-state">${escapeHtml(error.message || 'No se pudieron cargar los datos.')}</div>`;
    els.monthlyTableBody.innerHTML = '';
    els.monthBreakdown.innerHTML = '';
  } finally {
    els.reloadData.disabled = false;
  }
}

els.monthFilter.addEventListener('change', () => {
  state.monthFilter = els.monthFilter.value;
  applyFilters();
});
els.scopeFilter.addEventListener('change', () => {
  state.scopeFilter = els.scopeFilter.value;
  applyFilters();
});
els.searchFilter.addEventListener('input', () => {
  state.search = String(els.searchFilter.value || '').trim().toLowerCase();
  applyFilters();
});
els.reloadData.addEventListener('click', loadExpenses);

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') receiptModal.hide();
});

loadExpenses();
