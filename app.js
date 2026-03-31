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
    statusRegion: document.querySelector('.status-region'),
    loadingState: document.getElementById('loadingState'),
    errorState: document.getElementById('errorState'),
    emptyState: document.getElementById('emptyState'),
    errorMessage: document.getElementById('errorMessage'),
    retryButton: document.getElementById('retryButton'),

    // List view
    contentWrapper: document.querySelector('.content-wrapper'),
    listView: document.getElementById('listView'),
    itemList: document.getElementById('itemList'),

    // Detail panel
    detailPanel: document.getElementById('detailPanel'),
    detailContent: document.getElementById('detailContent'),
    closeDetailButton: document.getElementById('closeDetailButton'),
    openDetailUrlButton: document.getElementById('openDetailUrlButton')
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
    dom.statusRegion.classList.remove('hidden');

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
    } else {
        dom.statusRegion.classList.add('hidden');
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

    // Sort by inspection time (earliest first)
    const sortedItems = [...appState.items].sort((a, b) => {
        const timeA = getNextInspectionTime(a.DateInspectTime);
        const timeB = getNextInspectionTime(b.DateInspectTime);
        
        // Items without valid times go to end
        if (!timeA) return 1;
        if (!timeB) return -1;
        
        return timeA - timeB;
    });

    // Categorize into sections
    const sections = categorizeSections(sortedItems);

    // Sort within sections: future times first, then past times
    sections.upcoming.sort((a, b) => {
        const timeA = getNextInspectionTime(a.DateInspectTime) || new Date(0);
        const timeB = getNextInspectionTime(b.DateInspectTime) || new Date(0);
        const now = new Date();

        const aIsPast = timeA < now;
        const bIsPast = timeB < now;

        // Future times first, then past times
        if (aIsPast === bIsPast) {
            return timeA - timeB;
        }
        return aIsPast ? 1 : -1;
    });

    // Render each section
    renderSection('Next Inspection', sections.next, 'next-section');
    renderSection('Shortlist', sections.upcoming, 'upcoming-section');
    renderSection('Closed', sections.closed, 'closed-section');
}

/**
 * Categorize items into three sections: next, upcoming, closed
 */
function categorizeSections(items) {
    const now = new Date();
    const categorized = {
        next: [],
        upcoming: [],
        closed: []
    };

    let nextItem = null;
    let nextTime = null;

    items.forEach((item) => {
        // Check if closed
        if (item.Status === 'Closed') {
            categorized.closed.push(item);
            return;
        }

        // Parse inspection time to find upcoming
        const inspectTime = getNextInspectionTime(item.DateInspectTime);
        if (inspectTime) {
            if (inspectTime > now) {
                // Future inspection
                if (!nextTime || inspectTime < nextTime) {
                    // Bump previous 'next' to 'upcoming'
                    if (nextItem) {
                        categorized.upcoming.push(nextItem);
                    }
                    // Set new 'next'
                    nextItem = item;
                    nextTime = inspectTime;
                } else {
                    categorized.upcoming.push(item);
                }
            } else {
                // Past inspection - still add to upcoming
                categorized.upcoming.push(item);
            }
        }
    });

    if (nextItem) {
        categorized.next.push(nextItem);
    }

    return categorized;
}

/**
 * Parse DateInspectTime and return the earliest upcoming inspection Date object.
 */
function getNextInspectionTime(dateTimeStr) {
    if (!dateTimeStr || typeof dateTimeStr !== 'string') return null;

    const timestamps = dateTimeStr
        .split(',')
        .map((part) => part.trim())
        .filter((part) => part.length === 13 && part[8] === 'T');

    if (timestamps.length === 0) return null;

    const parsed = timestamps.map((rawValue) => {
        const year = rawValue.substring(0, 4);
        const month = rawValue.substring(4, 6);
        const day = rawValue.substring(6, 8);
        const hour = rawValue.substring(9, 11);
        const minute = rawValue.substring(11, 13);
        return new Date(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hour), parseInt(minute));
    });

    return parsed.sort((a, b) => a - b)[0];
}

/**
 * Render a section with title and cards
 */
function renderSection(title, items, sectionClass) {
    if (items.length === 0) return;

    const sectionDiv = document.createElement('div');
    sectionDiv.className = `list-section ${sectionClass}`;

    const sectionTitle = document.createElement('h2');
    sectionTitle.className = 'list-section-title';
    sectionTitle.textContent = title;

    const sectionList = document.createElement('ul');
    sectionList.className = 'section-item-list';

    items.forEach((item) => {
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
        const fieldsHtml = Object.entries(item)
            .filter(([key]) => {
                const normalizedKey = key.toLowerCase();
                return normalizedKey !== 'id' && normalizedKey !== 'address' && normalizedKey !== 'suburb' && normalizedKey !== 'url';
            })
            .filter(([, value]) => value !== null && value !== undefined && value !== '')
            .map(([key, value]) => {
                const label = formatFieldLabel(key);
                const displayValue = formatItemValue(key, value);

                // Check if this is a past inspection time and apply strikethrough
                let fieldValueClass = 'item-field-value';
                if (key === 'DateInspectTime') {
                    const inspectTime = getNextInspectionTime(value);
                    if (inspectTime && inspectTime < new Date()) {
                        fieldValueClass += ' past-inspection';
                    }
                }

                return `
                    <div class="item-field-row">
                        <span class="item-field-label">${escapeHtml(label)}</span>
                        <span class="${fieldValueClass}">${escapeHtml(displayValue)}</span>
                    </div>
                `;
            })
            .join('');

        li.innerHTML = `
            <div class="item-name">${escapeHtml(name)}</div>
            <div class="item-fields">${fieldsHtml}</div>
        `;

        li.addEventListener('click', () => selectItem(item));
        sectionList.appendChild(li);
    });

    sectionDiv.appendChild(sectionTitle);
    sectionDiv.appendChild(sectionList);
    dom.itemList.appendChild(sectionDiv);
}

/**
 * Render detail panel for selected item
 */
function renderDetailPanel() {
    if (!appState.selectedItem) {
        dom.detailPanel.classList.add('hidden');
        dom.contentWrapper.classList.remove('detail-open');
        dom.openDetailUrlButton.classList.add('hidden');
        dom.openDetailUrlButton.setAttribute('href', '#');
        return;
    }

    dom.detailPanel.classList.remove('hidden');
    dom.contentWrapper.classList.add('detail-open');
    const item = appState.selectedItem;
    const itemUrl = getItemUrl(item);

    if (itemUrl) {
        dom.openDetailUrlButton.classList.remove('hidden');
        dom.openDetailUrlButton.setAttribute('href', itemUrl);
        dom.detailContent.innerHTML = `
            <div class="iframe-wrapper">
                <iframe
                    id="detailListingFrame"
                    class="detail-iframe"
                    title="Listing preview"
                    loading="lazy"
                    referrerpolicy="no-referrer"
                ></iframe>
            </div>
            <div id="iframeFallback" class="iframe-fallback hidden">
                <p>This listing cannot be embedded here.</p>
                <a class="open-tab-icon" href="${escapeHtml(itemUrl)}" target="_blank" rel="noopener noreferrer" aria-label="Open listing in new tab" title="Open in new tab">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-box-arrow-up-right" viewBox="0 0 16 16" aria-hidden="true">
                      <path fill-rule="evenodd" d="M8.636 3.5a.5.5 0 0 0-.5-.5H1.5A1.5 1.5 0 0 0 0 4.5v10A1.5 1.5 0 0 0 1.5 16h10a1.5 1.5 0 0 0 1.5-1.5V7.864a.5.5 0 0 0-1 0V14.5a.5.5 0 0 1-.5.5h-10a.5.5 0 0 1-.5-.5v-10a.5.5 0 0 1 .5-.5h6.636a.5.5 0 0 0 .5-.5"/>
                      <path fill-rule="evenodd" d="M16 .5a.5.5 0 0 0-.5-.5h-5a.5.5 0 0 0 0 1h3.793L6.146 9.146a.5.5 0 1 0 .708.708L15 1.707V5.5a.5.5 0 0 0 1 0z"/>
                    </svg>
                    <span class="sr-only">Open in new tab</span>
                </a>
            </div>
        `;

        const iframe = document.getElementById('detailListingFrame');
        const fallback = document.getElementById('iframeFallback');
        let resolved = false;

        const showFallback = () => {
            if (resolved) return;
            resolved = true;
            fallback.classList.remove('hidden');
        };

        const loadTimeout = window.setTimeout(showFallback, 3000);

        iframe.addEventListener('load', () => {
            if (resolved) return;
            resolved = true;
            window.clearTimeout(loadTimeout);
            fallback.classList.add('hidden');
        });

        iframe.addEventListener('error', () => {
            window.clearTimeout(loadTimeout);
            showFallback();
        });

        iframe.src = itemUrl;
        return;
    }

    dom.openDetailUrlButton.classList.add('hidden');
    dom.openDetailUrlButton.setAttribute('href', '#');
    dom.detailContent.innerHTML = '<p>No URL available for this listing.</p>';
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
 * Parse DateInspectTime values from YYYYMMDDTHHMM to DD/MM/YY HH:MM.
 */
function formatInspectTimes(dateTimeStr) {
    if (!dateTimeStr || typeof dateTimeStr !== 'string') return '';

    const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    const parsed = dateTimeStr
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean)
        .map((rawValue) => {
            if (rawValue.length !== 13 || rawValue[8] !== 'T') {
                return rawValue;
            }

            const year = rawValue.substring(0, 4);
            const month = rawValue.substring(4, 6);
            const day = rawValue.substring(6, 8);
            const hour = rawValue.substring(9, 11);
            const minute = rawValue.substring(11, 13);

            // Create Date to get weekday
            const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hour), parseInt(minute));
            const weekday = weekdays[date.getDay()];

            return `(${weekday}) ${day}/${month}/${year.substring(2)} ${hour}:${minute}`;
        });

    return parsed.join('\n');
}

/**
 * Format display values for known fields.
 */
function formatItemValue(key, value) {
    if (key.toLowerCase() === 'dateinspecttime') {
        return formatInspectTimes(String(value)) || String(value);
    }

    if (key.toLowerCase() === 'perweek') {
        return `$${value}/week`;
    }

    if (typeof value === 'object') {
        return JSON.stringify(value);
    }

    return String(value);
}

/**
 * Resolve URL field from API item.
 */
function getItemUrl(item) {
    const rawUrl = item.URL || item.Url || item.url || '';
    if (typeof rawUrl !== 'string') {
        return '';
    }

    const trimmedUrl = rawUrl.trim();
    if (!trimmedUrl) {
        return '';
    }

    if (!/^https?:\/\//i.test(trimmedUrl)) {
        return '';
    }

    return trimmedUrl;
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
