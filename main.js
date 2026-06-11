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
// 🌐 全域狀態
// ==========================================================================
let saveTimer            = null;
let lastSavedData        = null;
let members              = [];     // [{ name, checked, ratio }]
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
    const localData = localStorage.getItem('maple_tool_data');
    if (localData) {
        try {
            fillValues(JSON.parse(localData));
            updateSyncUI('synced');
            // 本地還原後同步更新右上角帳號顯示
            const kc = document.getElementById('userKeyCode')?.value.trim();
            if (kc) document.getElementById('display-keycode').innerText = kc;
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
    document.getElementById('member-table-body').addEventListener('change', onMemberTableChange);
    document.getElementById('member-table-body').addEventListener('click',  onMemberTableClick);

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
    document.getElementById('btn-toggle-exp').addEventListener('click',  (e) => toggleSection(e.currentTarget, 'exp-section'));
    document.getElementById('btnCalcRest').addEventListener('click', calculateRestExp);
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

    // Modal
    const openBtn  = document.getElementById('btn-open-list-manager');
    const closeBtn = document.getElementById('btn-close-list-manager');
    if (openBtn)  openBtn.addEventListener('click',  openListManager);
    if (closeBtn) closeBtn.addEventListener('click', closeListManager);
    document.getElementById('modal-list-manager')?.addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeListManager();
    });
    document.getElementById('modal-boss-filter')?.addEventListener('change', renderModalItemList);
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
        // 個人雲端存 checked/ratio（以名稱為 key）
        data.memberSettings = buildMemberSettings();
        await setDoc(doc(db, "player_data", kc), data, { merge: true });
        lastSavedData = JSON.parse(JSON.stringify(data));
        localStorage.setItem('maple_tool_data', JSON.stringify(data));
        updateSyncUI('synced');
        document.getElementById('display-keycode').innerText = kc;
        if (isManual) showToast("💾 手動同步成功");
    } catch (e) {
        updateSyncUI('error', '同步失敗');
        alert("❌ 儲存失敗：" + e.message);
    }
}

// 建立以名稱為 key 的個人設定物件
function buildMemberSettings() {
    const settings = {};
    members.forEach(m => { if (m.name.trim()) settings[m.name] = { checked: m.checked, ratio: m.ratio }; });
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
            document.getElementById('display-keycode').innerText = kc;
            renderBossSelect();
            renderAllDropItemSelects();
            if (!silent) alert("✅ 已建立新帳號！");
            else showAutoLoadStatus('✅ 已建立新帳號');
            return;
        }

        const data = snap.data();
        fillValues(data);

        // 合併共用名單與個人 checked/ratio
        const memberSettings = data.memberSettings || {};
        members = members.map(m => ({
            name:    m.name,
            checked: memberSettings[m.name]?.checked ?? false,
            ratio:   memberSettings[m.name]?.ratio   ?? 1
        }));
        renderMembers();

        localStorage.setItem('maple_tool_data', JSON.stringify(data));
        lastSavedData = JSON.parse(JSON.stringify(data));
        updateSyncUI('synced');
        document.getElementById('display-keycode').innerText = kc;
        updateDynamicPrices();
        calculateFinalAtk();

        // 以雲端歷史覆蓋本地
        const histSnap = await getDoc(doc(db, "player_history", kc));
        settlementHistory = histSnap.exists() ? (histSnap.data().history || []) : [];
        localStorage.setItem('maple_settlement_history', JSON.stringify(settlementHistory));
        renderHistorySelect();

        renderBossSelect();
        renderAllDropItemSelects();

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
            const d     = snap.data();
            // 共用雲端只存名稱
            const names  = d.memberNames || d.members?.map(m => m.name) || [];
            bossList     = d.bossList    || [];
            bossItemMap  = d.bossItemMap || {};
            // 還原本地個人設定
            const localData = localStorage.getItem('maple_tool_data');
            const memberSettings = localData ? (JSON.parse(localData).memberSettings || {}) : {};
            members = names.map(name => ({
                name,
                checked: memberSettings[name]?.checked ?? false,
                ratio:   memberSettings[name]?.ratio   ?? 1
            }));
        }
    } catch (e) {
        console.error("共用資料讀取失敗：", e);
        bossList    = ['混沌哈卡斯','混沌紫克圖斯','黑魔法師','希拉'];
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
        // 共用雲端只存名稱
        const memberNames = members.map(m => m.name).filter(n => n.trim() !== '');
        await setDoc(doc(db, "shared_data", "team_data"), { memberNames, bossList, bossItemMap }, { merge: false });
        // 個人設定存個人雲端
        await saveAllToCloud(false);
        alert("✅ 共用名單已同步至雲端！");
    } catch (e) { alert("同步失敗：" + e.message); }
}

function addMember() { members.push({ name: "", ratio: 1, checked: false }); renderMembers(); }
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
    const tbody = document.getElementById('member-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    members.forEach((m, i) => {
        const tr = document.createElement('tr');
        tr.style.verticalAlign = "middle";
        tr.innerHTML = `
            <td style="text-align:center;padding:4px;"><input type="checkbox" class="mem-check" data-index="${i}" ${m.checked ? 'checked' : ''}></td>
            <td style="padding:5px;"><input type="text" value="${m.name}" class="cloud-input mem-name" data-index="${i}" placeholder="名稱..."></td>
            <td style="padding:5px;"><input type="number" value="${m.ratio}" class="cloud-input mem-ratio" data-index="${i}"></td>
            <td style="text-align:center;padding:4px;"><button class="del-btn mem-del" data-index="${i}">✕</button></td>
        `;
        tbody.appendChild(tr);
    });
    refreshSellerOptions();
    refreshSnowUserOptions();
}

function getActiveMembers() { return members.filter(m => m.checked && m.name.trim() !== ''); }

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
    const memberNames = members.map(m => m.name).filter(n => n.trim() !== '');
    try { await setDoc(doc(db, "shared_data", "team_data"), { memberNames, bossList, bossItemMap }, { merge: false }); }
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
    if (e.target.classList.contains('drop-seller'))  { dropRows[i].seller  = e.target.value; }
}
function onDropTableClick(e) { if (e.target.classList.contains('drop-del')) removeDropRow(parseInt(e.target.dataset.index)); }

function addDropRow(type) {
    const i = dropRows.length;
    dropRows.push({ type, item: '', price: 0, fee: 6, scissor: 'none', seller: '', net: 0 });
    appendDropRow(i);
    expandSection('drops-section');
}

function appendDropRow(i) {
    const row    = dropRows[i];
    const isSell = row.type === 'sell';
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
                ${buildSellerOptions(row.seller)}
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

function refreshSellerOptions() {
    document.querySelectorAll('.drop-seller').forEach(sel => { const cur = sel.value; sel.innerHTML = buildSellerOptions(cur); });
}

function buildSellerOptions(selected = '') {
    const active = getActiveMembers();
    let html = '<option value="">— 選擇 —</option>';
    active.forEach(m => { html += `<option value="${m.name}" ${selected === m.name ? 'selected' : ''}>${m.name}</option>`; });
    return html;
}

// ==========================================================================
// ❄️ 雪花表格
// ==========================================================================
function onSnowTableChange(e) {
    const i = parseInt(e.target.dataset.index);
    if (isNaN(i) || !snowRows[i]) return;
    if (e.target.classList.contains('snow-user'))  snowRows[i].user  = e.target.value;
    if (e.target.classList.contains('snow-count')) { snowRows[i].count = parseFloat(e.target.value) || 0; recalcSnowRow(i); }
}
function onSnowTableClick(e) { if (e.target.classList.contains('snow-del')) removeSnowRow(parseInt(e.target.dataset.index)); }

function addSnowRow() {
    const i = snowRows.length;
    snowRows.push({ user: '', count: 0, cost: 0 });
    appendSnowRow(i);
    expandSection('drops-section');
}

function appendSnowRow(i) {
    const row = snowRows[i];
    const tr  = document.createElement('tr');
    tr.id = `snow-row-${i}`;
    tr.style.borderBottom = '1px solid #2a2a2a';
    tr.innerHTML = `
        <td style="padding:6px 4px;vertical-align:middle;">
            <select class="cloud-input snow-user" data-index="${i}" style="font-size:13px;padding:6px 8px;">
                ${buildSellerOptions(row.user)}
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
        if (!dropRows[i].item)   { alert(`第 ${i+1} 筆掉落物尚未選擇名稱！`);       return false; }
        if (!dropRows[i].seller) { alert(`第 ${i+1} 筆掉落物尚未選擇賣家/自用者！`); return false; }
    }
    for (let i = 0; i < snowRows.length; i++) {
        if (!snowRows[i].user) { alert(`第 ${i+1} 筆雪花紀錄尚未選擇使用者！`); return false; }
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

    // 每人實際收入（賣出 + 自用都算）
    const actualIncome = {};
    active.forEach(m => { actualIncome[m.name] = 0; });
    dropRows.forEach(row => {
        if (row.seller && actualIncome.hasOwnProperty(row.seller)) actualIncome[row.seller] += row.net;
    });

    // 總池
    let totalPool = 0;
    dropRows.forEach(row => { totalPool += row.net; });

    // 雪花從總池扣，記錄每人雪花成本
    const snowCostPerMember = {};
    active.forEach(m => { snowCostPerMember[m.name] = 0; });
    let totalSnowCost = 0;
    snowRows.forEach(row => {
        totalPool -= row.cost; totalSnowCost += row.cost;
        if (row.user && snowCostPerMember.hasOwnProperty(row.user)) snowCostPerMember[row.user] += row.cost;
    });

    // 每人應得 = 依比例分總池 + 加回自己雪花成本
    const totalRatio = active.reduce((s, m) => s + (m.ratio || 1), 0);
    const shouldGet  = {};
    active.forEach(m => {
        const base = Math.round((totalPool * (m.ratio || 1) / totalRatio) * 10) / 10;
        shouldGet[m.name] = Math.round((base + (snowCostPerMember[m.name] || 0)) * 10) / 10;
    });

    // 差額（正=多拿要付出，負=少拿要收回）
    const diff = {};
    active.forEach(m => { diff[m.name] = Math.round((actualIncome[m.name] - shouldGet[m.name]) * 10) / 10; });

    const payments = calcPayments(diff, active, prices);
    const result   = { totalPool, totalSnowCost, shouldGet, actualIncome, diff, payments };
    renderSettlementResult(result, active);
    lastSettlementResult = result;
    document.getElementById('btn-save-record').disabled = false;
}

function calcPayments(diff, active, prices) {
    let payers    = active.filter(m => diff[m.name] >  0.01).map(m => ({ name: m.name, amount:  diff[m.name] }));
    let receivers = active.filter(m => diff[m.name] < -0.01).map(m => ({ name: m.name, amount: -diff[m.name] }));
    const payments = [];
    let pi = 0, ri = 0;
    while (pi < payers.length && ri < receivers.length) {
        const p = payers[pi], r = receivers[ri];
        const amount = Math.round(Math.min(p.amount, r.amount) * 10) / 10;
        payments.push({ from: p.name, to: r.name, amount, ...suggestBlocks(amount, prices) });
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

    let dropsHtml = '<div class="detail-section-title">📦 掉落物收入</div>';
    if (displayDrops.length === 0) {
        dropsHtml += '<div class="detail-row" style="color:#666;">（無）</div>';
    } else {
        displayDrops.forEach(d => {
            const label = d.type === 'sell' ? `${d.item}（${d.seller}）` : `${d.item}（${d.seller} 自用）`;
            const color = d.type === 'sell' ? '#64b5f6' : '#b39ddb';
            dropsHtml += `<div class="detail-row"><span>${label}</span><span style="color:${color};">${d.net.toFixed(1)}萬</span></div>`;
        });
    }
    document.getElementById('detail-drops').innerHTML = dropsHtml;

    let snowHtml = '<div class="detail-section-title">❄️ 雪花消耗</div>';
    if (displaySnows.length === 0) {
        snowHtml += '<div class="detail-row" style="color:#666;">（無）</div>';
    } else {
        displaySnows.forEach(s => { snowHtml += `<div class="detail-row"><span>${s.user} × ${s.count}個</span><span style="color:#ff6b6b;">-${s.cost.toFixed(1)}萬</span></div>`; });
    }
    document.getElementById('detail-snow').innerHTML = snowHtml;
    document.getElementById('detail-total').innerText = totalPool.toFixed(1) + '萬';

    const tbody = document.getElementById('settlement-member-body');
    tbody.innerHTML = '';
    active.forEach(m => {
        const d = diff[m.name];
        const color = d >= 0 ? '#ff9f43' : '#64b5f6';
        const sign  = d >= 0 ? '+' : '';
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid #2a2a2a';
        tr.innerHTML = `
            <td style="padding:6px 4px;">${m.name}</td>
            <td style="padding:6px 4px;text-align:right;color:#ccc;">${(actualIncome[m.name]||0).toFixed(1)}萬</td>
            <td style="padding:6px 4px;text-align:right;color:#ccc;">${(shouldGet[m.name]||0).toFixed(1)}萬</td>
            <td style="padding:6px 4px;text-align:right;color:${color};font-weight:bold;">${sign}${d.toFixed(1)}萬</td>
        `;
        tbody.appendChild(tr);
    });

    const payEl = document.getElementById('payment-instructions');
    if (payments.length === 0) {
        payEl.innerHTML = '<div style="color:#666;font-size:13px;">無需付款，大家收支平衡！</div>';
    } else {
        payEl.innerHTML = payments.map(p => `
            <div class="payment-row">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
                    <span style="color:#ff6b6b;font-weight:bold;">${p.from}</span>
                    <span style="color:#666;">→</span>
                    <span style="color:#4dae4c;font-weight:bold;">${p.to}</span>
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
        drops:   JSON.parse(JSON.stringify(dropRows)),
        snows:   JSON.parse(JSON.stringify(snowRows)),
        members: JSON.parse(JSON.stringify(getActiveMembers()))
    };

    if (currentHistoryIndex >= 0) {
        // 覆蓋目前查看的歷史紀錄
        settlementHistory[currentHistoryIndex] = record;
    } else {
        // 新增到最前面，索引為 0
        settlementHistory.unshift(record);
        if (settlementHistory.length > 50) settlementHistory.pop();
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
    if (record.members) {
        const checkedNames = record.members.map(m => m.name);
        members = members.map(m => ({
            ...m,
            checked: checkedNames.includes(m.name),
            ratio:   record.members.find(rm => rm.name === m.name)?.ratio ?? m.ratio
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
    lastSettlementResult = record.result;
    renderSettlementResult(record.result, record.members || getActiveMembers(), record.drops, record.snows);
    document.getElementById('btn-save-record').disabled   = false;
    document.getElementById('btn-delete-record').disabled = false;
    showToast("📂 已讀取歷史紀錄");
}

// ==========================================================================
// 🪟 管理王／物品清單 Modal
// ==========================================================================
function openListManager() {
    const kc = document.getElementById('userKeyCode')?.value.trim();
    if (!kc) { alert("🔒 請先輸入代碼才能管理清單！"); return; }
    renderModalBossList();
    renderModalBossFilter();
    renderModalItemList();
    document.getElementById('modal-list-manager').classList.add('active');
}

function closeListManager() {
    document.getElementById('modal-list-manager').classList.remove('active');
}

function renderModalBossList() {
    const el = document.getElementById('modal-boss-list');
    if (!el) return;
    if (bossList.length === 0) { el.innerHTML = '<div style="color:#666;font-size:13px;">尚無王名單</div>'; return; }
    el.innerHTML = bossList.map((boss, i) => `
        <div class="modal-list-item">
            <span>${boss}</span>
            <button class="del-btn modal-del-boss" data-index="${i}" style="margin:0;">✕</button>
        </div>
    `).join('');
    el.querySelectorAll('.modal-del-boss').forEach(btn => {
        btn.addEventListener('click', async () => {
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
        <div class="modal-list-item">
            <span>${item}</span>
            <button class="del-btn modal-del-item" data-boss="${boss}" data-index="${i}" style="margin:0;">✕</button>
        </div>
    `).join('');
    el.querySelectorAll('.modal-del-item').forEach(btn => {
        btn.addEventListener('click', async () => {
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

// --- 休息經驗計算 ---
function calculateRestExp() {
    const current = parseFloat(document.getElementById('restCurrent').value) || 0;
    const after   = parseFloat(document.getElementById('restAfter').value)   || 0;
    if (after <= current) { alert('獲得後的數值必須大於當前數值！'); return; }

    const perMinute   = after - current;                        // 每分鐘休息經驗
    const accumulated = current / perMinute;                    // 已累積分鐘數
    const maxExp      = Math.round(perMinute * 60 * 24);       // 24小時上限

    const hours   = Math.floor(accumulated / 60);
    const minutes = Math.floor(accumulated % 60);

    document.getElementById('restAccumTime').innerText = `${hours}小時${minutes}分`;
    document.getElementById('restMaxExp').innerText    = maxExp.toLocaleString();
}

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
    const vTrack   = captureStream.getVideoTracks()[0];
    const settings = vTrack.getSettings();
    const vidW     = settings.width;
    const vidH     = settings.height;

    // 全螢幕容器
    const overlay = document.createElement('div');
    overlay.id = 'capture-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:99999;background:#000;display:flex;flex-direction:column;';

    // 標題列
    const titleBar = document.createElement('div');
    titleBar.style.cssText = 'background:rgba(0,0,0,0.85);padding:10px 16px;font-size:13px;color:#aaa;display:flex;justify-content:space-between;align-items:center;flex-shrink:0;';
    titleBar.innerHTML = `
        <span>🖱 拖曳框選經驗值區域，放開滑鼠完成選取</span>
        <div style="display:flex;gap:8px;">
            <button id="btn-change-window" style="background:#1e88e5;border:none;color:white;padding:6px 14px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:bold;">🔄 更換視窗</button>
            <button id="btn-cancel-select" style="background:#e55353;border:none;color:white;padding:6px 14px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:bold;">✕ 取消</button>
        </div>
    `;
    overlay.appendChild(titleBar);

    // 影片容器
    const videoWrap = document.createElement('div');
    videoWrap.style.cssText = 'position:relative;flex:1;overflow:hidden;cursor:crosshair;';

    const video = document.createElement('video');
    video.srcObject = captureStream;
    video.autoplay  = true;
    video.style.cssText = 'width:100%;height:100%;object-fit:contain;display:block;background:#000;';
    videoWrap.appendChild(video);

    // 選取框
    const selBox = document.createElement('div');
    selBox.style.cssText = 'position:absolute;border:2px solid #4dae4c;background:rgba(77,174,76,0.15);pointer-events:none;display:none;';
    videoWrap.appendChild(selBox);

    overlay.appendChild(videoWrap);
    document.body.appendChild(overlay);

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

    // 框選邏輯
    let startX, startY, isDragging = false;

    videoWrap.addEventListener('mousedown', (e) => {
        isDragging = true;
        const rect = videoWrap.getBoundingClientRect();
        startX = e.clientX - rect.left;
        startY = e.clientY - rect.top;
        selBox.style.cssText = `position:absolute;border:2px solid #4dae4c;background:rgba(77,174,76,0.15);pointer-events:none;display:block;left:${startX}px;top:${startY}px;width:0;height:0;`;
        e.preventDefault();
    });

    videoWrap.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const rect = videoWrap.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        const w  = cx - startX, h = cy - startY;
        selBox.style.left   = (w < 0 ? cx : startX) + 'px';
        selBox.style.top    = (h < 0 ? cy : startY) + 'px';
        selBox.style.width  = Math.abs(w) + 'px';
        selBox.style.height = Math.abs(h) + 'px';
    });

    videoWrap.addEventListener('mouseup', (e) => {
        if (!isDragging) return;
        isDragging = false;

        const wrapRect = videoWrap.getBoundingClientRect();
        const selRect  = selBox.getBoundingClientRect();
        if (selRect.width < 10 || selRect.height < 10) return;

        // 計算影片在 videoWrap 裡的實際顯示區域（考慮 object-fit:contain 的黑邊）
        const wrapW      = wrapRect.width;
        const wrapH      = wrapRect.height;
        const vidAspect  = vidW / vidH;
        const wrapAspect = wrapW / wrapH;

        let dispW, dispH, offX, offY;
        if (vidAspect > wrapAspect) {
            dispW = wrapW;
            dispH = wrapW / vidAspect;
            offX  = 0;
            offY  = (wrapH - dispH) / 2;
        } else {
            dispH = wrapH;
            dispW = wrapH * vidAspect;
            offX  = (wrapW - dispW) / 2;
            offY  = 0;
        }

        const relX   = selRect.left - wrapRect.left;
        const relY   = selRect.top  - wrapRect.top;
        const scaleX = vidW / dispW;
        const scaleY = vidH / dispH;

        captureRegion = {
            x: Math.max(0, Math.round((relX - offX) * scaleX)),
            y: Math.max(0, Math.round((relY - offY) * scaleY)),
            w: Math.round(selRect.width  * scaleX),
            h: Math.round(selRect.height * scaleY),
        };
        captureRegion.w = Math.min(captureRegion.w, vidW - captureRegion.x);
        captureRegion.h = Math.min(captureRegion.h, vidH - captureRegion.y);

        localStorage.setItem('maple_capture_region', JSON.stringify(captureRegion));
        document.body.removeChild(overlay);
        updateCaptureCoords();
        takePreviewShot();
        document.getElementById('btn-capture-select').innerText = '重新框選';
    });
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
        const [startResult, endResult] = await Promise.all([
            ocrCanvas(startCanvas),
            ocrCanvas(endCanvas)
        ]);

        if (startResult) document.getElementById('ocr-start-val').value = startResult;
        if (endResult)   document.getElementById('ocr-end-val').value   = endResult;

        // 解析完成後按鈕鎖住（兩個都有值）
        btn.disabled = true;
        btn.innerText = '🔍 解析截圖';

        // 5 秒冷卻
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

// Google Cloud Vision OCR
// 圖像前處理：綠色背景轉黑，白色文字保留
function preprocessCanvas(srcCanvas) {
    const dst = document.createElement('canvas');

    dst.width  = srcCanvas.width * 6;
    dst.height = srcCanvas.height * 6;

    const ctx = dst.getContext('2d');

    ctx.imageSmoothingEnabled = false;

    ctx.drawImage(
        srcCanvas,
        0,
        0,
        srcCanvas.width,
        srcCanvas.height,
        0,
        0,
        dst.width,
        dst.height
    );

    const imageData = ctx.getImageData(0, 0, dst.width, dst.height);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i+1], b = data[i+2];
        // 判斷是否為白色/淺色文字（高亮度）
        const brightness = (r + g + b) / 3;
        if (brightness > 180) {
            // 白色文字 → 保留為黑色（OCR 對黑字白底效果最好）
            data[i] = data[i+1] = data[i+2] = 0;
        } else {
            // 其他顏色（綠色背景等）→ 白色
            data[i] = data[i+1] = data[i+2] = 255;
        }
    }
    ctx.putImageData(imageData, 0, 0);
    return dst;
}

const OCR_API_KEY = 'K89346209788957';

async function ocrCanvas(canvas) {
    try {
        
        const base64 = canvas.toDataURL('image/png').split(',')[1];

        const formData = new FormData();
        formData.append('base64Image', 'data:image/png;base64,' + base64);
        formData.append('apikey', OCR_API_KEY);
        formData.append('language', 'eng');
        formData.append('isOverlayRequired', 'false');
        formData.append('detectOrientation', 'false');
        formData.append('scale', 'true');
        formData.append('OCREngine', '2'); // Engine 2 對遊戲字體較好

        const response = await fetch('https://api.ocr.space/parse/image', {
            method: 'POST',
            body: formData
        });

        if (response.status === 429) {
            showToast('⚠️ API 次數已用完，請手動輸入數值');
            throw new Error('quota exceeded');
        }

        const data = await response.json();

        if (data.IsErroredOnProcessing) {
            showToast('⚠️ 解析失敗，請手動輸入數值');
            throw new Error('ocr error');
        }

        const text = data.ParsedResults?.[0]?.ParsedText || '';
        console.log('OCR原始結果：', JSON.stringify(text));

        // 只取 [ 之前的第一組純數字
        const beforeBracket = text.split('[')[0];
        const match = beforeBracket.match(/(\d[\d,]+)/);
        if (match) return match[1].replace(/,/g, '');

        showToast('⚠️ 解析失敗，請手動輸入數值');
        return '';
    } catch(e) {
        if (e.message !== 'quota exceeded' && e.message !== 'ocr error') {
            showToast('⚠️ 解析失敗，請手動輸入數值');
        }
        throw e;
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

    const totalExp  = endVal - startVal;
    const per10     = Math.round(totalExp / timerSeconds * 600);
    const per30     = Math.round(totalExp / timerSeconds * 1800);

    document.getElementById('exp-total').innerText  = totalExp.toLocaleString();
    document.getElementById('exp-per10').innerText  = per10.toLocaleString();
    document.getElementById('exp-per30').innerText  = per30.toLocaleString();
}