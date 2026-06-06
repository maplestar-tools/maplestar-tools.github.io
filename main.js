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
window.addEventListener('DOMContentLoaded', () => {
    const localData = localStorage.getItem('maple_tool_data');
    if (localData) {
        try { fillValues(JSON.parse(localData)); updateSyncUI('synced'); }
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
    loadSharedData();
    bindEvents();
});

// ==========================================================================
// 🎯 事件綁定
// ==========================================================================
function bindEvents() {
    document.getElementById('btn-tab-home').addEventListener('click',  () => switchTab('home'));
    document.getElementById('btn-tab-money').addEventListener('click', () => switchTab('money-split'));
    document.getElementById('btn-tab-equip').addEventListener('click', () => switchTab('equip-calc'));

    document.getElementById('btn-load-cloud').addEventListener('click', loadFromCloud);
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
    document.getElementById('btnCalcFinal').addEventListener('click',     calculateFinalAtk);

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
    const map = { home: 'btn-tab-home', 'money-split': 'btn-tab-money', 'equip-calc': 'btn-tab-equip' };
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

async function loadFromCloud() {
    const kc = document.getElementById('userKeyCode')?.value.trim();
    if (!kc) { alert('請先輸入代碼！'); return; }
    try {
        const snap = await getDoc(doc(db, "player_data", kc));

        if (!snap.exists()) {
            // 新 keycode：建立新帳號，本地歷史保留並上傳
            const newData = getFormValues();
            newData.lastUpdated  = new Date().toISOString();
            newData.memberSettings = buildMemberSettings();
            await setDoc(doc(db, "player_data", kc), newData, { merge: false });
            // 上傳本地歷史到雲端
            if (settlementHistory.length > 0) {
                await setDoc(doc(db, "player_history", kc), { history: settlementHistory }, { merge: false });
            }
            lastSavedData = JSON.parse(JSON.stringify(newData));
            localStorage.setItem('maple_tool_data', JSON.stringify(newData));
            updateSyncUI('synced');
            document.getElementById('display-keycode').innerText = kc;
            renderBossSelect();
            renderAllDropItemSelects();
            alert("✅ 已建立新帳號！");
            return;
        }

        // 已存在 keycode：載入設定
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

        // 以雲端歷史覆蓋本地（已存在帳號）
        const histSnap = await getDoc(doc(db, "player_history", kc));
        settlementHistory = histSnap.exists() ? (histSnap.data().history || []) : [];
        localStorage.setItem('maple_settlement_history', JSON.stringify(settlementHistory));
        renderHistorySelect();

        renderBossSelect();
        renderAllDropItemSelects();
        alert("📥 設定讀取成功！");
    } catch (e) { alert("讀取失敗：" + e.message); }
}

// ==========================================================================
// 📋 表單資料（扁平化）
// ==========================================================================
function getFormValues() {
    const ids = [
        'moneyToMileage','cubeFancyPrice','cubeSuspiciousPrice',
        'coeff','mainStat','subStat','maxAtk','percentAtk',
        'statTotal','statBaseOnly','statPercent',
        'calcBaseAtk','calcAtkPercent','calcMainBase','calcMainEquip','calcMainPercent','calcSubStat'
    ];
    const data = {};
    ids.forEach(id => { const el = document.getElementById(id); if (el) data[id] = el.value; });
    return data;
}

function fillValues(obj) {
    for (const key in obj) {
        if (typeof obj[key] === 'object' && obj[key] !== null) continue;
        const el = document.getElementById(key);
        if (el) el.value = obj[key];
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
    if (dropRows.length > 0) {
        if (confirm("切換王將清空目前的掉落物清單，是否繼續？")) {
            dropRows = [];
            document.getElementById('drops-table-body').innerHTML = '';
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
            <input type="number" class="cloud-input drop-price" data-index="${i}" value="" placeholder="0" style="font-size:13px;padding:6px 8px;">
        </td>
        <td style="padding:6px 4px;vertical-align:middle;">
            <select class="cloud-input drop-fee ${isSell ? '' : 'field-disabled'}" data-index="${i}" style="font-size:13px;padding:6px 8px;" ${isSell ? '' : 'disabled'}>
                <option value="0">0%</option>
                <option value="3">3%</option>
                <option value="6" ${isSell ? 'selected' : ''}>6%</option>
            </select>
        </td>
        <td style="padding:6px 4px;vertical-align:middle;">
            <select class="cloud-input drop-scissor ${isSell ? '' : 'field-disabled'}" data-index="${i}" style="font-size:13px;padding:6px 8px;" ${isSell ? '' : 'disabled'}>
                <option value="none" selected>無</option>
                <option value="fancy">神奇</option>
                <option value="platinum">白金</option>
            </select>
        </td>
        <td style="padding:6px 4px;vertical-align:middle;">
            <select class="cloud-input drop-seller" data-index="${i}" style="font-size:13px;padding:6px 8px;">
                ${buildSellerOptions(row.seller)}
            </select>
        </td>
        <td style="padding:6px 4px;text-align:right;vertical-align:middle;">
            <span id="drop-net-${i}" style="color:${isSell?'#64b5f6':'#b39ddb'};font-weight:bold;font-size:13px;white-space:nowrap;">—</span>
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
            <input type="number" class="cloud-input snow-count" data-index="${i}" value="" placeholder="0" min="0" style="font-size:13px;padding:6px 8px;">
        </td>
        <td style="padding:6px 4px;text-align:right;vertical-align:middle;">
            <span id="snow-cost-${i}" style="color:#ff6b6b;font-weight:bold;font-size:13px;">—</span>
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
function clearDrops() {
    if (dropRows.length === 0 && snowRows.length === 0) return;
    if (!confirm("確定要清空本次所有掉落物和雪花資料嗎？")) return;
    dropRows = []; snowRows = [];
    document.getElementById('drops-table-body').innerHTML = '';
    document.getElementById('snow-table-body').innerHTML  = '';
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
function renderSettlementResult(result, active) {
    const { totalPool, shouldGet, actualIncome, diff, payments } = result;
    document.getElementById('settlement-detail').style.display = 'block';

    let dropsHtml = '<div class="detail-section-title">📦 掉落物收入</div>';
    if (dropRows.length === 0) {
        dropsHtml += '<div class="detail-row" style="color:#666;">（無）</div>';
    } else {
        dropRows.forEach(d => {
            const label = d.type === 'sell' ? `${d.item}（${d.seller}）` : `${d.item}（${d.seller} 自用）`;
            const color = d.type === 'sell' ? '#64b5f6' : '#b39ddb';
            dropsHtml += `<div class="detail-row"><span>${label}</span><span style="color:${color};">${d.net.toFixed(1)}萬</span></div>`;
        });
    }
    document.getElementById('detail-drops').innerHTML = dropsHtml;

    let snowHtml = '<div class="detail-section-title">❄️ 雪花消耗</div>';
    if (snowRows.length === 0) {
        snowHtml += '<div class="detail-row" style="color:#666;">（無）</div>';
    } else {
        snowRows.forEach(s => { snowHtml += `<div class="detail-row"><span>${s.user} × ${s.count}個</span><span style="color:#ff6b6b;">-${s.cost.toFixed(1)}萬</span></div>`; });
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
    settlementHistory.unshift(record);
    if (settlementHistory.length > 50) settlementHistory.pop();
    currentHistoryIndex = 0;
    localStorage.setItem('maple_settlement_history', JSON.stringify(settlementHistory));
    const kc = document.getElementById('userKeyCode')?.value.trim();
    if (kc) {
        setDoc(doc(db, "player_history", kc), { history: settlementHistory }, { merge: false })
            .catch(e => console.error("歷史雲端儲存失敗：", e));
    }
    renderHistorySelect();
    document.getElementById('btn-delete-record').disabled = false;
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
    const idx = sel?.value;
    if (idx === '' || idx === undefined) {
        currentHistoryIndex = -1;
        document.getElementById('btn-delete-record').disabled = true;
        return;
    }
    const record = settlementHistory[parseInt(idx)];
    if (!record) return;
    currentHistoryIndex = parseInt(idx);

    // 還原掉落物與雪花
    dropRows = record.drops || [];
    snowRows = record.snows || [];
    rerenderDropTable();
    rerenderSnowTable();

    // 還原王
    if (record.boss) {
        const bossEl = document.getElementById('boss-select');
        if (bossEl) { bossEl.value = record.boss; bossEl.dataset.prev = record.boss; }
        renderAllDropItemSelects();
        updateDropButtons();
    }

    // 還原日期
    if (record.date) document.getElementById('settlement-date').value = record.date;

    // 還原隊員勾選狀態（只更新畫面，不寫雲端）
    if (record.members) {
        const checkedNames = record.members.map(m => m.name);
        members = members.map(m => ({
            ...m,
            checked: checkedNames.includes(m.name),
            ratio:   record.members.find(rm => rm.name === m.name)?.ratio ?? m.ratio
        }));
        renderMembers();
    }

    lastSettlementResult = record.result;
    renderSettlementResult(record.result, record.members || getActiveMembers());
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
    document.getElementById('resultDisplay').innerText   = matched;
    document.getElementById('calcBaseAtk').value         = matched;
    document.getElementById('calcAtkPercent').value      = document.getElementById('percentAtk').value;
    document.getElementById('calcMainBase').value        = mainStat;
    document.getElementById('calcMainEquip').value       = 0;
    document.getElementById('calcMainPercent').value     = 0;
    document.getElementById('calcSubStat').value         = subStat;
}

function calculateEquipStat() {
    const total   = parseFloat(document.getElementById('statTotal').value)    || 0;
    const base    = parseFloat(document.getElementById('statBaseOnly').value) || 0;
    const percent = (parseFloat(document.getElementById('statPercent').value) || 0) / 100;
    let found = 0;
    for (let t = 0; t <= 10000; t++) { if (Math.floor((base + t) * (1 + percent)) === total) { found = t; break; } }
    document.getElementById('equipStatDisplay').innerText  = found;
    document.getElementById('calcMainBase').value          = base;
    document.getElementById('calcMainEquip').value         = found;
    document.getElementById('calcMainPercent').value       = document.getElementById('statPercent').value;
}

function calculateFinalAtk() {
    const base      = parseFloat(document.getElementById('calcBaseAtk').value)      || 0;
    const atkPct    = (parseFloat(document.getElementById('calcAtkPercent').value)   || 0) / 100;
    const mainBase  = parseFloat(document.getElementById('calcMainBase').value)     || 0;
    const mainEquip = parseFloat(document.getElementById('calcMainEquip').value)    || 0;
    const mainPct   = (parseFloat(document.getElementById('calcMainPercent').value)  || 0) / 100;
    const sub       = parseFloat(document.getElementById('calcSubStat').value)      || 0;
    const coeff     = parseFloat(document.getElementById('coeff').value)            || 1.0;
    const totalMain = Math.floor((mainBase + mainEquip) * (1 + mainPct));
    const statFactor = (totalMain * 4 + sub) / 100;
    const totalAtk  = Math.floor(base * (1 + atkPct));
    document.getElementById('finalMaxAtkDisplay').innerText = Math.round(totalAtk * coeff * statFactor).toLocaleString();
}