// Main JavaScript file for Simple Recipe Book PWA
document.addEventListener('DOMContentLoaded', function() {
    console.log('Simple Recipe Book App loaded!');
    
    // Initialize the app
    initApp();
});

function initApp() {
    // Add fade-in animation to main content
    const app = document.getElementById('app');
    if (app) {
        app.classList.add('fade-in');
    }

    // Inject simple app styling (keeps everything self-contained)
    injectStyles();

    // Render the app UI
    renderApp();

    // Register service worker for PWA functionality
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('service-worker.js')
            .then(registration => {
                console.log('Service Worker registered successfully:', registration);
            })
            .catch(error => {
                console.log('Service Worker registration failed:', error);
            });
    }

    // Handle install prompt (capture for custom install button)
    window.deferredPrompt = null;
    window.addEventListener('beforeinstallprompt', function(e) {
        e.preventDefault();
        window.deferredPrompt = e;
        showInstallButton();
    });

    // Sync queued actions when back online
    window.addEventListener('online', processSyncQueue);
}

// Basic storage keys and helpers
const STORAGE_KEY = 'simpleRecipeBook.recipes.v1';
const SYNC_KEY = 'simpleRecipeBook.syncQueue.v1';
const APP_TITLE = 'Simple Recipe Book';

function loadRecipes() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            // Seed with sample recipes
            const sample = [
                {
                    id: String(Date.now() - 2000),
                    title: 'Classic Pancakes',
                    ingredients: '1 cup flour\n1 cup milk\n1 egg\n1 tbsp sugar\nPinch of salt\n1 tsp baking powder',
                    instructions: '1. Mix dry ingredients.\n2. Add milk and egg; whisk.\n3. Cook on hot griddle until golden.',
                    tags: ['breakfast', 'easy'],
                    created: Date.now() - 2000
                },
                {
                    id: String(Date.now() - 1000),
                    title: 'Simple Tomato Pasta',
                    ingredients: '200g pasta\n2 tomatoes\n1 clove garlic\nOlive oil\nSalt and pepper\nBasil',
                    instructions: '1. Cook pasta.\n2. Sauté garlic and tomatoes.\n3. Toss pasta with sauce and basil.',
                    tags: ['dinner', 'vegetarian'],
                    created: Date.now() - 1000
                }
            ];
            saveRecipes(sample);
            return sample;
        }
        return JSON.parse(raw);
    } catch (e) {
        console.error('Failed to load recipes:', e);
        return [];
    }
}

function saveRecipes(recipes) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(recipes));
    } catch (e) {
        console.error('Failed to save recipes:', e);
    }
}

function getRecipeById(id) {
    const recipes = loadRecipes();
    return recipes.find(r => r.id === id);
}

function addToSyncQueue(action, payload) {
    try {
        const raw = localStorage.getItem(SYNC_KEY);
        const queue = raw ? JSON.parse(raw) : [];
        queue.push({ timestamp: Date.now(), action, payload });
        localStorage.setItem(SYNC_KEY, JSON.stringify(queue));
        console.log('Queued action for sync:', action);
    } catch (e) {
        console.error('Failed to add to sync queue', e);
    }
}

function processSyncQueue() {
    // For this simple app, we just clear the queue and show a notification.
    try {
        const raw = localStorage.getItem(SYNC_KEY);
        if (!raw) return;
        const queue = JSON.parse(raw);
        if (queue.length === 0) return;
        // In a real app you'd send these to a server. Here we simulate success.
        localStorage.removeItem(SYNC_KEY);
        showToast(`Synced ${queue.length} offline action(s)`);
        showNotification(`${queue.length} offline changes synced`);
    } catch (e) {
        console.error('Failed to process sync queue', e);
    }
}

// UI rendering
function renderApp() {
    const app = document.getElementById('app');
    if (!app) return;

    const content = `
        <header class="rb-header">
            <h1>${APP_TITLE}</h1>
            <div class="rb-controls">
                <input id="searchInput" class="rb-search" placeholder="Search recipes..." />
                <button id="btnAdd" class="rb-btn">+ Add Recipe</button>
                <button id="btnExport" class="rb-btn secondary">Export</button>
                <button id="btnImport" class="rb-btn secondary">Import</button>
                <button id="btnInstall" class="rb-btn install hidden">Install</button>
            </div>
        </header>
        <main class="rb-main">
            <aside class="rb-sidebar">
                <h3>Tags</h3>
                <ul id="tagList" class="tag-list"></ul>
            </aside>
            <section class="rb-list" id="recipeListArea">
                <!-- recipe list will be injected here -->
            </section>
        </main>

        <div id="toast" class="rb-toast hidden"></div>

        <!-- modal container -->
        <div id="modal" class="rb-modal hidden"></div>
    `;
    updateAppContent(content);

    // Hook up events
    document.getElementById('btnAdd').addEventListener('click', openAddRecipeForm);
    document.getElementById('btnExport').addEventListener('click', exportRecipes);
    document.getElementById('btnImport').addEventListener('click', openImportDialog);
    document.getElementById('searchInput').addEventListener('input', e => renderRecipeList(e.target.value));
    document.getElementById('btnInstall').addEventListener('click', handleInstallClick);

    // initial render
    renderTags();
    renderRecipeList();
}

// Render list of recipes with optional search filter
function renderRecipeList(filterText = '') {
    const area = document.getElementById('recipeListArea');
    if (!area) return;
    const recipes = loadRecipes();
    let filtered = recipes.slice().sort((a,b) => b.created - a.created);

    const q = filterText.trim().toLowerCase();
    if (q) {
        filtered = filtered.filter(r => {
            return r.title.toLowerCase().includes(q) ||
                   r.ingredients.toLowerCase().includes(q) ||
                   r.instructions.toLowerCase().includes(q) ||
                   (r.tags || []).join(' ').toLowerCase().includes(q);
        });
    }

    if (filtered.length === 0) {
        area.innerHTML = '<div class="empty">No recipes found. Add your first recipe!</div>';
        return;
    }

    const html = filtered.map(r => `
        <article class="recipe-card" data-id="${r.id}">
            <h2 class="recipe-title">${escapeHtml(r.title)}</h2>
            <div class="recipe-tags">${(r.tags||[]).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join(' ')}</div>
            <p class="recipe-snippet">${escapeHtml((r.instructions || '').split('\n')[0] || '').slice(0, 120)}</p>
            <div class="card-actions">
                <button class="rb-btn small view-btn">View</button>
                <button class="rb-btn small edit-btn">Edit</button>
                <button class="rb-btn small danger delete-btn">Delete</button>
            </div>
        </article>
    `).join('');

    area.innerHTML = html;

    // Attach handlers
    area.querySelectorAll('.view-btn').forEach(btn => {
        btn.addEventListener('click', e => {
            const id = e.target.closest('.recipe-card').dataset.id;
            openRecipeDetails(id);
        });
    });
    area.querySelectorAll('.edit-btn').forEach(btn => {
        btn.addEventListener('click', e => {
            const id = e.target.closest('.recipe-card').dataset.id;
            openEditRecipeForm(id);
        });
    });
    area.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', e => {
            const id = e.target.closest('.recipe-card').dataset.id;
            deleteRecipe(id);
        });
    });
}

// Show details modal
function openRecipeDetails(id) {
    const recipe = getRecipeById(id);
    if (!recipe) return showToast('Recipe not found');
    const modal = document.getElementById('modal');
    modal.innerHTML = `
        <div class="modal-content">
            <button class="modal-close rb-btn small">Close</button>
            <h2>${escapeHtml(recipe.title)}</h2>
            <div class="meta">Tags: ${(recipe.tags||[]).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join(' ')}</div>
            <h4>Ingredients</h4>
            <pre class="code">${escapeHtml(recipe.ingredients || '')}</pre>
            <h4>Instructions</h4>
            <pre class="code">${escapeHtml(recipe.instructions || '')}</pre>
            <div class="modal-actions">
                <button class="rb-btn edit-btn">Edit</button>
                <button class="rb-btn danger delete-btn">Delete</button>
            </div>
        </div>
    `;
    modal.classList.remove('hidden');
    modal.querySelector('.modal-close').addEventListener('click', closeModal);
    modal.querySelector('.edit-btn').addEventListener('click', () => {
        closeModal();
        openEditRecipeForm(id);
    });
    modal.querySelector('.delete-btn').addEventListener('click', () => {
        closeModal();
        deleteRecipe(id);
    });
}

function closeModal() {
    const modal = document.getElementById('modal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.innerHTML = '';
}

// Add recipe form
function openAddRecipeForm() {
    const modal = document.getElementById('modal');
    modal.innerHTML = recipeFormTemplate();
    modal.classList.remove('hidden');
    bindRecipeForm();
}

function openEditRecipeForm(id) {
    const recipe = getRecipeById(id);
    if (!recipe) return showToast('Recipe not found');
    const modal = document.getElementById('modal');
    modal.innerHTML = recipeFormTemplate(recipe);
    modal.classList.remove('hidden');
    bindRecipeForm(id);
}

function recipeFormTemplate(recipe = {}) {
    const title = escapeHtml(recipe.title || '');
    const ingredients = escapeHtml(recipe.ingredients || '');
    const instructions = escapeHtml(recipe.instructions || '');
    const tags = escapeHtml((recipe.tags || []).join(', '));
    return `
        <div class="modal-content">
            <button class="modal-close rb-btn small">Close</button>
            <h2>${recipe.id ? 'Edit Recipe' : 'Add Recipe'}</h2>
            <label>Title<input id="rTitle" value="${title}" placeholder="e.g. Grandma's Pie" /></label>
            <label>Tags (comma separated)<input id="rTags" value="${tags}" placeholder="breakfast, quick" /></label>
            <label>Ingredients<textarea id="rIngredients" rows="6" placeholder="List ingredients...">${ingredients}</textarea></label>
            <label>Instructions<textarea id="rInstructions" rows="8" placeholder="Step by step...">${instructions}</textarea></label>
            <div class="modal-actions">
                <button id="saveRecipeBtn" class="rb-btn">${recipe.id ? 'Save Changes' : 'Add Recipe'}</button>
                <button class="rb-btn secondary modal-cancel">Cancel</button>
            </div>
        </div>
    `;
}

function bindRecipeForm(id = null) {
    const modal = document.getElementById('modal');
    modal.querySelector('.modal-close').addEventListener('click', closeModal);
    modal.querySelector('.modal-cancel').addEventListener('click', closeModal);
    modal.querySelector('#saveRecipeBtn').addEventListener('click', () => {
        const title = modal.querySelector('#rTitle').value.trim();
        const tagsRaw = modal.querySelector('#rTags').value.trim();
        const ingredients = modal.querySelector('#rIngredients').value.trim();
        const instructions = modal.querySelector('#rInstructions').value.trim();

        if (!title) return showToast('Please provide a title');

        const tags = tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean) : [];

        if (id) {
            // edit
            const recipes = loadRecipes();
            const idx = recipes.findIndex(r => r.id === id);
            if (idx === -1) return showToast('Recipe not found');
            recipes[idx] = {
                ...recipes[idx],
                title, tags, ingredients, instructions
            };
            saveRecipes(recipes);
            showToast('Recipe updated');
            addToSyncQueue('update', recipes[idx]);
            showNotification(`Updated: ${title}`);
        } else {
            // add new
            const recipes = loadRecipes();
            const newRecipe = {
                id: String(Date.now()),
                title, tags, ingredients, instructions,
                created: Date.now()
            };
            recipes.push(newRecipe);
            saveRecipes(recipes);
            showToast('Recipe added');
            addToSyncQueue('create', newRecipe);
            showNotification(`Added: ${title}`);
        }
        closeModal();
        renderTags();
        renderRecipeList(document.getElementById('searchInput').value || '');
    });
}

// Delete recipe
function deleteRecipe(id) {
    if (!confirm('Delete this recipe? This action cannot be undone.')) return;
    const recipes = loadRecipes();
    const idx = recipes.findIndex(r => r.id === id);
    if (idx === -1) return showToast('Recipe not found');
    const [removed] = recipes.splice(idx, 1);
    saveRecipes(recipes);
    addToSyncQueue('delete', { id });
    showToast('Recipe deleted');
    showNotification(`Deleted: ${removed.title}`);
    renderTags();
    renderRecipeList(document.getElementById('searchInput').value || '');
}

// Tags sidebar
function renderTags() {
    const recipes = loadRecipes();
    const tagMap = {};
    recipes.forEach(r => (r.tags || []).forEach(t => tagMap[t] = (tagMap[t] || 0) + 1));
    const tags = Object.keys(tagMap).sort();
    const list = document.getElementById('tagList');
    if (!list) return;
    if (tags.length === 0) {
        list.innerHTML = '<li class="no-tags">No tags yet</li>';
        return;
    }
    list.innerHTML = tags.map(t => `<li><button class="tag-filter rb-btn small">${escapeHtml(t)} <span class="count">${tagMap[t]}</span></button></li>`).join('');
    list.querySelectorAll('.tag-filter').forEach(btn => {
        btn.addEventListener('click', e => {
            const tag = e.target.innerText.replace(/\s*\d+$/, '').trim();
            document.getElementById('searchInput').value = tag;
            renderRecipeList(tag);
        });
    });
}

// Export/Import
function exportRecipes() {
    const recipes = loadRecipes();
    const dataStr = JSON.stringify(recipes, null, 2);
    // Create downloadable blob
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'recipes.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast('Recipes exported');
}

function openImportDialog() {
    const modal = document.getElementById('modal');
    modal.innerHTML = `
        <div class="modal-content">
            <button class="modal-close rb-btn small">Close</button>
            <h2>Import Recipes</h2>
            <p>Paste the JSON exported from this app. Imported recipes will be appended.</p>
            <textarea id="importArea" rows="10" placeholder='[{"title":"...","ingredients":"..."}]'></textarea>
            <div class="modal-actions">
                <button id="doImport" class="rb-btn">Import</button>
                <button class="rb-btn secondary modal-cancel">Cancel</button>
            </div>
        </div>
    `;
    modal.classList.remove('hidden');
    modal.querySelector('.modal-close').addEventListener('click', closeModal);
    modal.querySelector('.modal-cancel').addEventListener('click', closeModal);
    modal.querySelector('#doImport').addEventListener('click', () => {
        const raw = modal.querySelector('#importArea').value.trim();
        if (!raw) return showToast('Paste import data first');
        try {
            const imported = JSON.parse(raw);
            if (!Array.isArray(imported)) throw new Error('Import data should be an array');
            const recipes = loadRecipes();
            let count = 0;
            imported.forEach(item => {
                if (!item.title) return;
                const newRecipe = {
                    id: String(Date.now()) + Math.floor(Math.random()*1000),
                    title: item.title,
                    ingredients: item.ingredients || '',
                    instructions: item.instructions || '',
                    tags: item.tags || [],
                    created: Date.now()
                };
                recipes.push(newRecipe);
                addToSyncQueue('create', newRecipe);
                count++;
            });
            saveRecipes(recipes);
            showToast(`Imported ${count} recipe(s)`);
            showNotification(`Imported ${count} recipe(s)`);
            renderTags();
            renderRecipeList();
            closeModal();
        } catch (e) {
            showToast('Invalid JSON: ' + e.message);
        }
    });
}

// Toast helper
let toastTimeout = null;
function showToast(message, ms = 3000) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = message;
    t.classList.remove('hidden');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => t.classList.add('hidden'), ms);
}

// Notifications
function showNotification(message) {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') {
        try {
            new Notification(APP_TITLE, { body: message, icon: '' });
        } catch (e) {
            console.warn('Notification failed', e);
        }
    } else if (Notification.permission !== 'denied') {
        Notification.requestPermission().then(permission => {
            if (permission === 'granted') {
                try {
                    new Notification(APP_TITLE, { body: message, icon: '' });
                } catch (e) {
                    console.warn('Notification failed', e);
                }
            }
        });
    }
}

// Simple install button handling
function showInstallButton() {
    const btn = document.getElementById('btnInstall');
    if (!btn) return;
    btn.classList.remove('hidden');
}

function handleInstallClick() {
    const prompt = window.deferredPrompt;
    if (!prompt) return showToast('Install prompt not available');
    prompt.prompt();
    prompt.userChoice.then(choice => {
        if (choice.outcome === 'accepted') {
            showToast('App installed');
        } else {
            showToast('Install cancelled');
        }
        window.deferredPrompt = null;
        document.getElementById('btnInstall').classList.add('hidden');
    });
}

// Utility helpers
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function updateAppContent(content) {
    const app = document.getElementById('app');
    if (app) {
        app.innerHTML = content;
    }
}

// Simple CSS injector for app look-and-feel
function injectStyles() {
    if (document.getElementById('rb-styles')) return;
    const css = `
    /* Simple Recipe Book styles */
    .fade-in { animation: fadeIn 400ms ease both; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(6px);} to { opacity: 1; transform: none; } }
    .rb-header { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:16px; background:linear-gradient(90deg,#ffecd2,#fcb69f); border-bottom:1px solid rgba(0,0,0,0.06); }
    .rb-header h1 { margin:0; font-size:1.25rem; color:#5a2a27; }
    .rb-controls { display:flex; gap:8px; align-items:center; }
    .rb-search { padding:8px 10px; border-radius:6px; border:1px solid rgba(0,0,0,0.08); min-width:200px; }
    .rb-btn { padding:8px 10px; border:none; background:#5a2a27; color:white; border-radius:6px; cursor:pointer; }
    .rb-btn.secondary { background:#eee; color:#222; border:1px solid rgba(0,0,0,0.06); }
    .rb-btn.small { padding:6px 8px; font-size:0.85rem; }
    .rb-btn.danger, .rb-btn.danger:hover { background:#b32121; color:white; }
    .rb-btn.install { background:#2b8a3e; }
    .rb-main { display:flex; gap:16px; padding:16px; }
    .rb-sidebar { width:180px; background:#fff8f2; padding:12px; border-radius:8px; border:1px solid rgba(0,0,0,0.04); }
    .rb-list { flex:1; display:grid; grid-template-columns: repeat(auto-fill,minmax(240px,1fr)); gap:12px; }
    .recipe-card { background:white; padding:12px; border-radius:8px; border:1px solid rgba(0,0,0,0.04); box-shadow:0 1px 3px rgba(0,0,0,0.03); }
    .recipe-title { margin:0 0 6px 0; font-size:1.05rem; color:#333; }
    .recipe-snippet { margin:8px 0; color:#555; font-size:0.95rem; }
    .card-actions { display:flex; gap:6px; justify-content:flex-end; }
    .tag { display:inline-block; background:#f0e6e2; color:#5a2a27; padding:2px 6px; border-radius:12px; margin-right:6px; font-size:0.8rem; }
    .tag-list { list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:6px; }
    .no-tags { color:#888; font-size:0.9rem; }
    .rb-toast { position:fixed; left:50%; transform:translateX(-50%); bottom:18px; background:rgba(0,0,0,0.8); color:white; padding:10px 14px; border-radius:8px; z-index:9999; }
    .hidden { display:none; }
    .rb-modal { position:fixed; top:0; left:0; right:0; bottom:0; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,0.35); z-index:9998; padding:20px; }
    .modal-content { background:white; padding:16px; width:100%; max-width:720px; border-radius:8px; box-shadow:0 6px 20px rgba(0,0,0,0.2); max-height:90vh; overflow:auto; }
    .modal-content h2 { margin-top:0; }
    label { display:block; margin:10px 0; font-size:0.95rem; color:#333; }
    input[type="text"], textarea, input { width:100%; padding:8px; border:1px solid rgba(0,0,0,0.08); border-radius:6px; box-sizing:border-box; }
    .code { background:#faf6f4; padding:10px; border-radius:6px; white-space:pre-wrap; }
    .modal-actions { display:flex; gap:8px; justify-content:flex-end; margin-top:12px; }
    .meta { color:#666; margin-bottom:8px; font-size:0.95rem; }
    .empty { color:#666; padding:24px; background:#fff8f2; border-radius:8px; }
    @media (max-width:700px) { .rb-main { flex-direction:column; } .rb-sidebar { width:100%; } .rb-list { grid-template-columns: repeat(auto-fill,minmax(100%,1fr)); } }
    `;
    const style = document.createElement('style');
    style.id = 'rb-styles';
    style.appendChild(document.createTextNode(css));
    document.head.appendChild(style);
}

// Simple HTML escape for inserted text nodes (used earlier)
// Already provided escapeHtml function above. It's reused.


// Keep legacy example showNotification name compatibility (already defined above)
if (typeof window.showNotification === 'undefined') {
    window.showNotification = showNotification;
}