// ==========================================================================
// 🔥 Firebase 初始化
// ==========================================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyD1dONez4mPFyoQpIgxN0aSGCKYiUvbyxU",
    authDomain: "maplestar-tools.firebaseapp.com",
    projectId: "maplestar-tools",
    storageBucket: "maplestar-tools.firebasestorage.app",
    messagingSenderId: "109052078453",
    appId: "1:109052078453:web:31dd776acaed7ed0828b3c"
};

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

// ==========================================================================
// 🔐 管理員權限
// ==========================================================================
let adminKeycodes = [];
let isAdmin = false;

// 產生 6 位亂數字串，作為隊員唯一碼
function generateId() {
    return Math.random().toString(36).substring(2, 8);
}

function checkIsAdmin() {
    const kc = document.getElementById('userKeyCode')?.value.trim();
    isAdmin = adminKeycodes.includes(kc);
    const btn = document.getElementById('btn-admin-panel');
    if (btn) btn.style.display = isAdmin ? 'inline-flex' : 'none';
}

// ==========================================================================
// 🌐 全域狀態
// ==========================================================================
let saveTimer            = null;
let lastSavedData        = null;
let members              = [];     // [{ id, name, checked, ratio }]
let bossList             = [];
let bossItemMap          = {};
let dropRows             = [];
let snowRows             = [];
let settlementHistory    = [];
let lastSettlementResult = null;
let currentHistoryIndex  = -1;

// ==========================================================================
// 🚀 初始化
// ==========================================================================
window.addEventListener('DOMContentLoaded', async () => {
    setLoggedOut();
    const localData = localStorage.getItem('maple_tool_data');
    if (localData) {
        try {
            fillValues(JSON.parse(localData));
            updateSyncUI('synced');
        }
        catch (e) { console.error("本地資料還原失敗", e); }
    }

    const localHistory = localStorage.getItem('maple_settlement_history');
    if (localHistory) {
        try { settlementHistory = JSON.parse(localHistory); renderHistorySelect(); }
        catch (e) { console.error("歷史紀錄還原失敗", e); }
    }

    const dateEl = document.getElementById('settlement-date');
    if (dateEl) dateEl.value = new Date().toISOString().split('T')[0];

    updateDynamicPrices();
    await loadSharedData();
    bindEvents();

    // 還原 checkbox 狀態
    const autoLoadEl = document.getElementById('autoLoad');
    if (autoLoadEl) {
        autoLoadEl.checked = localStorage.getItem('maple_auto_load') === 'true';
        autoLoadEl.addEventListener('change', () => {
            localStorage.setItem('maple_auto_load', autoLoadEl.checked);
        });
    }

    // 自動載入：有勾選 + 有 keycode 才執行
    const shouldAutoLoad = localStorage.getItem('maple_auto_load') === 'true';
    const kcEl = document.getElementById('userKeyCode');
    if (shouldAutoLoad && kcEl?.value.trim()) {
        showAutoLoadStatus('載入中...');
        loadFromCloud(true).catch(() => {
            showAutoLoadStatus('⚠️ 自動載入失敗，使用本地資料');
        });
    }
});

// ==========================================================================
// 🎯 事件綁定
// ==========================================================================
function bindEvents() {
    document.getElementById('btn-tab-home').addEventListener('click',  () => switchTab('home'));
    document.getElementById('btn-tab-money').addEventListener('click', () => switchTab('money-split'));
    document.getElementById('btn-tab-equip').addEventListener('click', () => switchTab('equip-calc'));
    document.getElementById('btn-tab-exp').addEventListener('click',   () => switchTab('exp-calc'));

    document.getElementById('btn-load-cloud').addEventListener('click', () => loadFromCloud(false));
    document.getElementById('btn-manual-sync').addEventListener('click', () => saveAllToCloud(true));

    document.getElementById('btn-toggle-settings').addEventListener('click',   (e) => toggleSection(e.currentTarget, 'settings-section'));
    document.getElementById('btn-toggle-member').addEventListener('click',     (e) => toggleSection(e.currentTarget, 'member-section'));
    document.getElementById('btn-toggle-drops').addEventListener('click',      (e) => toggleSection(e.currentTarget, 'drops-section'));
    document.getElementById('btn-toggle-settlement').addEventListener('click', (e) => toggleSection(e.currentTarget, 'settlement-section'));

    document.getElementById('btn-add-member').addEventListener('click', addMember);
    document.getElementById('btn-save-members').addEventListener('click', saveMembersToCloud);
    document.getElementById('member-grid').addEventListener('change', onMemberTableChange);
    document.getElementById('member-grid').addEventListener('click',  onMemberTableClick);

    document.getElementById('boss-select').addEventListener('change', onBossSelectChange);

    document.getElementById('btn-add-drop-sell').addEventListener('click', () => addDropRow('sell'));
    document.getElementById('btn-add-drop-self').addEventListener('click', () => addDropRow('self'));
    document.getElementById('btn-clear-drops').addEventListener('click', clearDrops);
    document.getElementById('drops-table-body').addEventListener('change', onDropTableChange);
    document.getElementById('drops-table-body').addEventListener('click',  onDropTableClick);

    document.getElementById('btn-add-snow').addEventListener('click', addSnowRow);
    document.getElementById('snow-table-body').addEventListener('change', onSnowTableChange);
    document.getElementById('snow-table-body').addEventListener('click',  onSnowTableClick);

    document.getElementById('btn-settle').addEventListener('click', executeSettlement);
    document.getElementById('btn-save-record').addEventListener('click', saveSettlementRecord);
    document.getElementById('btn-delete-record').addEventListener('click', deleteHistoryRecord);
    document.getElementById('history-select').addEventListener('change', loadHistoryRecord);

    document.getElementById('btnCalcBaseAtk').addEventListener('click',   calculateBaseAtk);
    document.getElementById('btnCalcEquipStat').addEventListener('click', calculateEquipStat);
    document.getElementById('btnCalcSubStat').addEventListener('click',   calculateSubEquipStat);
    document.getElementById('btnCalcA').addEventListener('click', () => calcFinalAtk('A'));
    document.getElementById('btnCalcB').addEventListener('click', () => calcFinalAtk('B'));
    initMapleCheckboxes();

    // 經驗計算
    document.getElementById('btn-toggle-rest').addEventListener('click', (e) => toggleSection(e.currentTarget, 'rest-section'));
    document.getElementById('btnCalcRest').addEventListener('click', calculateRestExp);
    document.getElementById('btn-toggle-exp').addEventListener('click',  (e) => toggleSection(e.currentTarget, 'exp-section'));
    document.getElementById('btn-capture-select').addEventListener('click', startCaptureSelect);
    document.getElementById('btn-start-timer').addEventListener('click', startExpTimer);
    document.getElementById('btn-stop-timer').addEventListener('click',  stopExpTimer);
    document.getElementById('btn-calc-exp').addEventListener('click',    calculateExpResult);
    document.getElementById('btn-ocr').addEventListener('click', parseScreenshots);

    // 監聽解析數值輸入框，兩個都清空才恢復可按
    ['ocr-start-val','ocr-end-val'].forEach(id => {
        document.getElementById(id).addEventListener('input', updateOcrBtnState);
    });

    // 計時選項按鈕
    document.querySelectorAll('.timer-opt').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.timer-opt').forEach(b => {
                b.classList.remove('btn-blue','active-timer');
                b.classList.add('btn-gray');
            });
            btn.classList.remove('btn-gray');
            btn.classList.add('btn-blue','active-timer');
            selectedMinutes = parseInt(btn.dataset.minutes);
        });
    });

    document.getElementById('userKeyCode').addEventListener('input', () => {
        renderBossSelect();
        renderAllDropItemSelects();
    });

    document.addEventListener('input', (e) => {
        if ((e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') && e.target.id !== 'userKeyCode') {
            triggerAutoSave();
        }
    });

    // 🔐 管理員設定 Modal
    document.getElementById('btn-admin-panel')?.addEventListener('click', openAdminPanel);
    document.getElementById('btn-close-admin-panel')?.addEventListener('click', closeAdminPanel);
    document.getElementById('modal-admin-panel')?.addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeAdminPanel();
    });
    document.getElementById('btn-add-admin')?.addEventListener('click', addAdminKeycode);
    document.getElementById('modal-boss-filter')?.addEventListener('change', renderModalItemList);

    // 管理員分頁切換
    document.querySelectorAll('.admin-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchAdminTab(btn.dataset.tab));
    });
}

// ==========================================================================
// 🗂️ 分頁切換
// ==========================================================================
function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    const map = { home: 'btn-tab-home', 'money-split': 'btn-tab-money', 'equip-calc': 'btn-tab-equip', 'exp-calc': 'btn-tab-exp' };
    if (map[tabId]) document.getElementById(map[tabId]).classList.add('active');
}

// ==========================================================================
// 📂 折疊開關
// ==========================================================================
function toggleSection(headerEl, sectionId) {
    const content = document.getElementById(sectionId);
    if (!content) return;
    const span = headerEl.querySelector('span');
    if (content.style.maxHeight === '0px') {
        content.style.maxHeight = content.scrollHeight + 1000 + "px";
        if (span) span.innerText = '▲';
    } else {
        content.style.maxHeight = '0px';
        if (span) span.innerText = '▼';
    }
}

function expandSection(sectionId) {
    const el = document.getElementById(sectionId);
    if (el && el.style.maxHeight !== '0px') el.style.maxHeight = el.scrollHeight + 1000 + "px";
}

// ==========================================================================
// ☁️ 雲端同步
// ==========================================================================
function setLoggedIn(kc) {
    document.getElementById('display-keycode').innerText = kc;
    document.getElementById('btn-manual-sync').disabled = false;
}

function setLoggedOut() {
    document.getElementById('display-keycode').innerText = '無';
    document.getElementById('btn-manual-sync').disabled = true;
}

function updateSyncUI(status, message = '') {
    const dot  = document.getElementById('sync-dot');
    const text = document.getElementById('sync-status-text');
    const s = { synced: ['#4caf50','已同步'], pending: ['#ff9800','同步中...'], error: ['#f44336','同步失敗'] };
    if (dot  && s[status]) dot.style.backgroundColor = s[status][0];
    if (text && s[status]) text.innerText = message || s[status][1];
}

function triggerAutoSave() {
    updateDynamicPrices();
    const cur = getFormValues();
    localStorage.setItem('maple_tool_data', JSON.stringify(cur));
    const kc = document.getElementById('userKeyCode')?.value.trim();
    if (kc) {
        updateSyncUI('pending');
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
            if (JSON.stringify(cur) !== JSON.stringify(lastSavedData)) saveAllToCloud(false);
            else updateSyncUI('synced');
        }, 15000);
    }
}

async function saveAllToCloud(isManual = false) {
    const kc = document.getElementById('userKeyCode')?.value.trim();
    if (!kc) { if (isManual) alert("請先輸入代碼！"); return; }
    updateSyncUI('pending', isManual ? '同步中...' : '自動同步...');
    try {
        const data = getFormValues();
        data.lastUpdated = new Date().toISOString();
        // 個人雲端存 checked/ratio（以 id 為 key）
        data.memberSettings = buildMemberSettings();
        await setDoc(doc(db, "player_data", kc), data, { merge: true });
        lastSavedData = JSON.parse(JSON.stringify(data));
        localStorage.setItem('maple_tool_data', JSON.stringify(data));
        updateSyncUI('synced');
        setLoggedIn(kc);
        if (isManual) showToast("💾 手動同步成功");
    } catch (e) {
        updateSyncUI('error', '同步失敗');
        alert("❌ 儲存失敗：" + e.message);
    }
}

// 建立以 id 為 key 的個人設定物件（checked、ratio）
function buildMemberSettings() {
    const settings = {};
    members.forEach(m => {
        if (m.id) settings[m.id] = { checked: m.checked, ratio: m.ratio };
    });
    return settings;
}

function showAutoLoadStatus(msg) {
    showToast(msg);
}

async function loadFromCloud(silent = false) {
    const kc = document.getElementById('userKeyCode')?.value.trim();
    if (!kc) { if (!silent) alert('請先輸入代碼！'); return; }
    try {
        const snap = await getDoc(doc(db, "player_data", kc));

        if (!snap.exists()) {
            // 新 keycode：建立新帳號，本地歷史保留並上傳
            const newData = getFormValues();
            newData.lastUpdated    = new Date().toISOString();
            newData.memberSettings = buildMemberSettings();
            await setDoc(doc(db, "player_data", kc), newData, { merge: false });
            if (settlementHistory.length > 0) {
                await setDoc(doc(db, "player_history", kc), { history: settlementHistory }, { merge: false });
            }
            lastSavedData = JSON.parse(JSON.stringify(newData));
            localStorage.setItem('maple_tool_data', JSON.stringify(newData));
            updateSyncUI('synced');
            setLoggedIn(kc);
            renderBossSelect();
            renderAllDropItemSelects();
            checkIsAdmin();
            if (!silent) alert("✅ 已建立新帳號！");
            else showAutoLoadStatus('✅ 已建立新帳號');
            return;
        }

        const data = snap.data();
        fillValues(data);

        // 合併共用名單與個人 checked/ratio（以 id 為 key）
        const memberSettings = data.memberSettings || {};
        members = members.map(m => ({
            id:      m.id,
            name:    m.name,
            checked: memberSettings[m.id]?.checked ?? false,
            ratio:   memberSettings[m.id]?.ratio   ?? 1
        }));
        renderMembers();

        localStorage.setItem('maple_tool_data', JSON.stringify(data));
        lastSavedData = JSON.parse(JSON.stringify(data));
        updateSyncUI('synced');
        setLoggedIn(kc);
        updateDynamicPrices();
        calculateFinalAtk();

        // 以雲端歷史覆蓋本地
        const histSnap = await getDoc(doc(db, "player_history", kc));
        settlementHistory = histSnap.exists() ? (histSnap.data().history || []) : [];
        localStorage.setItem('maple_settlement_history', JSON.stringify(settlementHistory));
        renderHistorySelect();

        renderBossSelect();
        renderAllDropItemSelects();
        checkIsAdmin();

        if (!silent) alert("📥 設定讀取成功！");
        else showAutoLoadStatus('✅ 自動載入成功');
    } catch (e) {
        if (!silent) alert("讀取失敗：" + e.message);
        else showAutoLoadStatus('⚠️ 自動載入失敗，使用本地資料');
        throw e;
    }
}

// ==========================================================================
// 📋 表單資料（扁平化）
// ==========================================================================
function getFormValues() {
    const ids = [
        'userKeyCode',
        'moneyToMileage','cubeFancyPrice','cubeSuspiciousPrice',
        'coeff','mainStat','subStat','maxAtk','percentAtk',
        'statTotal','statBaseOnly','statPercent',
        'subStatTotal','subStatBaseOnly','subStatPercent',
        'maplePercentMain','maplePercentSub',
        'calcBaseAtkA','calcAtkPercentA','calcMainBaseA','calcMainEquipA','calcMainPercentA','calcSubBaseA','calcSubEquipA','calcSubPercentA','maplePercentA',
        'calcBaseAtkB','calcAtkPercentB','calcMainBaseB','calcMainEquipB','calcMainPercentB','calcSubBaseB','calcSubEquipB','calcSubPercentB','maplePercentB',
    ];
    const data = {};
    ids.forEach(id => { const el = document.getElementById(id); if (el) data[id] = el.value; });

    // 手續費 radio 另外存
    const checkedFee = document.querySelector('input[name="defaultFee"]:checked');
    if (checkedFee) data.defaultFee = checkedFee.value;

    // 勾選狀態另外存
    ['mapleCheckMain','mapleCheckSub','mapleCheckA','mapleCheckB'].forEach(id => {
        const el = document.getElementById(id);
        if (el) data[id] = el.checked;
    });

    return data;
}

function fillValues(obj) {
    for (const key in obj) {
        const el = document.getElementById(key);
        if (!el) continue;
        if (typeof obj[key] === 'boolean') {
            // 還原 checkbox 狀態
            el.checked = obj[key];
            // 同步更新對應輸入框的 disabled 狀態
            const inputMap = {
                mapleCheckMain: 'maplePercentMain',
                mapleCheckSub:  'maplePercentSub',
                mapleCheckA:    'maplePercentA',
                mapleCheckB:    'maplePercentB',
            };
            const inputId = inputMap[key];
            if (inputId) {
                const inp = document.getElementById(inputId);
                if (inp) {
                    inp.disabled = !obj[key];
                    inp.style.opacity = obj[key] ? '1' : '0.4';
                }
            }
        } else if (typeof obj[key] !== 'object') {
            el.value = obj[key];
        }
    }
    // 還原手續費 radio
    if (obj.defaultFee !== undefined) {
        const radio = document.getElementById(`defaultFee${obj.defaultFee}`);
        if (radio) radio.checked = true;
    }
}

function showToast(msg) {
    const t = document.getElementById("toast");
    if (t) { t.textContent = msg; t.style.display = "block"; setTimeout(() => t.style.display = "none", 3000); }
}

// ==========================================================================
// 💰 動態價格計算
// ==========================================================================
function updateDynamicPrices() {
    const r = parseFloat(document.getElementById('moneyToMileage')?.value) || 10000;
    const toWan = m => ((m / r) * 1000).toFixed(1);
    const el = id => document.getElementById(id);
    if (el('priceFancy'))    el('priceFancy').innerText    = toWan(3900);
    if (el('pricePlatinum')) el('pricePlatinum').innerText = toWan(7100);
    if (el('priceSnow'))     el('priceSnow').innerText     = toWan(3500 / 11);
}

function getPrices() {
    const r = parseFloat(document.getElementById('moneyToMileage')?.value) || 10000;
    const toWan = m => (m / r) * 1000;
    return {
        fancy:          toWan(3900),
        platinum:       toWan(7100),
        snow:           toWan(3500 / 11),
        cubeFancy:      parseFloat(document.getElementById('cubeFancyPrice')?.value)      || 0,
        cubeSuspicious: parseFloat(document.getElementById('cubeSuspiciousPrice')?.value) || 0
    };
}

// ==========================================================================
// 👥 隊員管理
// ==========================================================================
async function loadSharedData() {
    try {
        const snap = await getDoc(doc(db, "shared_data", "team_data"));
        if (snap.exists()) {
            const d = snap.data();
            // 支援新格式 { id, name } 和舊格式（純字串）
            // 舊格式沒有 id，自動補上 generateId()
            const rawMembers = d.members || d.memberNames || [];
            bossList      = d.bossList      || [];
            bossItemMap   = d.bossItemMap   || {};
            adminKeycodes = d.adminKeycodes || [];
            const localData = localStorage.getItem('maple_tool_data');
            const memberSettings = localData ? (JSON.parse(localData).memberSettings || {}) : {};
            members = rawMembers.map(m => {
                const id   = (typeof m === 'object' ? m.id : null) || generateId();
                const name = (typeof m === 'object' ? m.name : m) || '';
                return {
                    id,
                    name,
                    checked: memberSettings[id]?.checked ?? false,
                    ratio:   memberSettings[id]?.ratio   ?? 1
                };
            });
        }
    } catch (e) {
        console.error("共用資料讀取失敗：", e);
        bossList    = [];
        bossItemMap = {};
    } finally {
        renderMembers();
        renderBossSelect();
        renderAllDropItemSelects();
    }
}

async function saveMembersToCloud() {
    const kc = document.getElementById('userKeyCode').value.trim();
    if (!kc) { alert("🔒 尚未登入代碼，無法同步！"); return; }
    try {
        // 存 { id, name } 物件陣列到共用雲端
        const memberList = members
            .filter(m => m.name.trim() !== '')
            .map(m => ({ id: m.id, name: m.name }));
        await setDoc(doc(db, "shared_data", "team_data"), { members: memberList, bossList, bossItemMap, adminKeycodes }, { merge: false });
        await saveAllToCloud(false);
        alert("✅ 共用名單已同步至雲端！");
    } catch (e) { alert("同步失敗：" + e.message); }
}

// 新增隊員時補上唯一碼 id
function addMember() {
    members.push({ id: generateId(), name: "", ratio: 1, checked: false });
    renderMembers();
}

function removeMember(i) { members.splice(i, 1); renderMembers(); }
function updateMemberData(i, field, val) { if (members[i]) members[i][field] = val; }

function onMemberTableChange(e) {
    const i = e.target.dataset.index;
    if (e.target.classList.contains('mem-check'))  { members[i].checked = e.target.checked; refreshSellerOptions(); refreshSnowUserOptions(); }
    if (e.target.classList.contains('mem-name'))   updateMemberData(i, 'name',  e.target.value);
    if (e.target.classList.contains('mem-ratio'))  updateMemberData(i, 'ratio', parseFloat(e.target.value));
}
function onMemberTableClick(e) { if (e.target.classList.contains('mem-del')) removeMember(e.target.dataset.index); }

function renderMembers() {
    const grid = document.getElementById('member-grid');
    if (!grid) return;
    grid.innerHTML = '';
    members.forEach((m, i) => {
        const cell = document.createElement('div');
        cell.className = 'member-cell';
        cell.innerHTML = `
            <input type="checkbox" class="mem-check" data-index="${i}" ${m.checked ? 'checked' : ''}>
            <input type="hidden" class="mem-id" data-index="${i}" value="${m.id}">
            <input type="text" value="${m.name}" class="cloud-input mem-name" data-index="${i}" placeholder="名稱...">
            <input type="number" value="${m.ratio}" class="cloud-input mem-ratio" data-index="${i}">
        `;
        grid.appendChild(cell);
    });
    refreshSellerOptions();
    refreshSnowUserOptions();
}

// 取得目前勾選參加的隊員（含 id）
function getActiveMembers() {
    return members.filter(m => m.checked && m.name.trim() !== '');
}

// 根據 id 查名稱；查不到就回傳備用名稱（舊資料相容）
function getMemberNameById(id, fallbackName = '') {
    const found = members.find(m => m.id === id);
    return found ? found.name : (fallbackName || id);
}

// ==========================================================================
// 👑 王選擇
// ==========================================================================
function getCurrentBoss() {
    const val = document.getElementById('boss-select')?.value;
    return (val && val !== '__add_new__') ? val : '';
}

function onBossSelectChange(e) {
    const val = e.target.value;
    if (val === '__add_new__') { handleAddNew('boss', e.target); return; }
    if (dropRows.length > 0 || snowRows.length > 0) {
        if (confirm("切換王將清空掉落物與雪花清單，是否繼續？")) {
            dropRows = []; snowRows = [];
            document.getElementById('drops-table-body').innerHTML = '';
            document.getElementById('snow-table-body').innerHTML  = '';
            resetSettlementUI();
        } else {
            e.target.value = e.target.dataset.prev || '';
            return;
        }
    }
    e.target.dataset.prev = val;
    updateDropButtons();
    renderAllDropItemSelects();
}

function updateDropButtons() {
    const hasBoss = !!getCurrentBoss();
    ['btn-add-drop-sell','btn-add-drop-self','btn-add-snow'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.disabled = !hasBoss;
    });
}

function renderBossSelect() {
    const sel = document.getElementById('boss-select');
    if (!sel) return;
    const cur = getCurrentBoss();
    sel.innerHTML = '<option value="">— 選擇王 —</option>';
    bossList.forEach(b => { sel.innerHTML += `<option value="${b}" ${cur === b ? 'selected' : ''}>${b}</option>`; });
    const kc = document.getElementById('userKeyCode')?.value.trim();
    if (kc) sel.innerHTML += `<option value="__add_new__">＋ 新增王...</option>`;
    updateDropButtons();
}

// ==========================================================================
// 📦 掉落物名稱下拉（依當前王）
// ==========================================================================
function getCurrentBossItems() {
    const boss = getCurrentBoss();
    return boss ? (bossItemMap[boss] || []) : [];
}

function buildItemOptions(selected = '') {
    const kc    = document.getElementById('userKeyCode')?.value.trim();
    const items = getCurrentBossItems();
    let html = '<option value="">— 選擇物品 —</option>';
    items.forEach(item => { html += `<option value="${item}" ${selected === item ? 'selected' : ''}>${item}</option>`; });
    if (kc) html += `<option value="__add_new__">＋ 新增物品...</option>`;
    return html;
}

function renderAllDropItemSelects() {
    document.querySelectorAll('.drop-item').forEach(sel => {
        const cur = (sel.value === '__add_new__') ? '' : sel.value;
        sel.innerHTML = buildItemOptions(cur);
    });
}

async function handleAddNew(type, selectEl) {
    const label = type === 'boss' ? '王名稱' : '物品名稱';
    const name  = prompt(`請輸入新的${label}：`);
    if (!name || !name.trim()) { selectEl.value = selectEl.dataset.prev || ''; return; }
    const trimmed = name.trim();
    if (type === 'boss') {
        if (!bossList.includes(trimmed)) bossList.push(trimmed);
        await saveSharedLists();
        renderBossSelect();
        document.getElementById('boss-select').value        = trimmed;
        document.getElementById('boss-select').dataset.prev = trimmed;
    } else {
        const boss = getCurrentBoss();
        if (!boss) { selectEl.value = ''; return; }
        if (!bossItemMap[boss]) bossItemMap[boss] = [];
        if (!bossItemMap[boss].includes(trimmed)) bossItemMap[boss].push(trimmed);
        await saveSharedLists();
        renderAllDropItemSelects();
        selectEl.value = trimmed;
        const idx = parseInt(selectEl.dataset.index);
        if (!isNaN(idx) && dropRows[idx]) dropRows[idx].item = trimmed;
    }
    updateDropButtons();
}

async function saveSharedLists() {
    const kc = document.getElementById('userKeyCode')?.value.trim();
    if (!kc) return;
    // 存 { id, name } 物件陣列
    const memberList = members.filter(m => m.name.trim() !== '').map(m => ({ id: m.id, name: m.name }));
    try { await setDoc(doc(db, "shared_data", "team_data"), { members: memberList, bossList, bossItemMap, adminKeycodes }, { merge: false }); }
    catch (e) { console.error("名單儲存失敗：", e); }
}

// ==========================================================================
// 📦 掉落物表格
// ==========================================================================
function onDropTableChange(e) {
    const i = parseInt(e.target.dataset.index);
    if (isNaN(i) || !dropRows[i]) return;
    if (e.target.classList.contains('drop-item')) {
        if (e.target.value === '__add_new__') { handleAddNew('item', e.target); return; }
        dropRows[i].item = e.target.value;
    }
    if (e.target.classList.contains('drop-price'))   { dropRows[i].price   = parseFloat(e.target.value) || 0; recalcDropRow(i); }
    if (e.target.classList.contains('drop-fee'))     { dropRows[i].fee     = parseFloat(e.target.value) || 0; recalcDropRow(i); }
    if (e.target.classList.contains('drop-scissor')) { dropRows[i].scissor = e.target.value;                  recalcDropRow(i); }
    if (e.target.classList.contains('drop-seller'))  {
        // seller 存 { id, name }，方便歷史紀錄顯示時用 id 查最新名稱
        const selectedId = e.target.value;
        const member = members.find(m => m.id === selectedId);
        dropRows[i].seller = member ? { id: member.id, name: member.name } : null;
    }
}
function onDropTableClick(e) { if (e.target.classList.contains('drop-del')) removeDropRow(parseInt(e.target.dataset.index)); }

function addDropRow(type) {
    const i = dropRows.length;
    // 讀取基礎設定的手續費預設值
    const defaultFee = parseInt(document.querySelector('input[name="defaultFee"]:checked')?.value ?? 6);
    dropRows.push({ type, item: '', price: 0, fee: type === 'sell' ? defaultFee : 0, scissor: 'none', seller: null, net: 0 });
    appendDropRow(i);
    expandSection('drops-section');
}

function appendDropRow(i) {
    const row    = dropRows[i];
    const isSell = row.type === 'sell';
    // seller 支援 { id, name } 新格式，也相容舊格式字串（id 欄位取不到就用空字串）
    const sellerId = row.seller?.id || '';
    const tr     = document.createElement('tr');
    tr.id = `drop-row-${i}`;
    tr.style.borderBottom = '1px solid #2a2a2a';
    tr.innerHTML = `
        <td style="padding:6px 4px;vertical-align:middle;">
            <select class="cloud-input drop-item" data-index="${i}" style="font-size:13px;padding:6px 8px;">
                ${buildItemOptions(row.item)}
            </select>
        </td>
        <td style="padding:6px 4px;vertical-align:middle;">
            <input type="number" class="cloud-input drop-price" data-index="${i}"
                value="${row.price || ''}" placeholder="0" style="font-size:13px;padding:6px 8px;">
        </td>
        <td style="padding:6px 4px;vertical-align:middle;">
            <select class="cloud-input drop-fee ${isSell ? '' : 'field-disabled'}" data-index="${i}" style="font-size:13px;padding:6px 8px;" ${isSell ? '' : 'disabled'}>
                <option value="0" ${row.fee==0?'selected':''}>0%</option>
                <option value="3" ${row.fee==3?'selected':''}>3%</option>
                <option value="6" ${row.fee==6||(!row.fee&&isSell)?'selected':''}>6%</option>
            </select>
        </td>
        <td style="padding:6px 4px;vertical-align:middle;">
            <select class="cloud-input drop-scissor ${isSell ? '' : 'field-disabled'}" data-index="${i}" style="font-size:13px;padding:6px 8px;" ${isSell ? '' : 'disabled'}>
                <option value="none" ${!row.scissor||row.scissor==='none'?'selected':''}>無</option>
                <option value="fancy" ${row.scissor==='fancy'?'selected':''}>神奇</option>
                <option value="platinum" ${row.scissor==='platinum'?'selected':''}>白金</option>
            </select>
        </td>
        <td style="padding:6px 4px;vertical-align:middle;">
            <select class="cloud-input drop-seller" data-index="${i}" style="font-size:13px;padding:6px 8px;">
                ${buildSellerOptions(sellerId)}
            </select>
        </td>
        <td style="padding:6px 4px;text-align:right;vertical-align:middle;">
            <span id="drop-net-${i}" style="color:${isSell?'#64b5f6':'#b39ddb'};font-weight:bold;font-size:13px;white-space:nowrap;">${row.net!=null?row.net.toFixed(1)+'萬':'—'}</span>
        </td>
        <td style="padding:6px 4px;text-align:center;vertical-align:middle;">
            <button class="del-btn drop-del" data-index="${i}">✕</button>
        </td>
    `;
    document.getElementById('drops-table-body').appendChild(tr);
}

function recalcDropRow(i) {
    const row = dropRows[i], p = getPrices();
    let net = row.price;
    if (row.type === 'sell') {
        net = row.price * (1 - row.fee / 100);
        if (row.scissor === 'fancy')    net -= p.fancy;
        if (row.scissor === 'platinum') net -= p.platinum;
    }
    net = Math.round(net * 10) / 10;
    dropRows[i].net = net;
    const el = document.getElementById(`drop-net-${i}`);
    if (el) el.innerText = net.toFixed(1) + '萬';
}

function removeDropRow(i) { dropRows.splice(i, 1); rerenderDropTable(); }

function rerenderDropTable() {
    document.getElementById('drops-table-body').innerHTML = '';
    const temp = [...dropRows]; dropRows = [];
    temp.forEach((row, i) => { dropRows.push(row); appendDropRow(i); });
}

// 重新整理所有賣家下拉選單（保留目前選取的 id）
function refreshSellerOptions() {
    document.querySelectorAll('.drop-seller').forEach(sel => { const cur = sel.value; sel.innerHTML = buildSellerOptions(cur); });
}

// 建立賣家/自用者下拉選項
// value 存 id；顯示名稱取自 members（確保改名後下拉也即時反映）
function buildSellerOptions(selectedId = '') {
    const active = getActiveMembers();
    let html = '<option value="">— 選擇 —</option>';
    active.forEach(m => { html += `<option value="${m.id}" ${selectedId === m.id ? 'selected' : ''}>${m.name}</option>`; });
    return html;
}

// ==========================================================================
// ❄️ 雪花表格
// ==========================================================================
function onSnowTableChange(e) {
    const i = parseInt(e.target.dataset.index);
    if (isNaN(i) || !snowRows[i]) return;
    if (e.target.classList.contains('snow-user')) {
        // user 存 { id, name }，方便歷史紀錄顯示時用 id 查最新名稱
        const selectedId = e.target.value;
        const member = members.find(m => m.id === selectedId);
        snowRows[i].user = member ? { id: member.id, name: member.name } : null;
    }
    if (e.target.classList.contains('snow-count')) { snowRows[i].count = parseFloat(e.target.value) || 0; recalcSnowRow(i); }
}
function onSnowTableClick(e) { if (e.target.classList.contains('snow-del')) removeSnowRow(parseInt(e.target.dataset.index)); }

function addSnowRow() {
    const i = snowRows.length;
    snowRows.push({ user: null, count: 0, cost: 0 });
    appendSnowRow(i);
    expandSection('drops-section');
}

function appendSnowRow(i) {
    const row = snowRows[i];
    // user 支援 { id, name } 新格式，也相容舊格式字串
    const userId = row.user?.id || '';
    const tr  = document.createElement('tr');
    tr.id = `snow-row-${i}`;
    tr.style.borderBottom = '1px solid #2a2a2a';
    tr.innerHTML = `
        <td style="padding:6px 4px;vertical-align:middle;">
            <select class="cloud-input snow-user" data-index="${i}" style="font-size:13px;padding:6px 8px;">
                ${buildSellerOptions(userId)}
            </select>
        </td>
        <td style="padding:6px 4px;vertical-align:middle;">
            <input type="number" class="cloud-input snow-count" data-index="${i}" value="${row.count||''}" placeholder="0" min="0" style="font-size:13px;padding:6px 8px;">
        </td>
        <td style="padding:6px 4px;text-align:right;vertical-align:middle;">
            <span id="snow-cost-${i}" style="color:#ff6b6b;font-weight:bold;font-size:13px;">${row.cost!=null?row.cost.toFixed(1)+'萬':'—'}</span>
        </td>
        <td style="padding:6px 4px;text-align:center;vertical-align:middle;">
            <button class="del-btn snow-del" data-index="${i}">✕</button>
        </td>
    `;
    document.getElementById('snow-table-body').appendChild(tr);
}

function recalcSnowRow(i) {
    const cost = Math.round(snowRows[i].count * getPrices().snow * 10) / 10;
    snowRows[i].cost = cost;
    const el = document.getElementById(`snow-cost-${i}`);
    if (el) el.innerText = cost.toFixed(1) + '萬';
}

function removeSnowRow(i) { snowRows.splice(i, 1); rerenderSnowTable(); }

function rerenderSnowTable() {
    document.getElementById('snow-table-body').innerHTML = '';
    const temp = [...snowRows]; snowRows = [];
    temp.forEach((row, i) => { snowRows.push(row); appendSnowRow(i); });
}

// 重新整理所有雪花使用者下拉選單（保留目前選取的 id）
function refreshSnowUserOptions() {
    document.querySelectorAll('.snow-user').forEach(sel => { const cur = sel.value; sel.innerHTML = buildSellerOptions(cur); });
}

// ==========================================================================
// 🗑️ 清空掉落物
// ==========================================================================
function resetSettlementUI() {
    document.getElementById('settlement-detail').style.display = 'none';
    document.getElementById('history-select').value            = '';
    document.getElementById('settlement-date').value           = new Date().toISOString().split('T')[0];
    document.getElementById('btn-save-record').disabled        = true;
    document.getElementById('btn-delete-record').disabled      = true;
    currentHistoryIndex  = -1;
    lastSettlementResult = null;
}

function clearDrops() {
    if (dropRows.length === 0 && snowRows.length === 0) return;
    if (!confirm("確定要清空本次所有掉落物和雪花資料嗎？")) return;
    dropRows = []; snowRows = [];
    document.getElementById('drops-table-body').innerHTML = '';
    document.getElementById('snow-table-body').innerHTML  = '';
    resetSettlementUI();
    showToast("🗑 已清空本次資料");
}

// ==========================================================================
// ✅ 結算前驗證
// ==========================================================================
function validateBeforeSettle() {
    for (let i = 0; i < dropRows.length; i++) {
        if (!dropRows[i].item)            { alert(`第 ${i+1} 筆掉落物尚未選擇名稱！`);       return false; }
        if (!dropRows[i].seller?.id)      { alert(`第 ${i+1} 筆掉落物尚未選擇賣家/自用者！`); return false; }
    }
    for (let i = 0; i < snowRows.length; i++) {
        if (!snowRows[i].user?.id) { alert(`第 ${i+1} 筆雪花紀錄尚未選擇使用者！`); return false; }
    }
    if (getActiveMembers().length === 0)                { alert("請先在隊員表格勾選參加的隊員！"); return false; }
    if (dropRows.length === 0 && snowRows.length === 0) { alert("請先登記掉落物或雪花！");         return false; }
    return true;
}

// ==========================================================================
// 🧮 結算引擎
// ==========================================================================
function executeSettlement() {
    if (!validateBeforeSettle()) return;
    const active = getActiveMembers();
    const prices = getPrices();

    // 每人實際收入（以 id 為 key）
    const actualIncome = {};
    active.forEach(m => { actualIncome[m.id] = 0; });
    dropRows.forEach(row => {
        const sid = row.seller?.id;
        if (sid && actualIncome.hasOwnProperty(sid)) actualIncome[sid] += row.net;
    });

    // 總池
    let totalPool = 0;
    dropRows.forEach(row => { totalPool += row.net; });

    // 雪花從總池扣，記錄每人雪花成本（以 id 為 key）
    const snowCostPerMember = {};
    active.forEach(m => { snowCostPerMember[m.id] = 0; });
    let totalSnowCost = 0;
    snowRows.forEach(row => {
        totalPool -= row.cost; totalSnowCost += row.cost;
        const uid = row.user?.id;
        if (uid && snowCostPerMember.hasOwnProperty(uid)) snowCostPerMember[uid] += row.cost;
    });

    // 每人應得 = 依比例分總池 + 加回自己雪花成本（以 id 為 key）
    const totalRatio = active.reduce((s, m) => s + (m.ratio || 1), 0);
    const shouldGet  = {};
    active.forEach(m => {
        const base = Math.round((totalPool * (m.ratio || 1) / totalRatio) * 10) / 10;
        shouldGet[m.id] = Math.round((base + (snowCostPerMember[m.id] || 0)) * 10) / 10;
    });

    // 差額（正=多拿要付出，負=少拿要收回）（以 id 為 key）
    const diff = {};
    active.forEach(m => { diff[m.id] = Math.round((actualIncome[m.id] - shouldGet[m.id]) * 10) / 10; });

    const payments = calcPayments(diff, active, prices);
    const result   = { totalPool, totalSnowCost, shouldGet, actualIncome, diff, payments };
    renderSettlementResult(result, active);
    lastSettlementResult = result;
    document.getElementById('btn-save-record').disabled = false;
}

function calcPayments(diff, active, prices) {
    // diff 的 key 為 id；payers/receivers 記錄 { id, name, amount }
    let payers    = active.filter(m => diff[m.id] >  0.01).map(m => ({ id: m.id, name: m.name, amount:  diff[m.id] }));
    let receivers = active.filter(m => diff[m.id] < -0.01).map(m => ({ id: m.id, name: m.name, amount: -diff[m.id] }));
    const payments = [];
    let pi = 0, ri = 0;
    while (pi < payers.length && ri < receivers.length) {
        const p = payers[pi], r = receivers[ri];
        const amount = Math.round(Math.min(p.amount, r.amount) * 10) / 10;
        // 付款指示存名稱（顯示用），同時存 id（供未來查詢用）
        payments.push({ fromId: p.id, from: p.name, toId: r.id, to: r.name, amount, ...suggestBlocks(amount, prices) });
        p.amount = Math.round((p.amount - amount) * 10) / 10;
        r.amount = Math.round((r.amount - amount) * 10) / 10;
        if (p.amount < 0.01) pi++;
        if (r.amount < 0.01) ri++;
    }
    return payments;
}

function suggestBlocks(amount, prices) {
    let rem = amount, fancyCount = 0, suspCount = 0;
    if (prices.cubeFancy > 0)      { fancyCount = Math.floor(rem / prices.cubeFancy);      rem = Math.round((rem - fancyCount * prices.cubeFancy) * 10) / 10; }
    if (prices.cubeSuspicious > 0) { suspCount  = Math.floor(rem / prices.cubeSuspicious); rem = Math.round((rem - suspCount  * prices.cubeSuspicious) * 10) / 10; }
    return { fancyCount, suspCount, remainder: rem };
}

// ==========================================================================
// 🖼️ 結算結果渲染
// ==========================================================================
function renderSettlementResult(result, active, dropsSnapshot, snowsSnapshot) {
    const { totalPool, shouldGet, actualIncome, diff, payments } = result;
    // 優先用快照，沒有快照才用目前的 dropRows/snowRows
    const displayDrops = dropsSnapshot || dropRows;
    const displaySnows = snowsSnapshot || snowRows;
    document.getElementById('settlement-detail').style.display = 'block';

    // 掉落物顯示：seller 取 id 查最新名稱，查不到就顯示存的舊 name（相容舊資料）
    let dropsHtml = '<div class="detail-section-title">📦 掉落物收入</div>';
    if (displayDrops.length === 0) {
        dropsHtml += '<div class="detail-row" style="color:#666;">（無）</div>';
    } else {
        displayDrops.forEach(d => {
            const sellerName = d.seller?.id
                ? getMemberNameById(d.seller.id, d.seller.name)
                : (d.seller?.name || d.seller || '');
            const label = d.type === 'sell'
                ? `${d.item}（${sellerName}）`
                : `${d.item}（${sellerName} 自用）`;
            const color = d.type === 'sell' ? '#64b5f6' : '#b39ddb';
            dropsHtml += `<div class="detail-row"><span>${label}</span><span style="color:${color};">${d.net.toFixed(1)}萬</span></div>`;
        });
    }
    document.getElementById('detail-drops').innerHTML = dropsHtml;

    // 雪花顯示：user 取 id 查最新名稱，查不到就顯示存的舊 name
    let snowHtml = '<div class="detail-section-title">❄️ 雪花消耗</div>';
    if (displaySnows.length === 0) {
        snowHtml += '<div class="detail-row" style="color:#666;">（無）</div>';
    } else {
        displaySnows.forEach(s => {
            const userName = s.user?.id
                ? getMemberNameById(s.user.id, s.user.name)
                : (s.user?.name || s.user || '');
            snowHtml += `<div class="detail-row"><span>${userName} × ${s.count}個</span><span style="color:#ff6b6b;">-${s.cost.toFixed(1)}萬</span></div>`;
        });
    }
    document.getElementById('detail-snow').innerHTML = snowHtml;
    document.getElementById('detail-total').innerText = totalPool.toFixed(1) + '萬';

    // 每人分紅明細：以 id 為 key 查金額，顯示名稱
    const tbody = document.getElementById('settlement-member-body');
    tbody.innerHTML = '';
    active.forEach(m => {
        // 先用 id 查，查不到再用 name fallback（相容舊格式）
        const income = actualIncome[m.id] ?? actualIncome[m.name] ?? 0;
        const should = shouldGet[m.id]    ?? shouldGet[m.name]    ?? 0;
        const d      = diff[m.id]         ?? diff[m.name]         ?? 0;
        // 名稱：有 id 就查最新名稱，查不到就用快照舊名稱
        const displayName = getMemberNameById(m.id, m.name);
        const color = d >= 0 ? '#ff9f43' : '#64b5f6';
        const sign  = d >= 0 ? '+' : '';
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid #2a2a2a';
        tr.innerHTML = `
            <td style="padding:6px 4px;">${displayName}</td>
            <td style="padding:6px 4px;text-align:right;color:#ccc;">${income.toFixed(1)}萬</td>
            <td style="padding:6px 4px;text-align:right;color:#ccc;">${should.toFixed(1)}萬</td>
            <td style="padding:6px 4px;text-align:right;color:${color};font-weight:bold;">${sign}${d.toFixed(1)}萬</td>
        `;
        tbody.appendChild(tr);
    });

    const payEl = document.getElementById('payment-instructions');
    if (payments.length === 0) {
        payEl.innerHTML = '<div style="color:#666;font-size:13px;">無需付款，大家收支平衡！</div>';
    } else {
        payments.map(p => `
            <div class="payment-row">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
                    <span style="color:#ff6b6b;font-weight:bold;">${getMemberNameById(p.fromId, p.from)}</span>
                    <span style="color:#666;">→</span>
                    <span style="color:#4dae4c;font-weight:bold;">${getMemberNameById(p.toId, p.to)}</span>
                    <span style="margin-left:auto;color:#fff;font-weight:bold;">${p.amount.toFixed(1)}萬</span>
                </div>
                <div style="font-size:12px;color:#aaa;padding-left:4px;">
                    奇幻方塊 <b style="color:#fff;">${p.fancyCount}</b> 個
                    ＋ 可疑方塊 <b style="color:#fff;">${p.suspCount}</b> 個
                    ＋ 餘額 <b style="color:#fff;">${p.remainder.toFixed(1)}</b> 萬楓幣
                </div>
            </div>
        `).join('');
    }
    showToast("✅ 結算完成！");
    expandSection('settlement-section');
}

// ==========================================================================
// 📜 歷史紀錄
// ==========================================================================
function saveSettlementRecord() {
    if (!lastSettlementResult) { alert("請先執行結算！"); return; }
    const record = {
        date:    document.getElementById('settlement-date')?.value || new Date().toISOString().split('T')[0],
        boss:    document.getElementById('boss-select')?.value || '未知',
        result:  lastSettlementResult,
        // drops/snows 的 seller/user 已是 { id, name } 格式，直接存
        drops:   JSON.parse(JSON.stringify(dropRows)),
        snows:   JSON.parse(JSON.stringify(snowRows)),
        // members 存 { id, name, ratio }，歷史顯示時用 id 查最新名稱
        members: JSON.parse(JSON.stringify(getActiveMembers()))
    };

    if (currentHistoryIndex >= 0) {
        // 覆蓋目前查看的歷史紀錄
        settlementHistory[currentHistoryIndex] = record;
    } else {
        // 新增到最前面，索引為 0
        settlementHistory.unshift(record);
        if (settlementHistory.length > 100) settlementHistory.pop();
        settlementHistory.sort((a, b) => new Date(b.date) - new Date(a.date));
        currentHistoryIndex = 0;
    }

    localStorage.setItem('maple_settlement_history', JSON.stringify(settlementHistory));
    const kc = document.getElementById('userKeyCode')?.value.trim();
    if (kc) {
        setDoc(doc(db, "player_history", kc), { history: settlementHistory }, { merge: false })
            .catch(e => console.error("歷史雲端儲存失敗：", e));
    }
    renderHistorySelect();
    // 用 dataset 標記暫時跳過 change 事件，再直接設值
    const sel = document.getElementById('history-select');
    if (sel) {
        sel.dataset.skipChange = 'true';
        sel.value = String(currentHistoryIndex);
        setTimeout(() => { delete sel.dataset.skipChange; }, 100);
    }
    document.getElementById('btn-delete-record').disabled = false;
    document.getElementById('btn-save-record').disabled = true;
    showToast("💾 紀錄已儲存！");
}

function deleteHistoryRecord() {
    if (!confirm("確定要刪除此筆紀錄嗎？")) return;
    const idx = currentHistoryIndex >= 0 ? currentHistoryIndex : 0;
    settlementHistory.splice(idx, 1);
    localStorage.setItem('maple_settlement_history', JSON.stringify(settlementHistory));
    const kc = document.getElementById('userKeyCode')?.value.trim();
    if (kc) {
        setDoc(doc(db, "player_history", kc), { history: settlementHistory }, { merge: false })
            .catch(e => console.error("歷史雲端刪除失敗：", e));
    }
    currentHistoryIndex = -1;
    renderHistorySelect();
    document.getElementById('history-select').value        = '';
    document.getElementById('btn-delete-record').disabled  = true;
    document.getElementById('btn-save-record').disabled    = true;
    document.getElementById('settlement-detail').style.display = 'none';
    showToast("🗑 紀錄已刪除");
}

function renderHistorySelect() {
    const sel = document.getElementById('history-select');
    if (!sel) return;
    sel.innerHTML = '<option value="">— 選擇歷史紀錄 —</option>';
    settlementHistory.forEach((r, i) => { sel.innerHTML += `<option value="${i}">${r.date} ${r.boss}</option>`; });
}

function loadHistoryRecord() {
    const sel = document.getElementById('history-select');
    if (sel?.dataset.skipChange === 'true') return; // 儲存後更新選單時跳過
    const idx = sel?.value;
    if (idx === '' || idx === undefined) {
        currentHistoryIndex = -1;
        document.getElementById('btn-delete-record').disabled = true;
        return;
    }
    const record = settlementHistory[parseInt(idx)];
    if (!record) return;
    currentHistoryIndex = parseInt(idx);

    // 1. 先還原隊員勾選（buildSellerOptions 需要用到）
    //    用 id 比對，id 不存在時以名稱 fallback（舊格式相容）
    if (record.members) {
        const checkedIds   = record.members.map(m => m.id).filter(Boolean);
        const checkedNames = record.members.map(m => m.name);
        members = members.map(m => ({
            ...m,
            checked: checkedIds.includes(m.id) || (!m.id && checkedNames.includes(m.name)),
            ratio:   record.members.find(rm => rm.id === m.id || rm.name === m.name)?.ratio ?? m.ratio
        }));
        renderMembers();
    }

    // 2. 還原王（buildItemOptions 需要用到）
    if (record.boss) {
        const bossEl = document.getElementById('boss-select');
        if (bossEl) { bossEl.value = record.boss; bossEl.dataset.prev = record.boss; }
        updateDropButtons();
    }

    // 3. 還原日期
    if (record.date) document.getElementById('settlement-date').value = record.date;

    // 4. 還原掉落物（rerenderDropTable 內部呼叫 appendDropRow，此時王和隊員都已還原）
    dropRows = record.drops || [];
    rerenderDropTable();

    // 5. 還原雪花
    snowRows = record.snows || [];
    rerenderSnowTable();

    // 6. 渲染結算結果
    //    result 裡 shouldGet/actualIncome/diff 的 key 為 id；
    //    renderSettlementResult 會用 active（從 members 取）來顯示名稱
    lastSettlementResult = record.result;
    renderSettlementResult(record.result, record.members || getActiveMembers(), record.drops, record.snows);
    document.getElementById('btn-save-record').disabled   = false;
    document.getElementById('btn-delete-record').disabled = false;
    showToast("📂 已讀取歷史紀錄");
}

// ==========================================================================
// 🔐 管理員設定 Modal
// ==========================================================================
function openAdminPanel() {
    renderModalAdminList();
    renderModalMemberList();
    renderModalBossList();
    renderModalBossFilter();
    renderModalItemList();
    switchAdminTab('admin');
    document.getElementById('modal-admin-panel').classList.add('active');
}

function closeAdminPanel() {
    document.getElementById('modal-admin-panel').classList.remove('active');
}

function switchAdminTab(tab) {
    document.querySelectorAll('.admin-tab-content').forEach(el => el.style.display = 'none');
    document.getElementById(`admin-tab-${tab}`).style.display = 'block';
    document.querySelectorAll('.admin-tab-btn').forEach(btn => {
        btn.classList.remove('btn-blue');
        btn.classList.add('btn-gray');
    });
    document.querySelector(`.admin-tab-btn[data-tab="${tab}"]`).classList.remove('btn-gray');
    document.querySelector(`.admin-tab-btn[data-tab="${tab}"]`).classList.add('btn-blue');
}

// 分頁1：管理員名單
function renderModalAdminList() {
    const el = document.getElementById('modal-admin-list');
    if (!el) return;
    if (adminKeycodes.length === 0) { el.innerHTML = '<div style="color:#666;font-size:13px;">尚無管理員</div>'; return; }
    el.innerHTML = adminKeycodes.map((kc, i) => `
        <div class="modal-list-item">
            <span>${kc}</span>
            <button class="del-btn modal-del-admin" data-index="${i}" style="margin:0;">✕</button>
        </div>
    `).join('');
    el.querySelectorAll('.modal-del-admin').forEach(btn => {
        btn.addEventListener('click', async () => {
            const idx = parseInt(btn.dataset.index);
            const kc  = adminKeycodes[idx];
            if (!confirm(`確定要移除管理員「${kc}」嗎？`)) return;
            adminKeycodes.splice(idx, 1);
            await saveSharedLists();
            renderModalAdminList();
            showToast(`🗑 已移除管理員「${kc}」`);
        });
    });
}

async function addAdminKeycode() {
    const input = document.getElementById('new-admin-keycode');
    const kc    = input?.value.trim();
    if (!kc) { alert('請輸入 keycode！'); return; }
    if (adminKeycodes.includes(kc)) { alert('此 keycode 已是管理員！'); return; }
    adminKeycodes.push(kc);
    await saveSharedLists();
    input.value = '';
    renderModalAdminList();
    showToast(`✅ 已新增管理員「${kc}」`);
}

// 分頁2：隊員名單（顯示 name，刪除以 id 為準）
function renderModalMemberList() {
    const el = document.getElementById('modal-member-list');
    if (!el) return;
    const validMembers = members.filter(m => m.name.trim() !== '');
    if (validMembers.length === 0) { el.innerHTML = '<div style="color:#666;font-size:13px;">尚無隊員</div>'; return; }
    el.innerHTML = validMembers.map((m, i) => `
        <div class="modal-list-item">
            <span>${m.name}</span>
            <span style="font-size:11px;color:#555;margin-right:auto;padding-left:6px;">${m.id}</span>
            <button class="del-btn modal-del-member" data-id="${m.id}" style="margin:0;">✕</button>
        </div>
    `).join('');
    el.querySelectorAll('.modal-del-member').forEach(btn => {
        btn.addEventListener('click', async () => {
            const targetId = btn.dataset.id;
            const target   = members.find(m => m.id === targetId);
            if (!target) return;
            if (!confirm(`確定要刪除隊員「${target.name}」嗎？`)) return;
            // 以 id 刪除，避免同名隊員誤刪
            members = members.filter(m => m.id !== targetId);
            renderMembers();
            await saveSharedLists();
            renderModalMemberList();
            showToast(`🗑 已刪除隊員「${target.name}」`);
        });
    });
}

function renderModalBossList() {
    const el = document.getElementById('modal-boss-list');
    if (!el) return;
    if (bossList.length === 0) { el.innerHTML = '<div style="color:#666;font-size:13px;">尚無王名單</div>'; return; }
    el.innerHTML = bossList.map((boss, i) => `
        <div class="modal-list-item" draggable="true" data-index="${i}" style="cursor:grab;">
            <span style="color:#aaa;margin-right:8px;">☰</span>
            <span>${boss}</span>
            <button class="del-btn modal-del-boss" data-index="${i}" style="margin:0;">✕</button>
        </div>
    `).join('');

    // 拖曳排序
    let dragIdx = null;
    el.querySelectorAll('.modal-list-item').forEach(item => {
        item.addEventListener('dragstart', () => {
            dragIdx = parseInt(item.dataset.index);
            item.style.opacity = '0.5';
        });
        item.addEventListener('dragend', () => {
            item.style.opacity = '1';
        });
        item.addEventListener('dragover', (e) => {
            e.preventDefault();
            item.style.background = '#333';
        });
        item.addEventListener('dragleave', () => {
            item.style.background = '#252525';
        });
        item.addEventListener('drop', async () => {
            item.style.background = '#252525';
            const dropIdx = parseInt(item.dataset.index);
            if (dragIdx === null || dragIdx === dropIdx) return;
            const moved = bossList.splice(dragIdx, 1)[0];
            bossList.splice(dropIdx, 0, moved);
            await saveSharedLists();
            renderModalBossList();
            renderBossSelect();
            showToast('✅ 排序已儲存');
        });
    });

    // 刪除
    el.querySelectorAll('.modal-del-boss').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const idx      = parseInt(btn.dataset.index);
            const bossName = bossList[idx];
            if (!confirm(`確定要刪除「${bossName}」及其所有掉落物嗎？`)) return;
            bossList.splice(idx, 1);
            delete bossItemMap[bossName];
            await saveSharedLists();
            renderBossSelect();
            renderModalBossList();
            renderModalBossFilter();
            renderModalItemList();
            showToast(`🗑 已刪除「${bossName}」`);
        });
    });
}

function renderModalBossFilter() {
    const sel = document.getElementById('modal-boss-filter');
    if (!sel) return;
    const cur = sel.value;
    sel.innerHTML = '<option value="">— 選擇王查看物品 —</option>';
    bossList.forEach(b => { sel.innerHTML += `<option value="${b}" ${cur === b ? 'selected' : ''}>${b}</option>`; });
}

function renderModalItemList() {
    const el   = document.getElementById('modal-item-list');
    const boss = document.getElementById('modal-boss-filter')?.value;
    if (!el) return;
    if (!boss) { el.innerHTML = '<div style="color:#666;font-size:13px;">請先選擇王</div>'; return; }
    const items = bossItemMap[boss] || [];
    if (items.length === 0) { el.innerHTML = '<div style="color:#666;font-size:13px;">此王尚無掉落物</div>'; return; }
    el.innerHTML = items.map((item, i) => `
        <div class="modal-list-item" draggable="true" data-index="${i}" style="cursor:grab;">
            <span style="color:#aaa;margin-right:8px;">☰</span>
            <span>${item}</span>
            <button class="del-btn modal-del-item" data-boss="${boss}" data-index="${i}" style="margin:0;">✕</button>
        </div>
    `).join('');

    // 拖曳排序
    let dragIdx = null;
    el.querySelectorAll('.modal-list-item').forEach(item => {
        item.addEventListener('dragstart', () => {
            dragIdx = parseInt(item.dataset.index);
            item.style.opacity = '0.5';
        });
        item.addEventListener('dragend', () => {
            item.style.opacity = '1';
        });
        item.addEventListener('dragover', (e) => {
            e.preventDefault();
            item.style.background = '#333';
        });
        item.addEventListener('dragleave', () => {
            item.style.background = '#252525';
        });
        item.addEventListener('drop', async () => {
            item.style.background = '#252525';
            const dropIdx = parseInt(item.dataset.index);
            if (dragIdx === null || dragIdx === dropIdx) return;
            const moved = bossItemMap[boss].splice(dragIdx, 1)[0];
            bossItemMap[boss].splice(dropIdx, 0, moved);
            await saveSharedLists();
            renderModalItemList();
            renderAllDropItemSelects();
            showToast('✅ 排序已儲存');
        });
    });

    // 刪除
    el.querySelectorAll('.modal-del-item').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const b   = btn.dataset.boss;
            const idx = parseInt(btn.dataset.index);
            if (!confirm(`確定要刪除「${bossItemMap[b][idx]}」嗎？`)) return;
            bossItemMap[b].splice(idx, 1);
            await saveSharedLists();
            renderAllDropItemSelects();
            renderModalItemList();
            showToast("🗑 已刪除物品");
        });
    });
}

// ==========================================================================
// ⚔️ 裝備計算
// ==========================================================================

// 楓葉祝福 checkbox 啟用/禁用輸入欄
function initMapleCheckboxes() {
    [
        ['mapleCheckMain', 'maplePercentMain'],
        ['mapleCheckSub',  'maplePercentSub'],
        ['mapleCheckA',    'maplePercentA'],
        ['mapleCheckB',    'maplePercentB'],
    ].forEach(([checkId, inputId]) => {
        const cb = document.getElementById(checkId);
        const inp = document.getElementById(inputId);
        if (!cb || !inp) return;
        cb.addEventListener('change', () => {
            inp.disabled = !cb.checked;
            inp.style.opacity = cb.checked ? '1' : '0.4';
        });
    });
}

// 取得楓葉祝福加成後的屬性值
function applyMaple(base, mapleChecked, maplePct) {
    if (!mapleChecked || !maplePct) return base;
    return base * (1 + maplePct / 100);
}

// 基礎攻擊力反推
function calculateBaseAtk() {
    const mainStat   = parseFloat(document.getElementById('mainStat').value)   || 0;
    const subStat    = parseFloat(document.getElementById('subStat').value)    || 0;
    const maxAtk     = parseFloat(document.getElementById('maxAtk').value)     || 0;
    const percentAtk = (parseFloat(document.getElementById('percentAtk').value) || 0) / 100;
    const coeff      = parseFloat(document.getElementById('coeff').value);
    const statFactor = (mainStat * 4 + subStat) / 100;
    if (statFactor === 0 || coeff === 0 || maxAtk === 0) { alert("請輸入正確的能力值！"); return; }
    const est = Math.round((maxAtk / coeff / statFactor) / (1 + percentAtk));
    let matched = est;
    for (let t = Math.max(1, est - 1000); t <= est + 1000; t++) {
        if (Math.round(Math.floor(t * (1 + percentAtk)) * coeff * statFactor) === Math.round(maxAtk)) { matched = t; break; }
    }
    document.getElementById('resultDisplay').innerText = matched;

    // 只帶入表攻計算器 A/B 的攻擊相關欄位
    ['A','B'].forEach(s => {
        document.getElementById(`calcBaseAtk${s}`).value    = matched;
        document.getElementById(`calcAtkPercent${s}`).value = document.getElementById('percentAtk').value;
    });
}

// 裝備主屬性反推
function calculateEquipStat() {
    const total      = parseFloat(document.getElementById('statTotal').value)    || 0;
    const base       = parseFloat(document.getElementById('statBaseOnly').value) || 0;
    const percent    = (parseFloat(document.getElementById('statPercent').value) || 0) / 100;
    const mapleOn    = document.getElementById('mapleCheckMain').checked;
    const maplePct   = parseFloat(document.getElementById('maplePercentMain').value) || 0;
    const baseAdj    = mapleOn ? base * (1 + maplePct / 100) : base;

    let found = 0;
    for (let t = 0; t <= 10000; t++) {
        if (Math.floor((baseAdj + t) * (1 + percent)) === total) { found = t; break; }
    }
    document.getElementById('equipStatDisplay').innerText = found;

    // 帶入表攻計算器 A/B 主屬性欄位
    ['A','B'].forEach(s => {
        document.getElementById(`calcMainBase${s}`).value    = base;
        document.getElementById(`calcMainEquip${s}`).value   = found;
        document.getElementById(`calcMainPercent${s}`).value = document.getElementById('statPercent').value;
    });
}

// 裝備副屬性反推
function calculateSubEquipStat() {
    const total    = parseFloat(document.getElementById('subStatTotal').value)    || 0;
    const base     = parseFloat(document.getElementById('subStatBaseOnly').value) || 0;
    const percent  = (parseFloat(document.getElementById('subStatPercent').value) || 0) / 100;
    const mapleOn  = document.getElementById('mapleCheckSub').checked;
    const maplePct = parseFloat(document.getElementById('maplePercentSub').value) || 0;
    const baseAdj  = mapleOn ? base * (1 + maplePct / 100) : base;

    let found = 0;
    for (let t = 0; t <= 10000; t++) {
        if (Math.floor((baseAdj + t) * (1 + percent)) === total) { found = t; break; }
    }
    document.getElementById('subEquipStatDisplay').innerText = found;

    // 帶入表攻計算器 A/B
    ['A','B'].forEach(s => {
        document.getElementById(`calcSubBase${s}`).value    = base;
        document.getElementById(`calcSubEquip${s}`).value   = found;
        document.getElementById(`calcSubPercent${s}`).value = document.getElementById('subStatPercent').value;
    });
}

// 計算單組表攻
function calcFinalAtk(suffix) {
    const base      = parseFloat(document.getElementById(`calcBaseAtk${suffix}`).value)    || 0;
    const atkPct    = (parseFloat(document.getElementById(`calcAtkPercent${suffix}`).value) || 0) / 100;
    const mainBase  = parseFloat(document.getElementById(`calcMainBase${suffix}`).value)   || 0;
    const mainEquip = parseFloat(document.getElementById(`calcMainEquip${suffix}`).value)  || 0;
    const mainPct   = (parseFloat(document.getElementById(`calcMainPercent${suffix}`).value)|| 0) / 100;
    const subBase   = parseFloat(document.getElementById(`calcSubBase${suffix}`).value)    || 0;
    const subEquip  = parseFloat(document.getElementById(`calcSubEquip${suffix}`).value)   || 0;
    const subPct    = (parseFloat(document.getElementById(`calcSubPercent${suffix}`).value) || 0) / 100;
    const coeff     = parseFloat(document.getElementById('coeff').value)                   || 1.0;
    const mapleOn   = document.getElementById(`mapleCheck${suffix}`).checked;
    const maplePct  = parseFloat(document.getElementById(`maplePercent${suffix}`).value)   || 0;

    const mainBaseAdj = mapleOn ? mainBase * (1 + maplePct / 100) : mainBase;
    const subBaseAdj  = mapleOn ? subBase  * (1 + maplePct / 100) : subBase;

    const totalMain  = Math.floor((mainBaseAdj + mainEquip) * (1 + mainPct));
    const totalSub   = Math.floor((subBaseAdj  + subEquip)  * (1 + subPct));
    const statFactor = (totalMain * 4 + totalSub) / 100;
    const totalAtk   = Math.floor(base * (1 + atkPct));
    const result     = Math.round(totalAtk * coeff * statFactor);

    document.getElementById(`finalAtkDisplay${suffix}`).innerText = result.toLocaleString();
}

function calculateFinalAtk() { calcFinalAtk('A'); calcFinalAtk('B'); }

// ==========================================================================
// 📊 經驗計算
// ==========================================================================

// 全域狀態
let selectedMinutes  = 10;    // 預設 10 分鐘
let timerInterval    = null;  // 計時器
let timerSeconds     = 0;     // 已計時秒數
let countdownInterval = null; // 倒數計時器
let captureStream    = null;  // 螢幕分享 stream
let captureRegion    = null;  // 框選座標 {x,y,w,h}
let startCanvas      = null;  // 起始截圖
let endCanvas        = null;  // 結束截圖

// 初始化：還原框選座標
(function initExpCalc() {
    const saved = localStorage.getItem('maple_capture_region');
    if (saved) {
        try {
            captureRegion = JSON.parse(saved);
            updateCaptureCoords();
            document.getElementById('capture-preview').innerText = '已有上次框選座標，請先授權';
            document.getElementById('btn-capture-select').innerText = '授權並截圖';
        } catch(e) {}
    }
})();

// --- 螢幕分享與框選 ---
async function startCaptureSelect() {
    try {
        const btnText = document.getElementById('btn-capture-select').innerText;
        const needReselect = btnText === '重新框選';

        // 如果已有 stream 且還活著，不重新授權
        if (!captureStream || captureStream.getTracks().every(t => t.readyState === 'ended')) {
            captureStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
            captureStream.getTracks()[0].addEventListener('ended', () => {
                captureStream = null;
                document.getElementById('btn-capture-select').innerText = captureRegion ? '授權並截圖' : '授權並框選';
                document.getElementById('capture-preview').innerText = '授權已結束';
            });
        }

        // 重新框選 或 沒有座標 → 進框選流程
        if (needReselect || !captureRegion) {
            showSelectionOverlay();
        } else {
            // 有上次座標且非重新框選 → 直接截圖
            await takePreviewShot();
            document.getElementById('btn-capture-select').innerText = '重新框選';
        }
    } catch(e) {
        alert('授權失敗或已取消：' + e.message);
    }
}

function showSelectionOverlay() {
    // vidW/vidH 改為在 video playing 後從 video.videoWidth/videoHeight 取得，
    // 避免 getDisplayMedia 剛建立時 getSettings() 回傳不正確的尺寸
    let vidW = 0;
    let vidH = 0;

    // 全螢幕容器
    const overlay = document.createElement('div');
    overlay.id = 'capture-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:99999;background:#000;display:flex;flex-direction:column;';

    // 標題列
    const titleBar = document.createElement('div');
    titleBar.style.cssText = 'background:rgba(0,0,0,0.85);padding:10px 16px;font-size:13px;color:#aaa;display:flex;justify-content:space-between;align-items:center;flex-shrink:0;';
    titleBar.innerHTML = `
        <span>🖱 拖曳框選經驗值區域，放開滑鼠完成選取</span>
        <div style="display:flex;gap:8px;align-items:center;">
            <label style="font-size:12px;color:#aaa;">縮放</label>
            <input type="range" id="zoom-slider" min="100" max="300" value="100" style="width:80px;cursor:pointer;">
            <button id="btn-change-window" style="background:#1e88e5;border:none;color:white;padding:6px 14px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:bold;">🔄 更換視窗</button>
            <button id="btn-cancel-select" style="background:#e55353;border:none;color:white;padding:6px 14px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:bold;">✕ 取消</button>
        </div>
    `;
    overlay.appendChild(titleBar);

    // 影片容器（可捲動）
    const videoWrap = document.createElement('div');
    videoWrap.style.cssText = 'position:relative;flex:1;overflow:auto;cursor:crosshair;background:#000;';

    const video = document.createElement('video');
    video.srcObject = captureStream;
    video.autoplay  = true;
    // 預設寬度 100%，高度自動，讓 video 可以被捲動容器捲動
    video.style.cssText = 'width:100%;height:auto;display:block;background:#000;';
    videoWrap.appendChild(video);

    // 載入中遮罩（等 video playing 且 vidW/vidH 確認後才移除）
    const loadingMask = document.createElement('div');
    loadingMask.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;font-size:16px;color:#aaa;z-index:10;pointer-events:all;cursor:default;';
    loadingMask.innerText = '載入中...';
    videoWrap.appendChild(loadingMask);

    // 選取框
    const selBox = document.createElement('div');
    selBox.style.cssText = 'position:absolute;border:2px solid #4dae4c;background:rgba(77,174,76,0.15);pointer-events:none;display:none;';
    videoWrap.appendChild(selBox);

    overlay.appendChild(videoWrap);
    document.body.appendChild(overlay);

    // 等瀏覽器完成 reflow 再綁定所有事件，避免第一次框選座標偏移
    requestAnimationFrame(() => {

        // 縮放滑桿（控制 video 寬度，videoWrap 可捲動，不用 transform）
        document.getElementById('zoom-slider').addEventListener('input', (e) => {
            video.style.width = e.target.value + '%';
        });

        // 取消按鈕
        document.getElementById('btn-cancel-select').addEventListener('click', () => {
            document.body.removeChild(overlay);
        });

        // 更換視窗按鈕
        document.getElementById('btn-change-window').addEventListener('click', async () => {
            document.body.removeChild(overlay);
            try {
                // 停止舊的 stream
                if (captureStream) captureStream.getTracks().forEach(t => t.stop());
                captureStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
                captureStream.getTracks()[0].addEventListener('ended', () => {
                    captureStream = null;
                    document.getElementById('btn-capture-select').innerText = captureRegion ? '授權並截圖' : '授權並框選';
                    document.getElementById('capture-preview').innerText = '授權已結束';
                });
                showSelectionOverlay();
            } catch(e) {
                alert('授權失敗或已取消：' + e.message);
            }
        });

        // video 開始播放後，從 video.videoWidth/videoHeight 取得正確解析度，
        // 確保 getDisplayMedia 剛建立時 getSettings() 尺寸不穩定的問題不影響座標換算
        video.addEventListener('playing', () => {
            vidW = video.videoWidth;
            vidH = video.videoHeight;
            loadingMask.remove();
        }, { once: true });

        // 框選邏輯
        let startX, startY, isDragging = false;

        videoWrap.addEventListener('mousedown', (e) => {
            // 遮罩還在時不允許框選
            if (loadingMask.parentNode) return;
            isDragging = true;
            const rect = videoWrap.getBoundingClientRect();
            // 加上 scrollLeft/scrollTop，確保捲動後座標正確
            startX = e.clientX - rect.left + videoWrap.scrollLeft;
            startY = e.clientY - rect.top  + videoWrap.scrollTop;
            selBox.style.cssText = `position:absolute;border:2px solid #4dae4c;background:rgba(77,174,76,0.15);pointer-events:none;display:block;left:${startX}px;top:${startY}px;width:0;height:0;`;
            e.preventDefault();
        });

        videoWrap.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            const rect = videoWrap.getBoundingClientRect();
            const cx = e.clientX - rect.left + videoWrap.scrollLeft;
            const cy = e.clientY - rect.top  + videoWrap.scrollTop;
            const w  = cx - startX, h = cy - startY;
            selBox.style.left   = (w < 0 ? cx : startX) + 'px';
            selBox.style.top    = (h < 0 ? cy : startY) + 'px';
            selBox.style.width  = Math.abs(w) + 'px';
            selBox.style.height = Math.abs(h) + 'px';
        });

        videoWrap.addEventListener('mouseup', (e) => {
            if (!isDragging) return;
            isDragging = false;

            const selRect = selBox.getBoundingClientRect();
            if (selRect.width < 10 || selRect.height < 10) return;

            // video 實際顯示寬高（受 zoom 滑桿影響）
            const videoRect = video.getBoundingClientRect();
            const dispW = videoRect.width;
            const dispH = videoRect.height;

            // 縮放比例：影片原始解析度（video.videoWidth/Height）/ video 元素顯示大小
            const scaleX = vidW / dispW;
            const scaleY = vidH / dispH;

            // selBox 的 left/top 已含 scroll offset，直接對應 video 顯示座標換算
            const selLeft = parseFloat(selBox.style.left);
            const selTop  = parseFloat(selBox.style.top);

            captureRegion = {
                x: Math.max(0, Math.round(selLeft * scaleX)),
                y: Math.max(0, Math.round(selTop  * scaleY)),
                w: Math.round(parseFloat(selBox.style.width)  * scaleX),
                h: Math.round(parseFloat(selBox.style.height) * scaleY),
            };
            captureRegion.w = Math.min(captureRegion.w, vidW - captureRegion.x);
            captureRegion.h = Math.min(captureRegion.h, vidH - captureRegion.y);

            localStorage.setItem('maple_capture_region', JSON.stringify(captureRegion));
            document.body.removeChild(overlay);
            updateCaptureCoords();
            takePreviewShot();
            document.getElementById('btn-capture-select').innerText = '重新框選';
        });

    }); // requestAnimationFrame 結束
}

function updateCaptureCoords() {
    if (!captureRegion) return;
    const el = document.getElementById('capture-coords');
    if (el) el.innerText = `X: ${captureRegion.x}　Y: ${captureRegion.y}　寬: ${captureRegion.w}　高: ${captureRegion.h}`;
}

// 截取指定區域並顯示在 canvas
// 更新解析按鈕狀態
function updateOcrBtnState() {
    const btn        = document.getElementById('btn-ocr');
    const startVal   = document.getElementById('ocr-start-val').value.trim();
    const endVal     = document.getElementById('ocr-end-val').value.trim();
    const hasScreenshots = startCanvas && endCanvas;
    const bothEmpty  = startVal === '' && endVal === '';

    // 需要：兩張截圖都有 + 兩個輸入框都空
    btn.disabled = !(hasScreenshots && bothEmpty);
}

// 解析截圖（一次解析兩張）
let ocrCooldown = false;
async function parseScreenshots() {
    if (ocrCooldown) return;
    if (!startCanvas || !endCanvas) { showToast('⚠️ 請先完成截圖！'); return; }

    const btn = document.getElementById('btn-ocr');
    btn.disabled = true;
    btn.innerText = '解析中...';

    try {
        const startResult = await ocrCanvas(startCanvas);
        const endResult = await ocrCanvas(endCanvas);

        if (startResult) document.getElementById('ocr-start-val').value = startResult;
        if (endResult)   document.getElementById('ocr-end-val').value   = endResult;

        btn.disabled = true;
        btn.innerText = '🔍 解析截圖';

        ocrCooldown = true;
        let countdown = 5;
        const cooldownInterval = setInterval(() => {
            btn.innerText = `冷卻中 ${countdown}s`;
            countdown--;
            if (countdown < 0) {
                clearInterval(cooldownInterval);
                ocrCooldown = false;
                btn.innerText = '🔍 解析截圖';
                updateOcrBtnState();
            }
        }, 1000);

    } catch(e) {
        btn.disabled = false;
        btn.innerText = '🔍 解析截圖';
        ocrCooldown = false;
    }
}

// 截圖高度不足時等比放大，確保 OCR 辨識率
function resizeCanvas(src, targetHeight) {
    const scale = targetHeight / src.height;
    const dst = document.createElement('canvas');
    dst.width  = Math.round(src.width * scale);
    dst.height = targetHeight;
    dst.getContext('2d').drawImage(src, 0, 0, dst.width, dst.height);
    return dst;
}

async function ocrCanvas(canvas) {
    try {
        // 高度不足 60px 才放大，避免多餘處理
        const resized = canvas.height < 60 ? resizeCanvas(canvas, 60) : canvas;
        const base64 = resized.toDataURL('image/png').split(',')[1];
        const res = await fetch('https://paddle-ocr.jack19950130.workers.dev', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: base64 }),
        });
        const data = await res.json();
        console.log('PaddleOCR結果：', data.text);
        const match = data.text?.match(/^[\d,]+/);
        console.log('解析數字：', match);
        return match ? match[0].replace(/,/g, '') : '';
    } catch (e) {
        showToast('⚠️ 解析失敗，請手動輸入數值');
        return '';
    }
}

async function captureRegionToCanvas() {
    try {
        const track = captureStream.getVideoTracks()[0];

        if (typeof ImageCapture !== 'undefined') {
            const imageCapture = new ImageCapture(track);
            await new Promise(r => setTimeout(r, 300));
            const bitmap = await imageCapture.grabFrame();
            const canvas = document.createElement('canvas');
            canvas.width  = captureRegion.w;
            canvas.height = captureRegion.h;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(bitmap, captureRegion.x, captureRegion.y, captureRegion.w, captureRegion.h, 0, 0, captureRegion.w, captureRegion.h);
            return canvas;
        }

        return await new Promise(resolve => {
            const video = document.createElement('video');
            video.srcObject = captureStream;
            video.autoplay  = true;
            video.onplaying = () => {
                const canvas = document.createElement('canvas');
                canvas.width  = captureRegion.w;
                canvas.height = captureRegion.h;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(video, captureRegion.x, captureRegion.y, captureRegion.w, captureRegion.h, 0, 0, captureRegion.w, captureRegion.h);
                video.pause();
                resolve(canvas);
            };
        });

    } catch(e) {
        console.error('截圖例外：', e);
        showToast('⚠️ 截圖失敗，請重試');
        return null;
    }
}

async function takePreviewShot() {
    const canvas = await captureRegionToCanvas();
    if (!canvas) return;
    const el = document.getElementById('capture-preview');
    el.innerHTML = '';
    const img = document.createElement('img');
    img.src = canvas.toDataURL();
    img.style.cssText = 'width:100%;height:auto;border-radius:4px;display:block;';
    el.appendChild(img);
}

function showCanvasInEl(canvas, elId) {
    const el = document.getElementById(elId);
    if (!el || !canvas) return;
    el.innerHTML = '';
    const img = document.createElement('img');
    img.src = canvas.toDataURL();
    img.style.cssText = 'width:100%;height:100%;object-fit:contain;border-radius:4px;';
    el.appendChild(img);
}

// --- 計時器 ---
function formatTime(seconds) {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
}

async function startExpTimer() {
    if (!captureStream || !captureRegion) { alert('請先授權並框選區域！'); return; }

    // 清空上次的截圖、解析值、結算結果
    startCanvas = null; endCanvas = null;
    document.getElementById('ocr-start-img').innerHTML = '';
    document.getElementById('ocr-end-img').innerHTML   = '';
    document.getElementById('ocr-start-val').value     = '';
    document.getElementById('ocr-end-val').value       = '';
    document.getElementById('exp-total').innerText     = '—';
    document.getElementById('exp-per10').innerText     = '—';
    document.getElementById('exp-per30').innerText     = '—';
    document.getElementById('exp-total-label').innerText = '總獲得經驗';
    updateOcrBtnState();

    document.getElementById('btn-start-timer').disabled = true;
    document.getElementById('btn-stop-timer').disabled  = false;

    // 10 秒倒數
    let countdown = 5;
    document.getElementById('timer-status').innerText = '準備中，請切換到遊戲視窗...';
    document.getElementById('timer-display').style.color = '#ff9f43';

    countdownInterval = setInterval(async () => {
        document.getElementById('timer-display').innerText = `${countdown}`;
        countdown--;
        if (countdown < 0) {
            clearInterval(countdownInterval);
            // 截起始截圖
            startCanvas = await captureRegionToCanvas();
            showCanvasInEl(startCanvas, 'ocr-start-img');
            updateOcrBtnState();
            document.getElementById('timer-display').style.color = '#64b5f6';
            document.getElementById('timer-status').innerText = '計時中...';
            timerSeconds = 0;
            timerInterval = setInterval(() => {
                timerSeconds++;
                document.getElementById('timer-display').innerText = formatTime(timerSeconds);
                // 時間到自動停止
                if (selectedMinutes > 0 && timerSeconds >= selectedMinutes * 60) {
                    stopExpTimer();
                }
            }, 1000);
        }
    }, 1000);
}

async function stopExpTimer() {
    clearInterval(timerInterval);
    clearInterval(countdownInterval);

    // 截結束截圖
    endCanvas = await captureRegionToCanvas();
    showCanvasInEl(endCanvas, 'ocr-end-img');
    updateOcrBtnState();

    document.getElementById('timer-status').innerText = `已計時 ${formatTime(timerSeconds)}`;
    document.getElementById('btn-start-timer').disabled = false;
    document.getElementById('btn-stop-timer').disabled  = true;

    // 更新結果標題
    document.getElementById('exp-total-label').innerText = `總獲得經驗（${formatTime(timerSeconds)}）`;
}

// --- 計算結果 ---
function calculateExpResult() {
    const startVal = parseFloat(document.getElementById('ocr-start-val').value) || 0;
    const endVal   = parseFloat(document.getElementById('ocr-end-val').value)   || 0;
    if (endVal <= startVal) { alert('結束數值必須大於起始數值！'); return; }
    if (timerSeconds === 0) { alert('請先完成計時！'); return; }

    const totalExp = endVal - startVal;
    const per10    = Math.round(totalExp / timerSeconds * 600);
    const per30    = Math.round(totalExp / timerSeconds * 1800);

    document.getElementById('exp-total').innerText  = totalExp.toLocaleString();
    document.getElementById('exp-per10').innerText  = per10.toLocaleString();
    document.getElementById('exp-per30').innerText  = per30.toLocaleString();

    // 選1分時額外計算桑拿經驗（8/16/20小時），否則維持 —
    if (selectedMinutes === 1) {
        const perMinute = totalExp;                             // 計時1分鐘，差值即為每分鐘獲得經驗
        document.getElementById('exp-per8h').innerText  = Math.round(perMinute * 60 * 8).toLocaleString();
        document.getElementById('exp-per16h').innerText = Math.round(perMinute * 60 * 16).toLocaleString();
        document.getElementById('exp-per20h').innerText = Math.round(perMinute * 60 * 20).toLocaleString();
    } else {
        document.getElementById('exp-per8h').innerText  = '—';
        document.getElementById('exp-per16h').innerText = '—';
        document.getElementById('exp-per20h').innerText = '—';
    }
}

// --- 休息經驗計算 ---
function calculateRestExp() {
    const current = parseFloat(document.getElementById('restCurrent').value) || 0;
    const after   = parseFloat(document.getElementById('restAfter').value)   || 0;
    if (after <= current) { alert('獲得後的數值必須大於當前數值！'); return; }

    const perMinute   = after - current;                        // 每分鐘休息經驗
    const accumulated = current / perMinute;                    // 已累積分鐘數
    const maxExp      = Math.round(perMinute * 60 * 24);       // 24小時上限
    const remainMin   = Math.max(0, 60 * 24 - accumulated);    // 距離上限分鐘數

    const accumHours   = Math.floor(accumulated / 60);
    const accumMinutes = Math.floor(accumulated % 60);
    const remainHours  = Math.floor(remainMin / 60);
    const remainMins   = Math.floor(remainMin % 60);

    document.getElementById('restAccumTime').innerText  = `${accumHours}小時${accumMinutes}分`;
    document.getElementById('restRemainTime').innerText = `${remainHours}小時${remainMins}分`;
    document.getElementById('restMaxExp').innerText     = maxExp.toLocaleString();
}