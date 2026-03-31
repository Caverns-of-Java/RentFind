/* ===========================
   CONFIGURATION
   =========================== */
const CONFIG = {
    API_URL: 'https://script.google.com/macros/s/AKfycbwFD_npEcxDkanBhE4s5eV94J_NCPHbSr1B4AIyrq7IchZrMFD_8bTnuop2brKOl1bv/exec'
};

/* ===========================
   APP STATE
   =========================== */
const appState = {
    items: [],
    selectedItem: null,
    isLoading: false,
    error: null
};

/* ===========================
   DOM REFERENCES
   =========================== */
const dom = {
    // State regions
    loadingState: document.getElementById('loadingState'),
    errorState: document.getElementById('errorState'),
    emptyState: document.getElementById('emptyState'),
    errorMessage: document.getElementById('errorMessage'),
    retryButton: document.getElementById('retryButton'),

    // List view
    listView: document.getElementById('listView'),
    itemList: document.getElementById('itemList'),

    // Detail panel
    detailPanel: document.getElementById('detailPanel'),
    detailContent: document.getElementById('detailContent'),
    closeDetailButton: document.getElementById('closeDetailButton')
};

/* ===========================
   STATE MANAGEMENT
   =========================== */

/**
 * Update app state and trigger UI re-render
 */
function updateAppState(updates) {
    Object.assign(appState, updates);
    render();
}

/**
 * Show state: loading
 */
function setLoadingState() {
    updateAppState({ isLoading: true, error: null });
}

/**
 * Show state: error
 */
function setErrorState(message) {
    updateAppState({ isLoading: false, error: message });
}

/**
 * Show state: success
 */
function setSuccessState(items) {
    updateAppState({ isLoading: false, error: null, items });
}

/**
 * Select an item and open detail panel
 */
function selectItem(item) {
    updateAppState({ selectedItem: item });
    dom.detailPanel.classList.remove('hidden');
}

/**
 * Deselect item and close detail panel
 */
function deselectItem() {
    updateAppState({ selectedItem: null });
    dom.detailPanel.classList.add('hidden');
}

/* ===========================
   RENDERING
   =========================== */

/**
 * Main render function - reflects app state to UI
 */
function render() {
    renderStateRegion();
    renderListView();
    renderDetailPanel();
}

/**
 * Render loading/error/empty states
 */
function renderStateRegion() {
    // Hide all state boxes first
    dom.loadingState.classList.add('hidden');
    dom.errorState.classList.add('hidden');
    dom.emptyState.classList.add('hidden');

    if (appState.isLoading) {
        dom.loadingState.classList.remove('hidden');
    } else if (appState.error) {
        dom.errorMessage.textContent = appState.error;
        dom.errorState.classList.remove('hidden');
    } else if (appState.items.length === 0) {
        dom.emptyState.classList.remove('hidden');
    }
}

/**
 * Render list of items
 */
function renderListView() {
    if (appState.isLoading || appState.error || appState.items.length === 0) {
        dom.listView.classList.add('hidden');
        return;
    }

    dom.listView.classList.remove('hidden');
    dom.itemList.innerHTML = '';

    appState.items.forEach((item) => {
        const li = document.createElement('li');
        li.className = 'item-card';
        if (appState.selectedItem === item) {
            li.classList.add('active');
        }

        // Build title from suburb and address
        const parts = [];
        if (item.Suburb) parts.push(item.Suburb);
        if (item.Address) parts.push(item.Address);
        const name = parts.length > 0 ? parts.join(' - ') : 'Untitled';
        
        const summary = item.PerWeek ? `$${item.PerWeek}/week` : item.Status || '';
        const inspectTime = parseDateInspectTime(item.DateInspectTime);

        li.innerHTML = `
            <div class="item-name">${escapeHtml(name)}</div>
            <div class="item-summary-row">
                <div class="item-summary">${escapeHtml(summary)}</div>
                ${inspectTime ? `<div class="item-inspect-time">${escapeHtml(inspectTime)}</div>` : ''}
            </div>
        `;

        li.addEventListener('click', () => selectItem(item));
        dom.itemList.appendChild(li);
    });
}

/**
 * Render detail panel for selected item
 */
function renderDetailPanel() {
    if (!appState.selectedItem) {
        dom.detailPanel.classList.add('hidden');
        return;
    }

    dom.detailPanel.classList.remove('hidden');
    const item = appState.selectedItem;

    let html = '';

    // Iterate over item properties and display non-empty ones
    for (const [key, value] of Object.entries(item)) {
        if (value !== null && value !== undefined && value !== '') {
            const label = formatFieldLabel(key);
            const displayValue = typeof value === 'object' ? JSON.stringify(value, null, 2) : value;

            html += `
                <div class="detail-field">
                    <div class="detail-label">${escapeHtml(label)}</div>
                    <div class="detail-value">${escapeHtml(String(displayValue))}</div>
                </div>
            `;
        }
    }

    dom.detailContent.innerHTML = html || '<p>No details available.</p>';
}

/**
 * Convert camelCase/snake_case to Title Case
 */
function formatFieldLabel(key) {
    return key
        .replace(/([A-Z])/g, ' $1')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase())
        .trim();
}

/**
 * Parse DateInspectTime from YYYYMMDDTHHMM to DD/MM/YY HH:MM
 * If multiple dates (comma-separated), return the first one
 */
function parseDateInspectTime(dateTimeStr) {
    if (!dateTimeStr) return '';
    
    // Split by comma and take the first date
    const firstDateTime = dateTimeStr.split(',')[0].trim();
    
    // Format: YYYYMMDDTHHMM
    if (firstDateTime.length !== 13 || firstDateTime[8] !== 'T') {
        return '';
    }
    
    const year = firstDateTime.substring(0, 4);
    const month = firstDateTime.substring(4, 6);
    const day = firstDateTime.substring(6, 8);
    const hour = firstDateTime.substring(9, 11);
    const minute = firstDateTime.substring(11, 13);
    
    // Convert YYYY to YY
    const shortYear = year.substring(2);
    
    return `${day}/${month}/${shortYear} ${hour}:${minute}`;
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/* ===========================
   API FETCHING
   =========================== */

/**
 * Fetch data from API
 */
async function fetchData() {
    setLoadingState();

    try {
        const response = await fetch(CONFIG.API_URL);

        if (!response.ok) {
            throw new Error(`API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();

        // Validate response is array
        if (!Array.isArray(data)) {
            throw new Error('API response is not an array');
        }

        setSuccessState(data);
    } catch (err) {
        console.error('Fetch error:', err);
        setErrorState(`Error: ${err.message}`);
    }
}

/* ===========================
   EVENT LISTENERS
   =========================== */

/**
 * Setup event listeners
 */
function setupEventListeners() {
    dom.retryButton.addEventListener('click', fetchData);
    dom.closeDetailButton.addEventListener('click', deselectItem);
}

/* ===========================
   INITIALIZATION
   =========================== */

/**
 * Initialize app on DOM ready
 */
function init() {
    console.log('App initialized');
    setupEventListeners();
    fetchData();
}

// Start when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
