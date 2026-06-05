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
const db = getFirestore(app);

// ==========================================================================
// 🌐 全域狀態變數
// ==========================================================================
let saveTimer = null;           // 15 秒自動儲存計時器
let lastSavedData = null;       // 上次儲存的資料（用於比對是否有變更）
let members = [];               // 隊員名單
let bossList = [];              // 王名單
let itemList = [];              // 掉落物名單
let dropRows = [];              // 掉落物登記列表
let snowRows = [];              // 雪花消耗列表
let settlementHistory = [];     // 結算歷史紀錄

// ==========================================================================
// 🚀 DOMContentLoaded：統一初始化入口
// ==========================================================================
window.addEventListener('DOMContentLoaded', () => {

    // 1. 還原本地備份資料（優先權最高，確保離線也能用）
    const localData = localStorage.getItem('maple_tool_data');
    if (localData) {
        try {
            fillValues(JSON.parse(localData));
            updateSyncUI('synced');
        } catch (e) {
            console.error("本地資料還原失敗", e);
        }
    }

    // 2. 還原本地歷史紀錄
    const localHistory = localStorage.getItem('maple_settlement_history');
    if (localHistory) {
        try {
            settlementHistory = JSON.parse(localHistory);
            renderHistorySelect();
        } catch (e) {
            console.error("歷史紀錄還原失敗", e);
        }
    }

    // 3. 設定今天日期為預設結算日期
    const today = new Date().toISOString().split('T')[0];
    const dateEl = document.getElementById('settlement-date');
    if (dateEl) dateEl.value = today;

    // 4. 從 Firebase 載入共用資料（王名單、掉落物名單、隊員）
    updateDynamicPrices();
    loadSharedData();

    // 5. 全域 input 事件監聽（觸發自動儲存）
    document.addEventListener('input', (event) => {
        const el = event.target;
        if ((el.tagName === 'INPUT' || el.tagName === 'SELECT') && el.id !== 'userKeyCode') {
            triggerAutoSave();
        }
    });

    // 6. 綁定所有按鈕事件
    bindEvents();
});

// ==========================================================================
// 🎯 事件綁定總覽
// ==========================================================================
function bindEvents() {

    // --- 分頁切換 ---
    document.getElementById('btn-tab-home').addEventListener('click', () => switchTab('home'));
    document.getElementById('btn-tab-money').addEventListener('click', () => switchTab('money-split'));
    document.getElementById('btn-tab-equip').addEventListener('click', () => switchTab('equip-calc'));

    // --- 雲端同步 ---
    document.getElementById('btn-load-cloud').addEventListener('click', loadFromCloud);
    document.getElementById('btn-manual-sync').addEventListener('click', () => saveAllToCloud(true));

    // --- 折疊開關 ---
    document.getElementById('btn-toggle-member').addEventListener('click', (e) => toggleSection(e.currentTarget, 'member-section'));
    document.getElementById('btn-toggle-drops').addEventListener('click', (e) => toggleSection(e.currentTarget, 'drops-section'));
    document.getElementById('btn-toggle-settlement').addEventListener('click', (e) => toggleSection(e.currentTarget, 'settlement-section'));

    // --- 隊員管理 ---
    document.getElementById('btn-add-member').addEventListener('click', addMember);
    document.getElementById('btn-save-members').addEventListener('click', saveMembersToCloud);

    // 隊員表格事件委派（change & click）
    document.getElementById('member-table-body').addEventListener('change', (e) => {
        const idx = e.target.dataset.index;
        if (e.target.classList.contains('mem-check')) members[idx].checked = e.target.checked;
        if (e.target.classList.contains('mem-name'))  updateMemberData(idx, 'name', e.target.value);
        if (e.target.classList.contains('mem-ratio')) updateMemberData(idx, 'ratio', parseFloat(e.target.value));
    });
    document.getElementById('member-table-body').addEventListener('click', (e) => {
        if (e.target.classList.contains('mem-del')) removeMember(e.target.dataset.index);
    });

    // --- 掉落物登記 ---
    document.getElementById('btn-add-drop-sell').addEventListener('click', () => addDropRow('sell'));
    document.getElementById('btn-add-drop-self').addEventListener('click', () => addDropRow('self'));

    // 掉落物表格事件委派
    document.getElementById('drops-table-body').addEventListener('change', (e) => {
        const idx = e.target.dataset.index;
        if (idx === undefined) return;
        if (e.target.classList.contains('drop-item'))  { dropRows[idx].item    = e.target.value; handleDropItemChange(e.target, idx); }
        if (e.target.classList.contains('drop-price')) { dropRows[idx].price   = parseFloat(e.target.value) || 0; recalcDropRow(idx); }
        if (e.target.classList.contains('drop-fee'))   { dropRows[idx].fee     = parseFloat(e.target.value) || 0; recalcDropRow(idx); }
        if (e.target.classList.contains('drop-scissor')){ dropRows[idx].scissor = e.target.value; recalcDropRow(idx); }
        if (e.target.classList.contains('drop-seller')){ dropRows[idx].seller  = e.target.value; }
    });
    document.getElementById('drops-table-body').addEventListener('click', (e) => {
        if (e.target.classList.contains('drop-del')) removeDropRow(e.target.dataset.index);
    });

    // 王選擇下拉（監聽「新增王」選項）
    document.getElementById('boss-select').addEventListener('change', (e) => {
        if (e.target.value === '__add_new__') handleAddNew('boss', e.target);
    });

    // --- 雪花消耗 ---
    document.getElementById('btn-add-snow').addEventListener('click', addSnowRow);
    document.getElementById('snow-table-body').addEventListener('change', (e) => {
        const idx = e.target.dataset.index;
        if (idx === undefined) return;
        if (e.target.classList.contains('snow-user'))  { snowRows[idx].user   = e.target.value; }
        if (e.target.classList.contains('snow-count')) { snowRows[idx].count  = parseFloat(e.target.value) || 0; recalcSnowRow(idx); }
    });
    document.getElementById('snow-table-body').addEventListener('click', (e) => {
        if (e.target.classList.contains('snow-del')) removeSnowRow(e.target.dataset.index);
    });

    // --- 結算 ---
    document.getElementById('btn-settle').addEventListener('click', executeSettlement);
    document.getElementById('btn-clear-settlement').addEventListener('click', clearSettlement);
    document.getElementById('history-select').addEventListener('change', loadHistoryRecord);

    // --- 裝備計算 ---
    document.getElementById('btnCalcBaseAtk').addEventListener('click', calculateBaseAtk);
    document.getElementById('btnCalcEquipStat').addEventListener('click', calculateEquipStat);
    document.getElementById('btnCalcFinal').addEventListener('click', calculateFinalAtk);
}

// ==========================================================================
// 🗂️ 分頁切換
// ==========================================================================
function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    const btnMap = { home: 'btn-tab-home', 'money-split': 'btn-tab-money', 'equip-calc': 'btn-tab-equip' };
    if (btnMap[tabId]) document.getElementById(btnMap[tabId]).classList.add('active');
}

// ==========================================================================
// 📂 折疊開關（修正 scrollHeight 動態計算）
// ==========================================================================
function toggleSection(headerEl, sectionId) {
    const content = document.getElementById(sectionId);
    if (!content) return;
    const span = headerEl.querySelector('span');
    if (content.style.maxHeight && content.style.maxHeight !== '0px') {
        content.style.maxHeight = '0px';
        if (span) span.innerText = '▼';
    } else {
        content.style.maxHeight = content.scrollHeight + 500 + "px"; // +500 預留動態新增的空間
        if (span) span.innerText = '▲';
    }
}

// 動態新增列後重新撐開折疊區域
function expandSection(sectionId) {
    const content = document.getElementById(sectionId);
    if (!content || content.style.maxHeight === '0px') return;
    content.style.maxHeight = content.scrollHeight + 500 + "px";
}

// ==========================================================================
// ☁️ 雲端同步系統
// ==========================================================================

// 狀態燈 UI 更新
function updateSyncUI(status, message = "") {
    const dot  = document.getElementById('sync-dot');
    const text = document.getElementById('sync-status-text');
    const states = {
        synced:  { color: '#4caf50', label: '已同步' },
        pending: { color: '#ff9800', label: '同步中...' },
        error:   { color: '#f44336', label: '同步失敗' }
    };
    if (dot && text) {
        dot.style.backgroundColor = states[status]?.color || '#ccc';
        text.innerText = message || states[status]?.label || '';
    }
}

// 自動儲存觸發器（防抖 15 秒）
function triggerAutoSave() {
    updateDynamicPrices();

    // 本地即時備份
    const currentData = getFormValues();
    localStorage.setItem('maple_tool_data', JSON.stringify(currentData));

    const keyCode = document.getElementById('userKeyCode')?.value.trim();
    if (keyCode) {
        updateSyncUI('pending');
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
            if (JSON.stringify(currentData) !== JSON.stringify(lastSavedData)) {
                saveAllToCloud(false);
            } else {
                updateSyncUI('synced');
            }
        }, 15000);
    }
}

// 雲端寫入
async function saveAllToCloud(isManual = false) {
    const keyCode = document.getElementById('userKeyCode')?.value.trim();
    if (!keyCode) {
        if (isManual) alert("請先輸入代碼！");
        return;
    }
    updateSyncUI('pending', isManual ? '同步中...' : '自動同步...');
    try {
        const dataToSave = getFormValues();
        dataToSave.lastUpdated = new Date().toISOString();
        await setDoc(doc(db, "player_data", keyCode), dataToSave, { merge: true });

        // 同步歷史紀錄
        await setDoc(doc(db, "player_history", keyCode), { history: settlementHistory }, { merge: false });

        lastSavedData = JSON.parse(JSON.stringify(dataToSave));
        localStorage.setItem('maple_tool_data', JSON.stringify(dataToSave));
        updateSyncUI('synced');
        document.getElementById('display-keycode').innerText = keyCode;
        if (isManual) showToast("💾 手動同步成功");
    } catch (e) {
        updateSyncUI('error', '同步失敗');
        alert("❌ 儲存失敗：" + e.message);
    }
}

// 雲端讀取
async function loadFromCloud() {
    const keyCode = document.getElementById('userKeyCode')?.value.trim();
    if (!keyCode) { alert('請先輸入代碼！'); return; }
    try {
        // 讀取設定
        const docSnap = await getDoc(doc(db, "player_data", keyCode));
        if (!docSnap.exists()) { alert("找不到資料"); return; }
        const data = docSnap.data();
        fillValues(data);
        localStorage.setItem('maple_tool_data', JSON.stringify(data));
        lastSavedData = JSON.parse(JSON.stringify(data));
        updateSyncUI('synced');
        document.getElementById('display-keycode').innerText = keyCode;
        updateDynamicPrices();
        calculateFinalAtk();

        // 讀取歷史紀錄
        const histSnap = await getDoc(doc(db, "player_history", keyCode));
        if (histSnap.exists()) {
            settlementHistory = histSnap.data().history || [];
            localStorage.setItem('maple_settlement_history', JSON.stringify(settlementHistory));
            renderHistorySelect();
        }

        alert("📥 設定讀取成功！");
    } catch (e) {
        alert("讀取失敗：" + e.message);
    }
}

// ==========================================================================
// 📋 表單資料存取（扁平化結構，修正 fillValues 問題）
// ==========================================================================

// 取得所有表單值（扁平化）
function getFormValues() {
    const ids = [
        'moneyToMileage', 'cubeFancyPrice', 'cubeSuspiciousPrice',
        'coeff', 'mainStat', 'subStat', 'maxAtk', 'percentAtk',
        'statTotal', 'statBaseOnly', 'statPercent',
        'calcBaseAtk', 'calcAtkPercent', 'calcMainBase',
        'calcMainEquip', 'calcMainPercent', 'calcSubStat'
    ];
    const data = {};
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) data[id] = el.value;
    });
    return data;
}

// 填入表單值
function fillValues(obj) {
    for (const key in obj) {
        if (typeof obj[key] === 'object' && obj[key] !== null) continue; // 跳過巢狀物件
        const el = document.getElementById(key);
        if (el) el.value = obj[key];
    }
}

// Toast 提示
function showToast(message) {
    const toast = document.getElementById("toast");
    if (toast) {
        toast.textContent = message;
        toast.style.display = "block";
        setTimeout(() => { toast.style.display = "none"; }, 3000);
    }
}

// ==========================================================================
// 💰 團隊分紅：動態價格計算
// ==========================================================================
function updateDynamicPrices() {
    const mileageRatio = parseFloat(document.getElementById('moneyToMileage')?.value) || 10000;
    const getPriceInWan = (mileage) => ((mileage / mileageRatio) * 1000).toFixed(1);
    const el = (id) => document.getElementById(id);
    if (el('priceFancy'))    el('priceFancy').innerText    = getPriceInWan(3900);
    if (el('pricePlatinum')) el('pricePlatinum').innerText = getPriceInWan(7100);
    if (el('priceSnow'))     el('priceSnow').innerText     = getPriceInWan(3500 / 11);
}

// 取得目前剪刀/雪花價格
function getPrices() {
    const mileageRatio = parseFloat(document.getElementById('moneyToMileage')?.value) || 10000;
    const toWan = (m) => (m / mileageRatio) * 1000;
    return {
        fancy:      toWan(3900),
        platinum:   toWan(7100),
        snow:       toWan(3500 / 11),
        cubeFancy:  parseFloat(document.getElementById('cubeFancyPrice')?.value) || 0,
        cubeSuspicious: parseFloat(document.getElementById('cubeSuspiciousPrice')?.value) || 0
    };
}

// ==========================================================================
// 👥 隊員管理
// ==========================================================================
async function loadSharedData() {
    try {
        // 讀取共用隊員、王名單、掉落物名單
        const snap = await getDoc(doc(db, "shared_data", "team_data"));
        if (snap.exists()) {
            const data = snap.data();
            members  = data.members  || [];
            bossList = data.bossList || [];
            itemList = data.itemList || [];
        }
    } catch (e) {
        console.error("共用資料讀取失敗：", e);
        // 預設王名單與掉落物名單
        bossList = ['混沌哈卡斯', '混沌紫克圖斯', '黑魔法師', '希拉'];
        itemList = ['楓葉勳章', '強化卷軸', '100%白卷', '記憶玫瑰', '惡魔羽翼'];
    } finally {
        renderMembers();
        renderBossSelect();
        renderDropItemOptions();
    }
}

async function saveMembersToCloud() {
    const keyCode = document.getElementById('userKeyCode').value.trim();
    if (!keyCode) { alert("🔒 尚未登入代碼，無法同步！"); return; }
    try {
        await setDoc(doc(db, "shared_data", "team_data"), {
            members:  members,
            bossList: bossList,
            itemList: itemList
        }, { merge: false });
        alert("✅ 共用名單已同步至雲端！");
    } catch (e) {
        alert("同步失敗：" + e.message);
    }
}

function addMember() {
    members.push({ name: "", ratio: 1, checked: false });
    renderMembers();
}

function removeMember(index) {
    members.splice(index, 1);
    renderMembers();
}

function updateMemberData(index, field, value) {
    members[index][field] = value;
}

function renderMembers() {
    const tbody = document.getElementById('member-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    members.forEach((member, index) => {
        const tr = document.createElement('tr');
        tr.style.verticalAlign = "middle";
        tr.innerHTML = `
            <td style="text-align: center; padding: 4px;">
                <input type="checkbox" class="mem-check" data-index="${index}" ${member.checked ? 'checked' : ''}>
            </td>
            <td style="padding: 5px;">
                <input type="text" value="${member.name}" class="cloud-input mem-name" data-index="${index}" placeholder="名稱...">
            </td>
            <td style="padding: 5px;">
                <input type="number" value="${member.ratio}" class="cloud-input mem-ratio" data-index="${index}">
            </td>
            <td style="text-align: center; padding: 4px;">
                <button class="del-btn mem-del" data-index="${index}">✕</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
    // 隊員更新後，同步更新掉落物/雪花的隊員選單
    refreshSellerOptions();
    refreshSnowUserOptions();
}

// 取得目前勾選的隊員列表
function getActiveMembers() {
    return members.filter(m => m.checked && m.name.trim() !== '');
}

// ==========================================================================
// 👑 王選擇下拉選單
// ==========================================================================
function renderBossSelect() {
    const sel = document.getElementById('boss-select');
    if (!sel) return;
    const current = sel.value;
    sel.innerHTML = '<option value="">— 選擇王 —</option>';
    bossList.forEach(boss => {
        sel.innerHTML += `<option value="${boss}" ${current === boss ? 'selected' : ''}>${boss}</option>`;
    });
    // 有 keycode 才顯示新增選項
    const keyCode = document.getElementById('userKeyCode')?.value.trim();
    if (keyCode) {
        sel.innerHTML += `<option value="__add_new__">＋ 新增王...</option>`;
    }
}

// ==========================================================================
// 📦 掉落物清單下拉選單
// ==========================================================================
function renderDropItemOptions() {
    // 重新渲染現有所有列的 item 選單
    document.querySelectorAll('.drop-item').forEach(sel => {
        const current = sel.value;
        sel.innerHTML = buildItemOptions(current);
    });
}

function buildItemOptions(selected = '') {
    const keyCode = document.getElementById('userKeyCode')?.value.trim();
    let html = '<option value="">— 選擇物品 —</option>';
    itemList.forEach(item => {
        html += `<option value="${item}" ${selected === item ? 'selected' : ''}>${item}</option>`;
    });
    if (keyCode) {
        html += `<option value="__add_new__">＋ 新增物品...</option>`;
    }
    return html;
}

// 處理新增王/物品的 prompt
function handleAddNew(type, selectEl) {
    const label = type === 'boss' ? '王名稱' : '物品名稱';
    const name = prompt(`請輸入新的${label}：`);
    if (!name || name.trim() === '') {
        selectEl.value = '';
        return;
    }
    const trimmed = name.trim();
    if (type === 'boss') {
        if (!bossList.includes(trimmed)) bossList.push(trimmed);
        renderBossSelect();
        document.getElementById('boss-select').value = trimmed;
        saveBossAndItemList();
    } else {
        if (!itemList.includes(trimmed)) itemList.push(trimmed);
        selectEl.innerHTML = buildItemOptions(trimmed);
        selectEl.value = trimmed;
        saveBossAndItemList();
    }
}

// 儲存王名單與物品名單到共用雲端
async function saveBossAndItemList() {
    const keyCode = document.getElementById('userKeyCode')?.value.trim();
    if (!keyCode) return;
    try {
        await setDoc(doc(db, "shared_data", "team_data"), {
            members:  members,
            bossList: bossList,
            itemList: itemList
        }, { merge: false });
    } catch (e) {
        console.error("名單儲存失敗：", e);
    }
}

// ==========================================================================
// 📦 掉落物登記表格
// ==========================================================================

// 新增一列掉落物
function addDropRow(type) {
    const idx = dropRows.length;
    dropRows.push({ type, item: '', price: 0, fee: 6, scissor: 'none', seller: '', net: 0 });
    renderDropRow(idx);
    expandSection('drops-section');
}

// 渲染單一掉落物列
function renderDropRow(idx) {
    const row = dropRows[idx];
    const isSell = row.type === 'sell';
    const tbody = document.getElementById('drops-table-body');

    const tr = document.createElement('tr');
    tr.id = `drop-row-${idx}`;
    tr.style.borderBottom = '1px solid #333';
    tr.innerHTML = `
        <td style="padding: 6px 4px; text-align: center; vertical-align: middle;">
            <span class="drop-type-badge ${isSell ? 'badge-sell' : 'badge-self'}">${isSell ? '賣' : '自'}</span>
        </td>
        <td style="padding: 6px 4px; vertical-align: middle;">
            <select class="cloud-input drop-item" data-index="${idx}" style="font-size: 13px; padding: 6px 8px;">
                ${buildItemOptions(row.item)}
            </select>
        </td>
        <td style="padding: 6px 4px; vertical-align: middle;">
            <input type="number" class="cloud-input drop-price" data-index="${idx}" value="${row.price}" placeholder="0" style="font-size: 13px; padding: 6px 8px;">
        </td>
        <td style="padding: 6px 4px; vertical-align: middle;">
            <select class="cloud-input drop-fee ${isSell ? '' : 'field-disabled'}" data-index="${idx}" style="font-size: 13px; padding: 6px 8px;" ${isSell ? '' : 'disabled'}>
                <option value="0" ${row.fee === 0 ? 'selected' : ''}>0%</option>
                <option value="3" ${row.fee === 3 ? 'selected' : ''}>3%</option>
                <option value="6" ${row.fee === 6 ? 'selected' : ''}>6%</option>
            </select>
        </td>
        <td style="padding: 6px 4px; vertical-align: middle;">
            <select class="cloud-input drop-scissor ${isSell ? '' : 'field-disabled'}" data-index="${idx}" style="font-size: 13px; padding: 6px 8px;" ${isSell ? '' : 'disabled'}>
                <option value="none" ${row.scissor === 'none' ? 'selected' : ''}>無</option>
                <option value="fancy" ${row.scissor === 'fancy' ? 'selected' : ''}>神奇</option>
                <option value="platinum" ${row.scissor === 'platinum' ? 'selected' : ''}>白金</option>
            </select>
        </td>
        <td style="padding: 6px 4px; vertical-align: middle;">
            <select class="cloud-input drop-seller" data-index="${idx}" style="font-size: 13px; padding: 6px 8px;">
                ${buildSellerOptions(row.seller)}
            </select>
        </td>
        <td style="padding: 6px 4px; text-align: right; vertical-align: middle;">
            <span id="drop-net-${idx}" style="color: ${isSell ? '#64b5f6' : '#b39ddb'}; font-weight: bold; font-size: 13px; white-space: nowrap;">0萬</span>
        </td>
        <td style="padding: 6px 4px; text-align: center; vertical-align: middle;">
            <button class="del-btn drop-del" data-index="${idx}">✕</button>
        </td>
    `;
    tbody.appendChild(tr);
    recalcDropRow(idx);
}

// 計算單一掉落物淨收入
function recalcDropRow(idx) {
    const row = dropRows[idx];
    const prices = getPrices();
    let net = row.price;
    if (row.type === 'sell') {
        net = row.price * (1 - row.fee / 100);
        if (row.scissor === 'fancy')    net -= prices.fancy;
        if (row.scissor === 'platinum') net -= prices.platinum;
    }
    net = Math.round(net * 10) / 10;
    dropRows[idx].net = net;
    const el = document.getElementById(`drop-net-${idx}`);
    if (el) el.innerText = net.toFixed(1) + '萬';
}

// 刪除掉落物列
function removeDropRow(index) {
    dropRows.splice(index, 1);
    rerenderAllDropRows();
}

// 完整重繪掉落物表格（刪除後 index 需要更新）
function rerenderAllDropRows() {
    document.getElementById('drops-table-body').innerHTML = '';
    const temp = [...dropRows];
    dropRows = [];
    temp.forEach((row, i) => {
        dropRows.push(row);
        renderDropRow(i);
    });
}

// 當物品下拉選到「新增」時
function handleDropItemChange(selectEl, idx) {
    if (selectEl.value === '__add_new__') {
        handleAddNew('item', selectEl);
        dropRows[idx].item = selectEl.value === '__add_new__' ? '' : selectEl.value;
    }
}

// 建立賣家選單 HTML
function buildSellerOptions(selected = '') {
    const active = getActiveMembers();
    let html = '<option value="">— 選擇 —</option>';
    active.forEach(m => {
        html += `<option value="${m.name}" ${selected === m.name ? 'selected' : ''}>${m.name}</option>`;
    });
    return html;
}

// 更新所有掉落物列的賣家選單
function refreshSellerOptions() {
    document.querySelectorAll('.drop-seller').forEach(sel => {
        const current = sel.value;
        sel.innerHTML = buildSellerOptions(current);
    });
}

// ==========================================================================
// ❄️ 雪花消耗表格
// ==========================================================================

function addSnowRow() {
    const idx = snowRows.length;
    snowRows.push({ user: '', count: 0, cost: 0 });
    renderSnowRow(idx);
    expandSection('drops-section');
}

function renderSnowRow(idx) {
    const row = snowRows[idx];
    const tbody = document.getElementById('snow-table-body');
    const tr = document.createElement('tr');
    tr.id = `snow-row-${idx}`;
    tr.style.borderBottom = '1px solid #333';
    tr.innerHTML = `
        <td style="padding: 6px 4px; vertical-align: middle;">
            <select class="cloud-input snow-user" data-index="${idx}" style="font-size: 13px; padding: 6px 8px;">
                ${buildSellerOptions(row.user)}
            </select>
        </td>
        <td style="padding: 6px 4px; vertical-align: middle;">
            <input type="number" class="cloud-input snow-count" data-index="${idx}" value="${row.count}" min="0" style="font-size: 13px; padding: 6px 8px;">
        </td>
        <td style="padding: 6px 4px; text-align: right; vertical-align: middle;">
            <span id="snow-cost-${idx}" style="color: #ff6b6b; font-weight: bold; font-size: 13px;">0萬</span>
        </td>
        <td style="padding: 6px 4px; text-align: center; vertical-align: middle;">
            <button class="del-btn snow-del" data-index="${idx}">✕</button>
        </td>
    `;
    tbody.appendChild(tr);
    recalcSnowRow(idx);
}

function recalcSnowRow(idx) {
    const row = snowRows[idx];
    const prices = getPrices();
    const cost = Math.round(row.count * prices.snow * 10) / 10;
    snowRows[idx].cost = cost;
    const el = document.getElementById(`snow-cost-${idx}`);
    if (el) el.innerText = cost.toFixed(1) + '萬';
}

function removeSnowRow(index) {
    snowRows.splice(index, 1);
    rerenderAllSnowRows();
}

function rerenderAllSnowRows() {
    document.getElementById('snow-table-body').innerHTML = '';
    const temp = [...snowRows];
    snowRows = [];
    temp.forEach((row, i) => {
        snowRows.push(row);
        renderSnowRow(i);
    });
}

function refreshSnowUserOptions() {
    document.querySelectorAll('.snow-user').forEach(sel => {
        const current = sel.value;
        sel.innerHTML = buildSellerOptions(current);
    });
}

// ==========================================================================
// 🧮 結算引擎
// ==========================================================================

function executeSettlement() {
    const activeMembers = getActiveMembers();
    if (activeMembers.length === 0) { alert("請先在隊員表格勾選參加的隊員！"); return; }
    if (dropRows.length === 0 && snowRows.length === 0) { alert("請先登記掉落物或雪花！"); return; }

    const prices = getPrices();

    // --- 1. 計算每人實際收入（只算賣出的掉落物，自用不是現金收入） ---
    const actualIncome = {};
    activeMembers.forEach(m => { actualIncome[m.name] = 0; });

    dropRows.forEach(row => {
        if (!row.seller || !actualIncome.hasOwnProperty(row.seller)) return;
        if (row.type === 'sell') {
            actualIncome[row.seller] += row.net;
        }
    });

    // --- 2. 計算總可分配淨額 ---
    // 賣出收入 + 自用估價（自用者要付這筆錢進團）
    let totalPool = 0;
    const dropDetails = [];
    const snowDetails = [];

    dropRows.forEach(row => {
        totalPool += row.net; // sell 的淨收入 or self 的估價，都算入總池
        dropDetails.push({ name: row.item || '未命名', net: row.net, type: row.type, seller: row.seller });
    });

    // 扣雪花成本
    let totalSnowCost = 0;
    snowRows.forEach(row => {
        totalSnowCost += row.cost;
        snowDetails.push({ user: row.user, count: row.count, cost: row.cost });
    });
    totalPool -= totalSnowCost;

    // --- 3. 計算每人應得金額（依比例） ---
    const totalRatio = activeMembers.reduce((sum, m) => sum + (m.ratio || 1), 0);
    const shouldGet = {};
    activeMembers.forEach(m => {
        shouldGet[m.name] = Math.round((totalPool * (m.ratio || 1) / totalRatio) * 10) / 10;
    });

    // --- 4. 計算每人差額（實際收入 - 應得金額，自用者要額外支付估價） ---
    const diff = {};
    activeMembers.forEach(m => { diff[m.name] = actualIncome[m.name] - shouldGet[m.name]; });

    // 自用者需額外付估價進團（因為他拿了物品但沒付現金）
    dropRows.forEach(row => {
        if (row.type === 'self' && row.seller && diff.hasOwnProperty(row.seller)) {
            diff[row.seller] -= row.net; // 等同於自用者多欠了這筆
        }
    });

    // --- 5. 計算付款指示（誰欠錢給誰，最小化轉帳次數） ---
    const payments = calculatePayments(diff, activeMembers, prices);

    // --- 6. 渲染結果 ---
    renderSettlementResult(dropDetails, snowDetails, totalPool, totalSnowCost, activeMembers, shouldGet, actualIncome, diff, payments);

    // --- 7. 儲存紀錄 ---
    saveSettlementRecord({
        date: document.getElementById('settlement-date')?.value || new Date().toISOString().split('T')[0],
        boss: document.getElementById('boss-select')?.value || '未知',
        drops: dropRows,
        snows: snowRows,
        result: { totalPool, shouldGet, actualIncome, diff, payments }
    });
}

// 計算付款指示（貪心算法）
function calculatePayments(diff, activeMembers, prices) {
    // 正差額 = 收多了（要付出去），負差額 = 收少了（要收回來）
    let creditors = []; // 應收錢的人（diff > 0，因為賣多了）
    let debtors   = []; // 應付錢的人（diff < 0，因為收少了）

    activeMembers.forEach(m => {
        const d = Math.round(diff[m.name] * 10) / 10;
        if (d > 0.01)  creditors.push({ name: m.name, amount: d });
        if (d < -0.01) debtors.push({ name: m.name, amount: -d });
    });

    const payments = [];
    let ci = 0, di = 0;
    while (ci < creditors.length && di < debtors.length) {
        const c = creditors[ci];
        const d = debtors[di];
        const amount = Math.min(c.amount, d.amount);
        const blockSuggestion = suggestBlocks(amount, prices);
        payments.push({ from: d.name, to: c.name, amount, ...blockSuggestion });
        c.amount -= amount;
        d.amount -= amount;
        if (c.amount < 0.01) ci++;
        if (d.amount < 0.01) di++;
    }
    return payments;
}

// 建議方塊組合（奇幻優先，再可疑，剩餘楓幣）
function suggestBlocks(amount, prices) {
    let remaining = amount;
    let fancyCount = 0;
    let suspiciousCount = 0;

    if (prices.cubeFancy > 0) {
        fancyCount = Math.floor(remaining / prices.cubeFancy);
        remaining = Math.round((remaining - fancyCount * prices.cubeFancy) * 10) / 10;
    }
    if (prices.cubeSuspicious > 0) {
        suspiciousCount = Math.floor(remaining / prices.cubeSuspicious);
        remaining = Math.round((remaining - suspiciousCount * prices.cubeSuspicious) * 10) / 10;
    }
    return { fancyCount, suspiciousCount, remainder: remaining };
}

// ==========================================================================
// 🖼️ 結算結果渲染
// ==========================================================================
function renderSettlementResult(dropDetails, snowDetails, totalPool, totalSnowCost, activeMembers, shouldGet, actualIncome, diff, payments) {
    const detailEl = document.getElementById('settlement-detail');
    if (detailEl) detailEl.style.display = 'block';

    // --- 收支明細 ---
    const detailDropsEl = document.getElementById('detail-drops');
    if (detailDropsEl) {
        let html = '<div class="detail-section-title">📦 掉落物收入</div>';
        if (dropDetails.length === 0) {
            html += '<div class="detail-row" style="color:#666;">（無）</div>';
        } else {
            dropDetails.forEach(d => {
                const label = d.type === 'sell'
                    ? `${d.name}（${d.seller || '未指定'}）`
                    : `${d.name}（${d.seller || '未指定'} 自用）`;
                const color = d.type === 'sell' ? '#64b5f6' : '#b39ddb';
                html += `<div class="detail-row"><span>${label}</span><span style="color:${color};">${d.net.toFixed(1)}萬</span></div>`;
            });
        }
        detailDropsEl.innerHTML = html;
    }

    const detailSnowEl = document.getElementById('detail-snow');
    if (detailSnowEl) {
        let html = '<div class="detail-section-title">❄️ 雪花消耗</div>';
        if (snowDetails.length === 0) {
            html += '<div class="detail-row" style="color:#666;">（無）</div>';
        } else {
            snowDetails.forEach(s => {
                html += `<div class="detail-row"><span>${s.user || '未指定'} × ${s.count}個</span><span style="color:#ff6b6b;">-${s.cost.toFixed(1)}萬</span></div>`;
            });
        }
        detailSnowEl.innerHTML = html;
    }

    const totalEl = document.getElementById('detail-total');
    if (totalEl) totalEl.innerText = totalPool.toFixed(1) + '萬';

    // --- 每人分紅明細 ---
    const memberBody = document.getElementById('settlement-member-body');
    if (memberBody) {
        memberBody.innerHTML = '';
        activeMembers.forEach(m => {
            const d = Math.round(diff[m.name] * 10) / 10;
            const color = d >= 0 ? '#4dae4c' : '#ff6b6b';
            const sign  = d >= 0 ? '+' : '';
            const tr = document.createElement('tr');
            tr.style.borderBottom = '1px solid #2a2a2a';
            tr.innerHTML = `
                <td style="padding: 6px 4px;">${m.name}</td>
                <td style="padding: 6px 4px; text-align: right; color: #ccc;">${(actualIncome[m.name] || 0).toFixed(1)}萬</td>
                <td style="padding: 6px 4px; text-align: right; color: #ccc;">${(shouldGet[m.name] || 0).toFixed(1)}萬</td>
                <td style="padding: 6px 4px; text-align: right; color: ${color}; font-weight: bold;">${sign}${d.toFixed(1)}萬</td>
            `;
            memberBody.appendChild(tr);
        });
    }

    // --- 付款指示 ---
    const paymentEl = document.getElementById('payment-instructions');
    if (paymentEl) {
        if (payments.length === 0) {
            paymentEl.innerHTML = '<div style="color:#666; font-size:13px;">無需付款，大家收支平衡！</div>';
        } else {
            paymentEl.innerHTML = payments.map(p => `
                <div class="payment-row">
                    <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
                        <span style="color:#ff6b6b; font-weight:bold;">${p.from}</span>
                        <span style="color:#666;">→</span>
                        <span style="color:#4dae4c; font-weight:bold;">${p.to}</span>
                        <span style="margin-left:auto; color:#fff; font-weight:bold;">${p.amount.toFixed(1)}萬</span>
                    </div>
                    <div style="font-size:12px; color:#aaa; padding-left:4px;">
                        奇幻方塊 ${p.fancyCount} 個
                        + 可疑方塊 ${p.suspiciousCount} 個
                        + 餘額 ${p.remainder.toFixed(1)} 萬楓幣
                    </div>
                </div>
            `).join('');
        }
    }

    showToast("✅ 結算完成！");
}

// ==========================================================================
// 📜 歷史紀錄
// ==========================================================================

// 儲存一筆結算紀錄
function saveSettlementRecord(record) {
    settlementHistory.unshift(record); // 最新的放最前面
    if (settlementHistory.length > 50) settlementHistory.pop(); // 最多保留 50 筆

    // 存本地
    localStorage.setItem('maple_settlement_history', JSON.stringify(settlementHistory));

    // 有 keycode 則存雲端
    const keyCode = document.getElementById('userKeyCode')?.value.trim();
    if (keyCode) {
        setDoc(doc(db, "player_history", keyCode), { history: settlementHistory }, { merge: false })
            .catch(e => console.error("歷史紀錄雲端儲存失敗：", e));
    }

    renderHistorySelect();
}

// 渲染歷史紀錄下拉選單
function renderHistorySelect() {
    const sel = document.getElementById('history-select');
    if (!sel) return;
    sel.innerHTML = '<option value="">— 選擇歷史紀錄 —</option>';
    settlementHistory.forEach((record, i) => {
        const label = `${record.date} ${record.boss}`;
        sel.innerHTML += `<option value="${i}">${label}</option>`;
    });
}

// 讀取歷史紀錄（顯示舊資料）
function loadHistoryRecord() {
    const sel = document.getElementById('history-select');
    const idx = sel?.value;
    if (idx === '' || idx === undefined) return;
    const record = settlementHistory[parseInt(idx)];
    if (!record) return;

    // 還原掉落物與雪花資料
    dropRows = record.drops || [];
    snowRows = record.snows || [];
    rerenderAllDropRows();
    rerenderAllSnowRows();

    // 還原王選擇與日期
    const bossEl = document.getElementById('boss-select');
    if (bossEl && record.boss) bossEl.value = record.boss;
    const dateEl = document.getElementById('settlement-date');
    if (dateEl && record.date) dateEl.value = record.date;

    showToast("📂 已讀取歷史紀錄");
}

// 清空本次登記
function clearSettlement() {
    if (!confirm("確定要清空本次所有掉落物和雪花資料嗎？")) return;
    dropRows = [];
    snowRows = [];
    document.getElementById('drops-table-body').innerHTML = '';
    document.getElementById('snow-table-body').innerHTML = '';
    const detailEl = document.getElementById('settlement-detail');
    if (detailEl) detailEl.style.display = 'none';
    showToast("🗑 已清空本次資料");
}

// ==========================================================================
// ⚔️ 裝備計算區
// ==========================================================================

// 基礎攻擊力反推
function calculateBaseAtk() {
    const mainStat   = parseFloat(document.getElementById('mainStat').value) || 0;
    const subStat    = parseFloat(document.getElementById('subStat').value) || 0;
    const maxAtk     = parseFloat(document.getElementById('maxAtk').value) || 0;
    const percentAtk = (parseFloat(document.getElementById('percentAtk').value) || 0) / 100;
    const coeff      = parseFloat(document.getElementById('coeff').value);

    const statFactor = (mainStat * 4 + subStat) / 100;
    if (statFactor === 0 || coeff === 0 || maxAtk === 0) { alert("請輸入正確的能力值！"); return; }

    const estimatedAtk = Math.round((maxAtk / coeff / statFactor) / (1 + percentAtk));
    let matchedBaseAtk = estimatedAtk;
    for (let testAtk = Math.max(1, estimatedAtk - 1000); testAtk <= estimatedAtk + 1000; testAtk++) {
        if (Math.round(Math.floor(testAtk * (1 + percentAtk)) * coeff * statFactor) === Math.round(maxAtk)) {
            matchedBaseAtk = testAtk; break;
        }
    }
    document.getElementById('resultDisplay').innerText = matchedBaseAtk;
    document.getElementById('calcBaseAtk').value    = matchedBaseAtk;
    document.getElementById('calcAtkPercent').value = document.getElementById('percentAtk').value;
    document.getElementById('calcMainBase').value   = mainStat;
    document.getElementById('calcMainEquip').value  = 0;
    document.getElementById('calcMainPercent').value = 0;
    document.getElementById('calcSubStat').value    = subStat;
}

// 裝備純屬性反推（窮舉法）
function calculateEquipStat() {
    const statTotal    = parseFloat(document.getElementById('statTotal').value) || 0;
    const statBaseOnly = parseFloat(document.getElementById('statBaseOnly').value) || 0;
    const statPercent  = (parseFloat(document.getElementById('statPercent').value) || 0) / 100;
    let foundStat = 0;
    for (let testStat = 0; testStat <= 10000; testStat++) {
        if (Math.floor((statBaseOnly + testStat) * (1 + statPercent)) === statTotal) {
            foundStat = testStat; break;
        }
    }
    document.getElementById('equipStatDisplay').innerText = foundStat;
    document.getElementById('calcMainBase').value    = statBaseOnly;
    document.getElementById('calcMainEquip').value   = foundStat;
    document.getElementById('calcMainPercent').value = document.getElementById('statPercent').value;
}

// 完整表攻計算
function calculateFinalAtk() {
    const baseAtk    = parseFloat(document.getElementById('calcBaseAtk').value) || 0;
    const atkPercent = (parseFloat(document.getElementById('calcAtkPercent').value) || 0) / 100;
    const mainBase   = parseFloat(document.getElementById('calcMainBase').value) || 0;
    const mainEquip  = parseFloat(document.getElementById('calcMainEquip').value) || 0;
    const mainPercent = (parseFloat(document.getElementById('calcMainPercent').value) || 0) / 100;
    const subStat    = parseFloat(document.getElementById('calcSubStat').value) || 0;
    const coeff      = parseFloat(document.getElementById('coeff').value) || 1.0;

    const totalMainStat = Math.floor((mainBase + mainEquip) * (1 + mainPercent));
    const statFactor    = (totalMainStat * 4 + subStat) / 100;
    const totalAtk      = Math.floor(baseAtk * (1 + atkPercent));
    const finalAtk      = Math.round(totalAtk * coeff * statFactor);

    document.getElementById('finalMaxAtkDisplay').innerText = finalAtk.toLocaleString();
}