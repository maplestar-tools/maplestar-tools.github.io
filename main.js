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

// 檢查目前登入的 keycode 是否為管理員，並控制管理員按鈕顯示
function checkIsAdmin() {
    const kc = document.getElementById('userKeyCode')?.value.trim();
    isAdmin = adminKeycodes.includes(kc);
    const btn = document.getElementById('btn-admin-panel');
    if (btn) btn.style.display = isAdmin ? 'inline-flex' : 'none';
    // 管理員才顯示共用結算紀錄區塊
    const sharedSection = document.getElementById('shared-history-section');
    if (sharedSection) {
        sharedSection.style.display = isAdmin ? 'block' : 'none';
        if (isAdmin) loadSharedHistory();
    }
}

// ==========================================================================
// 🌐 全域狀態
// ==========================================================================
let saveTimer            = null;
let lastSavedData        = null;
let members              = [];     // [{ id, name, checked, ratio }]
let bossList             = [];     // 王名稱陣列
let bossItemMap          = {};     // { 王名稱: [物品名稱, ...] }
let dropRows             = [];     // 掉落物表格資料
let snowRows             = [];     // 雪花消耗表格資料
let extraCostRows        = [];     // 額外花費表格資料
let extraCostItems       = [];     // 自訂額外花費項目清單（共用雲端）
let settlementHistory    = [];     // 歷史結算紀錄
let lastSettlementResult = null;   // 最後一次結算結果（用於儲存）
let currentHistoryIndex  = -1;     // 目前查看的歷史紀錄索引（-1 = 新紀錄）
let lastPreciseMainStat  = null;   // 裝備屬性反推算出的精確主屬總值（未捨去小數），僅記憶體暫存，供基礎攻擊力反推使用
let lastPreciseSubStat   = null;   // 裝備屬性反推算出的精確副屬總值（未捨去小數），僅記憶體暫存，供基礎攻擊力反推使用

// ==========================================================================
// 🚀 初始化
// ==========================================================================
window.addEventListener('DOMContentLoaded', async () => {
    setLoggedOut();

    // 從 localStorage 還原個人設定
    const localData = localStorage.getItem('maple_tool_data');
    if (localData) {
        try {
            fillValues(JSON.parse(localData));
            updateSyncUI('synced');
        }
        catch (e) { console.error("本地資料還原失敗", e); }
    }

    // 從 localStorage 還原歷史紀錄
    const localHistory = localStorage.getItem('maple_settlement_history');
    if (localHistory) {
        try { settlementHistory = JSON.parse(localHistory); renderHistorySelect(); }
        catch (e) { console.error("歷史紀錄還原失敗", e); }
    }

    // 預設結算日期為今天
    const dateEl = document.getElementById('settlement-date');
    if (dateEl) dateEl.value = new Date().toISOString().split('T')[0];

    updateDynamicPrices();
    await loadSharedData();
    bindEvents();
    await initExpRecords();

    // 同步里程匯率到掉落物標題旁的輸入框
    const mileageVal = document.getElementById('moneyToMileage')?.value;
    if (mileageVal) document.getElementById('moneyToMileage2').value = mileageVal;

    // 還原自動載入 checkbox 狀態
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
    // 分頁切換
    document.getElementById('btn-tab-home').addEventListener('click',  () => switchTab('home'));
    document.getElementById('btn-tab-money').addEventListener('click', () => switchTab('money-split'));
    document.getElementById('btn-tab-equip').addEventListener('click', () => switchTab('equip-calc'));
    document.getElementById('btn-tab-exp').addEventListener('click',   () => switchTab('exp-calc'));

    // 雲端同步
    document.getElementById('btn-load-cloud').addEventListener('click', () => loadFromCloud(false));
    document.getElementById('btn-manual-sync').addEventListener('click', () => saveAllToCloud(true));

    // 折疊開關
    document.getElementById('btn-toggle-settings').addEventListener('click',   (e) => toggleSection(e.currentTarget, 'settings-section'));
    document.getElementById('btn-toggle-member').addEventListener('click',     (e) => toggleSection(e.currentTarget, 'member-section'));
    document.getElementById('btn-toggle-drops').addEventListener('click',      (e) => toggleSection(e.currentTarget, 'drops-section'));
    document.getElementById('btn-toggle-settlement').addEventListener('click', (e) => toggleSection(e.currentTarget, 'settlement-section'));

    // 隊員表格
    document.getElementById('btn-add-member').addEventListener('click', addMember);
    document.getElementById('btn-save-members').addEventListener('click', saveMembersToCloud);
    document.getElementById('member-grid').addEventListener('change', onMemberTableChange);
    document.getElementById('member-grid').addEventListener('click',  onMemberTableClick);

    // 王選擇（多選下拉，事件由 renderBossSelect 內部綁定）
    // 點擊外部關閉多選下拉
    document.addEventListener('click', (e) => {
        const dropdown = document.getElementById('boss-dropdown');
        const display  = document.getElementById('boss-select-display');
        if (dropdown && !dropdown.contains(e.target) && !display?.contains(e.target)) {
            dropdown.style.display = 'none';
        }
    });

    // ES module 內的函式掛到 window，讓 HTML onclick 可以呼叫
    window.toggleBossDropdown = toggleBossDropdown;
    window.handleAddNewBoss   = handleAddNewBoss;

    // 掉落物表格
    document.getElementById('btn-add-drop-sell').addEventListener('click', () => addDropRow('sell'));
    document.getElementById('btn-add-drop-self').addEventListener('click', () => addDropRow('self'));
    document.getElementById('btn-clear-drops').addEventListener('click', clearDrops);
    document.getElementById('drops-table-body').addEventListener('change', onDropTableChange);
    document.getElementById('drops-table-body').addEventListener('click',  onDropTableClick);

    // 雪花表格
    document.getElementById('btn-add-snow').addEventListener('click', addSnowRow);
    document.getElementById('snow-table-body').addEventListener('change', onSnowTableChange);
    document.getElementById('snow-table-body').addEventListener('click',  onSnowTableClick);

    // 額外花費
    document.getElementById('btn-add-extra-cost').addEventListener('click', addExtraCostRow);
    document.getElementById('extra-cost-table-body').addEventListener('change', onExtraCostTableChange);
    document.getElementById('extra-cost-table-body').addEventListener('click',  onExtraCostTableClick);

    // 里程匯率同步（掉落物標題旁的輸入框 ↔ 基礎設定）
    document.getElementById('moneyToMileage2').addEventListener('input', (e) => {
        document.getElementById('moneyToMileage').value = e.target.value;
        updateDynamicPrices();
    });
    document.getElementById('moneyToMileage').addEventListener('input', (e) => {
        document.getElementById('moneyToMileage2').value = e.target.value;
        updateDynamicPrices();
    });

    // 結算
    document.getElementById('btn-settle').addEventListener('click', executeSettlement);
    document.getElementById('btn-save-record').addEventListener('click', saveSettlementRecord);
    document.getElementById('btn-delete-record').addEventListener('click', deleteHistoryRecord);
    document.getElementById('btn-toggle-shared-history').addEventListener('click', (e) => toggleSection(e.currentTarget, 'shared-history-content'));
    document.getElementById('btn-merge-payments').addEventListener('click', mergePayments);
    document.getElementById('btn-settle-clear').addEventListener('click', settleAndClear);
    document.getElementById('history-select').addEventListener('change', loadHistoryRecord);

    // 裝備計算
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

    // 框選與截圖按鈕（經驗）
    document.getElementById('btn-capture-select').addEventListener('click', () => startCaptureSelect('exp'));
    document.getElementById('btn-preview-exp').addEventListener('click', () => takePreviewShot('exp'));

    // 框選與截圖按鈕（楓幣）
    document.getElementById('btn-capture-select-meso').addEventListener('click', () => startCaptureSelect('meso'));
    document.getElementById('btn-preview-meso').addEventListener('click', () => takePreviewShot('meso'));

    // 同時截楓幣勾選：控制右欄啟用/停用、截圖預覽格、輸入框、結果列
    document.getElementById('meso-enabled').addEventListener('change', onMesoEnabledChange);

    // 截圖預覽展開/收合
    document.getElementById('btn-toggle-screenshots').addEventListener('click', () => {
        const area = document.getElementById('screenshots-preview');
        const btn  = document.getElementById('btn-toggle-screenshots');
        const open = area.style.display === 'block';
        area.style.display = open ? 'none' : 'block';
        btn.innerText = open ? '查看截圖預覽 ▼' : '收起截圖預覽 ▲';
    });

    document.getElementById('btn-start-timer').addEventListener('click', startExpTimer);
    document.getElementById('btn-stop-timer').addEventListener('click',  () => stopExpTimer(false)); // 手動停止
    document.getElementById('btn-calc-exp').addEventListener('click',    calculateExpResult);
    document.getElementById('btn-ocr').addEventListener('click', parseScreenshots);
    document.getElementById('btn-recapture-end').addEventListener('click', recaptureEnd);

    // 監聽解析數值輸入框，有值時不讓重新解析（避免覆蓋手動修改）
    ['ocr-start-val','ocr-end-val','ocr-start-val-meso','ocr-end-val-meso'].forEach(id => {
        document.getElementById(id).addEventListener('input', updateOcrBtnState);
    });

    // 加成設定 checkbox：勾選時啟用對應輸入框
    document.getElementById('bonus-prayer').addEventListener('change', (e) => {
        const inp = document.getElementById('bonus-prayer-val');
        inp.disabled = !e.target.checked;
        inp.style.opacity = e.target.checked ? '1' : '0.4';
    });
    document.getElementById('bonus-2x').addEventListener('change', (e) => {
        const inp = document.getElementById('bonus-2x-val');
        inp.disabled = !e.target.checked;
        inp.style.opacity = e.target.checked ? '1' : '0.4';
    });
    document.getElementById('bonus-teach').addEventListener('change', (e) => {
        const inp = document.getElementById('bonus-teach-val');
        inp.disabled = !e.target.checked;
        inp.style.opacity = e.target.checked ? '1' : '0.4';
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

    // keycode 輸入時重新渲染王下拉與物品下拉
    document.getElementById('userKeyCode').addEventListener('input', () => {
        renderBossSelect();
        renderAllDropItemSelects();
    });

    // 任何輸入變動觸發自動儲存（排除 keycode 欄位）
    document.addEventListener('input', (e) => {
        if ((e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') && e.target.id !== 'userKeyCode') {
            triggerAutoSave();
        }
    });

    // 管理員設定 Modal
    document.getElementById('btn-admin-panel')?.addEventListener('click', openAdminPanel);
    document.getElementById('btn-close-admin-panel')?.addEventListener('click', closeAdminPanel);
    document.getElementById('modal-admin-panel')?.addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeAdminPanel();
    });
    document.getElementById('btn-add-admin')?.addEventListener('click', addAdminKeycode);
    document.getElementById('modal-boss-filter')?.addEventListener('change', renderModalItemList);

    // 管理員 Modal 分頁切換
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
    // 優先找有 id 的箭頭 span（避免標題列有多個 span 時找錯）
    const arrowId = sectionId.replace('-section', '-toggle-arrow');
    const span = document.getElementById(arrowId) || headerEl.querySelector('span');
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
// 📋 表單資料
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
        'bonus-prayer-val','bonus-2x-val','bonus-teach-val',
        'record-level','record-job',
    ];
    const data = {};
    ids.forEach(id => { const el = document.getElementById(id); if (el) data[id] = el.value; });

    const checkedFee = document.querySelector('input[name="defaultFee"]:checked');
    if (checkedFee) data.defaultFee = checkedFee.value;

    // checkbox 狀態：含楓幣勾選、祈禱/加倍卷/休息獎勵加成勾選
    ['mapleCheckMain','mapleCheckSub','mapleCheckA','mapleCheckB','meso-enabled','bonus-prayer','bonus-2x','bonus-rest','bonus-teach'].forEach(id => {
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
            el.checked = obj[key];
            const inputMap = {
                mapleCheckMain:  'maplePercentMain',
                mapleCheckSub:   'maplePercentSub',
                mapleCheckA:     'maplePercentA',
                mapleCheckB:     'maplePercentB',
                'bonus-prayer':  'bonus-prayer-val',
                'bonus-2x':      'bonus-2x-val',
                'bonus-teach':   'bonus-teach-val',
            };
            const inputId = inputMap[key];
            if (inputId) {
                const inp = document.getElementById(inputId);
                if (inp) {
                    inp.disabled = !obj[key];
                    inp.style.opacity = obj[key] ? '1' : '0.4';
                }
            }
            // 還原楓幣勾選狀態時同步 UI
            if (key === 'meso-enabled') {
                captureWithMeso = obj[key];
                applyMesoEnabledUI(obj[key]);
            }
        } else if (typeof obj[key] !== 'object') {
            el.value = obj[key];
        }
    }
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
            const rawMembers = d.members || d.memberNames || [];
            bossList        = d.bossList        || [];
            bossItemMap     = d.bossItemMap     || {};
            adminKeycodes   = d.adminKeycodes   || [];
            extraCostItems  = d.extraCostItems  || [];
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
        const memberList = members
            .filter(m => m.name.trim() !== '')
            .map(m => ({ id: m.id, name: m.name }));
        await setDoc(doc(db, "shared_data", "team_data"), { members: memberList, bossList, bossItemMap, adminKeycodes }, { merge: false });
        await saveAllToCloud(false);
        alert("✅ 共用名單已同步至雲端！");
    } catch (e) { alert("同步失敗：" + e.message); }
}

function addMember() {
    members.push({ id: generateId(), name: "", ratio: 1, checked: false });
    renderMembers();
}

function removeMember(i) { members.splice(i, 1); renderMembers(); }
function updateMemberData(i, field, val) { if (members[i]) members[i][field] = val; }

function onMemberTableChange(e) {
    const i = e.target.dataset.index;
    if (e.target.classList.contains('mem-check'))  { members[i].checked = e.target.checked; refreshSellerOptions(); refreshSnowUserOptions(); refreshExtraCostUserOptions(); }
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
    refreshExtraCostUserOptions();
}

function getActiveMembers() {
    return members.filter(m => m.checked && m.name.trim() !== '');
}

function getMemberNameById(id, fallbackName = '') {
    const found = members.find(m => m.id === id);
    return found ? found.name : (fallbackName || id);
}

// ==========================================================================
// 👑 王選擇（多選）
// ==========================================================================
let selectedBosses = []; // 目前已勾選的王名稱陣列

// 取得目前已選擇的王（陣列）
function getSelectedBosses() {
    return selectedBosses;
}

// 切換多選下拉顯示/隱藏
function toggleBossDropdown() {
    const dd = document.getElementById('boss-dropdown');
    if (dd) dd.style.display = dd.style.display === 'none' ? 'block' : 'none';
}

// 更新多選下拉的顯示文字
function updateBossSelectLabel() {
    const label = document.getElementById('boss-select-label');
    if (!label) return;
    if (selectedBosses.length === 0) {
        label.style.color = '#666';
        label.innerText   = '— 選擇王 —';
    } else {
        label.style.color = '#e0e0e0';
        const text = selectedBosses.join('、');
        label.innerText = text.length > 30 ? text.substring(0, 30) + '...' : text;
    }
}

// 勾選/取消王時的處理
function onBossCheckChange(bossName, checked) {
    const prevSelected = [...selectedBosses];
    if (checked) {
        if (!selectedBosses.includes(bossName)) selectedBosses.push(bossName);
    } else {
        selectedBosses = selectedBosses.filter(b => b !== bossName);
    }
    // 有掉落物時確認是否清空
    if (dropRows.length > 0 || snowRows.length > 0) {
        if (confirm("變更王選擇將清空掉落物與雪花清單，是否繼續？")) {
            dropRows = []; snowRows = [];
            document.getElementById('drops-table-body').innerHTML = '';
            document.getElementById('snow-table-body').innerHTML  = '';
            resetSettlementUI();
        } else {
            // 還原選擇
            selectedBosses = prevSelected;
            const cb = document.querySelector(`#boss-checkbox-list input[data-boss="${bossName}"]`);
            if (cb) cb.checked = !checked;
            return;
        }
    }
    updateBossSelectLabel();
    updateDropButtons();
    renderAllDropItemSelects();
}

function updateDropButtons() {
    const hasBoss = selectedBosses.length > 0;
    ['btn-add-drop-sell','btn-add-drop-self','btn-add-snow','btn-add-extra-cost'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.disabled = !hasBoss;
    });
}

// 渲染多選下拉的 checkbox 清單
function renderBossSelect() {
    const list = document.getElementById('boss-checkbox-list');
    const addNew = document.getElementById('boss-add-new');
    if (!list) return;

    const kc = document.getElementById('userKeyCode')?.value.trim();
    if (addNew) addNew.style.display = kc ? 'block' : 'none';

    if (bossList.length === 0) {
        list.innerHTML = '<div style="padding:10px;font-size:13px;color:#666;">尚無王名單</div>';
        updateDropButtons();
        return;
    }

    list.innerHTML = bossList.map(boss => `
        <label style="display:flex;align-items:center;gap:8px;padding:8px 12px;cursor:pointer;font-size:13px;color:#e0e0e0;" onmouseover="this.style.background='#333'" onmouseout="this.style.background=''">
            <input type="checkbox" data-boss="${boss}" ${selectedBosses.includes(boss) ? 'checked' : ''} style="width:14px;height:14px;cursor:pointer;">
            ${boss}
        </label>
    `).join('');

    list.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.addEventListener('change', () => onBossCheckChange(cb.dataset.boss, cb.checked));
    });

    updateBossSelectLabel();
    updateDropButtons();
}

// 新增王（從多選下拉的「＋ 新增王...」觸發）
async function handleAddNewBoss() {
    const name = prompt('請輸入新的王名稱：');
    if (!name || !name.trim()) return;
    const trimmed = name.trim();
    if (bossList.includes(trimmed)) { alert(`「${trimmed}」已存在！`); return; }
    bossList.push(trimmed);
    await saveSharedLists();
    renderBossSelect();
    // 自動勾選新增的王
    onBossCheckChange(trimmed, true);
    const cb = document.querySelector(`#boss-checkbox-list input[data-boss="${trimmed}"]`);
    if (cb) cb.checked = true;
    updateDropButtons();
}

// ==========================================================================
// 📦 掉落物名稱下拉
// ==========================================================================

// 取得所有已勾選王的掉落物（合併去重）
function getCurrentBossItems() {
    const allItems = [];
    selectedBosses.forEach(boss => {
        (bossItemMap[boss] || []).forEach(item => {
            if (!allItems.includes(item)) allItems.push(item);
        });
    });
    return allItems;
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
    if (type === 'boss') { handleAddNewBoss(); selectEl.value = ''; return; }
    // 物品
    const name = prompt('請輸入新的物品名稱：');
    if (!name || !name.trim()) { selectEl.value = ''; return; }
    const trimmed = name.trim();
    // 新物品加到所有已勾選的王
    selectedBosses.forEach(boss => {
        if (!bossItemMap[boss]) bossItemMap[boss] = [];
        if (!bossItemMap[boss].includes(trimmed)) bossItemMap[boss].push(trimmed);
    });
    await saveSharedLists();
    renderAllDropItemSelects();
    selectEl.value = trimmed;
    const idx = parseInt(selectEl.dataset.index);
    if (!isNaN(idx) && dropRows[idx]) dropRows[idx].item = trimmed;
    updateDropButtons();
}

async function saveSharedLists() {
    const kc = document.getElementById('userKeyCode')?.value.trim();
    if (!kc) return;
    const memberList = members.filter(m => m.name.trim() !== '').map(m => ({ id: m.id, name: m.name }));
    try { await setDoc(doc(db, "shared_data", "team_data"), { members: memberList, bossList, bossItemMap, adminKeycodes, extraCostItems }, { merge: false }); }
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
        const selectedId = e.target.value;
        const member = members.find(m => m.id === selectedId);
        dropRows[i].seller = member ? { id: member.id, name: member.name } : null;
    }
}

function onDropTableClick(e) { if (e.target.classList.contains('drop-del')) removeDropRow(parseInt(e.target.dataset.index)); }

function addDropRow(type) {
    const i = dropRows.length;
    const defaultFee = parseInt(document.querySelector('input[name="defaultFee"]:checked')?.value ?? 6);
    dropRows.push({ type, item: '', price: 0, fee: type === 'sell' ? defaultFee : 0, scissor: 'none', seller: null, net: 0 });
    appendDropRow(i);
    expandSection('drops-section');
}

function appendDropRow(i) {
    const row    = dropRows[i];
    const isSell = row.type === 'sell';
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

function refreshSellerOptions() {
    document.querySelectorAll('.drop-seller').forEach(sel => { const cur = sel.value; sel.innerHTML = buildSellerOptions(cur); });
}

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

function refreshSnowUserOptions() {
    document.querySelectorAll('.snow-user').forEach(sel => { const cur = sel.value; sel.innerHTML = buildSellerOptions(cur); });
}

// ==========================================================================
// 💸 額外花費表格
// ==========================================================================
function onExtraCostTableChange(e) {
    const i = parseInt(e.target.dataset.index);
    if (isNaN(i) || !extraCostRows[i]) return;
    if (e.target.classList.contains('extra-user'))   {
        const selectedId = e.target.value;
        const member = members.find(m => m.id === selectedId);
        extraCostRows[i].user = member ? { id: member.id, name: member.name } : null;
    }
    if (e.target.classList.contains('extra-item'))   {
        const val = e.target.value;
        if (val === '__add_new__') { handleAddNewExtraItem(e.target, i); return; }
        extraCostRows[i].item = val;
        // 剪刀自動帶入價格（鎖死）
        recalcExtraCostRow(i);
        toggleExtraCostAmount(i);
    }
    if (e.target.classList.contains('extra-amount')) { extraCostRows[i].amount = parseFloat(e.target.value) || 0; }
}

function onExtraCostTableClick(e) {
    if (e.target.classList.contains('extra-del')) removeExtraCostRow(parseInt(e.target.dataset.index));
}

function addExtraCostRow() {
    const i = extraCostRows.length;
    extraCostRows.push({ user: null, item: '', amount: 0 });
    appendExtraCostRow(i);
}

// 取得額外花費項目下拉選項
function buildExtraItemOptions(selected = '') {
    const kc = document.getElementById('userKeyCode')?.value.trim();
    let html = '<option value="">— 選擇項目 —</option>';
    html += `<option value="__fancy__"   ${selected === '__fancy__'   ? 'selected' : ''}>神奇剪刀</option>`;
    html += `<option value="__platinum__"${selected === '__platinum__'? 'selected' : ''}>白金神奇剪刀</option>`;
    if (extraCostItems.length > 0) {
        html += '<option disabled>──────────</option>';
        extraCostItems.forEach(item => {
            html += `<option value="${item}" ${selected === item ? 'selected' : ''}>${item}</option>`;
        });
    }
    if (kc) html += `<option value="__add_new__">＋ 新增項目...</option>`;
    return html;
}

// 新增自訂額外花費項目
async function handleAddNewExtraItem(selectEl, rowIdx) {
    const name = prompt('請輸入新的項目名稱：');
    if (!name || !name.trim()) { selectEl.value = extraCostRows[rowIdx]?.item || ''; return; }
    const trimmed = name.trim();
    if (!extraCostItems.includes(trimmed)) {
        extraCostItems.push(trimmed);
        await saveSharedLists();
    }
    // 更新所有 extra-item 下拉
    document.querySelectorAll('.extra-item').forEach(sel => {
        const cur = sel.value;
        sel.innerHTML = buildExtraItemOptions(cur);
    });
    selectEl.value = trimmed;
    const i = parseInt(selectEl.dataset.index);
    if (!isNaN(i) && extraCostRows[i]) { extraCostRows[i].item = trimmed; toggleExtraCostAmount(i); }
}

// 根據項目決定金額欄位是否鎖死
function toggleExtraCostAmount(i) {
    const row     = extraCostRows[i];
    const amountEl = document.getElementById(`extra-amount-${i}`);
    if (!amountEl) return;
    const isScissor = row.item === '__fancy__' || row.item === '__platinum__';
    amountEl.disabled    = isScissor;
    amountEl.style.opacity = isScissor ? '0.6' : '1';
    recalcExtraCostRow(i);
}

// 計算剪刀價格或保留自訂金額
function recalcExtraCostRow(i) {
    const row     = extraCostRows[i];
    const p       = getPrices();
    const amountEl = document.getElementById(`extra-amount-${i}`);
    if (!amountEl) return;
    if (row.item === '__fancy__') {
        const val = Math.round(p.fancy * 10) / 10;
        extraCostRows[i].amount = val;
        amountEl.value = val;
    } else if (row.item === '__platinum__') {
        const val = Math.round(p.platinum * 10) / 10;
        extraCostRows[i].amount = val;
        amountEl.value = val;
    }
}

function appendExtraCostRow(i) {
    const row    = extraCostRows[i];
    const userId = row.user?.id || '';
    const tr     = document.createElement('tr');
    tr.id = `extra-cost-row-${i}`;
    tr.style.borderBottom = '1px solid #2a2a2a';
    tr.innerHTML = `
        <td style="padding:6px 4px;vertical-align:middle;">
            <select class="cloud-input extra-user" data-index="${i}" style="font-size:13px;padding:6px 8px;">
                ${buildSellerOptions(userId)}
            </select>
        </td>
        <td style="padding:6px 4px;vertical-align:middle;">
            <select class="cloud-input extra-item" data-index="${i}" style="font-size:13px;padding:6px 8px;">
                ${buildExtraItemOptions(row.item)}
            </select>
        </td>
        <td style="padding:6px 4px;vertical-align:middle;">
            <input type="number" id="extra-amount-${i}" class="cloud-input extra-amount" data-index="${i}"
                value="${row.amount || ''}" placeholder="0" style="font-size:13px;padding:6px 8px;">
        </td>
        <td style="padding:6px 4px;text-align:center;vertical-align:middle;">
            <button class="del-btn extra-del" data-index="${i}">✕</button>
        </td>
    `;
    document.getElementById('extra-cost-table-body').appendChild(tr);
    // 初始化金額鎖定狀態
    toggleExtraCostAmount(i);
}

function removeExtraCostRow(i) { extraCostRows.splice(i, 1); rerenderExtraCostTable(); }

function rerenderExtraCostTable() {
    document.getElementById('extra-cost-table-body').innerHTML = '';
    const temp = [...extraCostRows]; extraCostRows = [];
    temp.forEach((row, i) => { extraCostRows.push(row); appendExtraCostRow(i); });
}

function refreshExtraCostUserOptions() {
    document.querySelectorAll('.extra-user').forEach(sel => { const cur = sel.value; sel.innerHTML = buildSellerOptions(cur); });
}


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
    if (dropRows.length === 0 && snowRows.length === 0 && extraCostRows.length === 0) return;
    if (!confirm("確定要清空本次所有掉落物、雪花和額外花費資料嗎？")) return;
    dropRows = []; snowRows = []; extraCostRows = [];
    document.getElementById('drops-table-body').innerHTML      = '';
    document.getElementById('snow-table-body').innerHTML       = '';
    document.getElementById('extra-cost-table-body').innerHTML = '';
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

    const actualIncome = {};
    active.forEach(m => { actualIncome[m.id] = 0; });
    dropRows.forEach(row => {
        const sid = row.seller?.id;
        if (sid && actualIncome.hasOwnProperty(sid)) actualIncome[sid] += row.net;
    });

    let totalPool = 0;
    dropRows.forEach(row => { totalPool += row.net; });

    const snowCostPerMember  = {};
    const extraCostPerMember = {};
    active.forEach(m => { snowCostPerMember[m.id] = 0; extraCostPerMember[m.id] = 0; });
    let totalSnowCost  = 0;
    let totalExtraCost = 0;
    snowRows.forEach(row => {
        totalPool -= row.cost; totalSnowCost += row.cost;
        const uid = row.user?.id;
        if (uid && snowCostPerMember.hasOwnProperty(uid)) snowCostPerMember[uid] += row.cost;
    });
    extraCostRows.forEach(row => {
        totalPool -= row.amount; totalExtraCost += row.amount;
        const uid = row.user?.id;
        if (uid && extraCostPerMember.hasOwnProperty(uid)) extraCostPerMember[uid] += row.amount;
    });

    const totalRatio = active.reduce((s, m) => s + (m.ratio || 1), 0);
    const shouldGet  = {};
    active.forEach(m => {
        const base = Math.round((totalPool * (m.ratio || 1) / totalRatio) * 10) / 10;
        shouldGet[m.id] = Math.round((base + (snowCostPerMember[m.id] || 0) + (extraCostPerMember[m.id] || 0)) * 10) / 10;
    });

    const diff = {};
    active.forEach(m => { diff[m.id] = Math.round((actualIncome[m.id] - shouldGet[m.id]) * 10) / 10; });

    const payments = calcPayments(diff, active, prices);
    const result   = { totalPool, totalSnowCost, totalExtraCost, shouldGet, actualIncome, diff, payments };
    renderSettlementResult(result, active);
    lastSettlementResult = result;
    document.getElementById('btn-save-record').disabled = false;
}

function calcPayments(diff, active, prices) {
    let payers    = active.filter(m => diff[m.id] >  0.01).map(m => ({ id: m.id, name: m.name, amount:  diff[m.id] }));
    let receivers = active.filter(m => diff[m.id] < -0.01).map(m => ({ id: m.id, name: m.name, amount: -diff[m.id] }));
    const payments = [];
    let pi = 0, ri = 0;
    while (pi < payers.length && ri < receivers.length) {
        const p = payers[pi], r = receivers[ri];
        const amount = Math.round(Math.min(p.amount, r.amount) * 10) / 10;
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
function renderSettlementResult(result, active, dropsSnapshot, snowsSnapshot, extraCostsSnapshot) {
    const { totalPool, shouldGet, actualIncome, diff, payments } = result;
    const displayDrops      = dropsSnapshot      || dropRows;
    const displaySnows      = snowsSnapshot      || snowRows;
    const displayExtraCosts = extraCostsSnapshot || extraCostRows;
    document.getElementById('settlement-detail').style.display = 'block';

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

    // 額外花費明細
    let extraHtml = '<div class="detail-section-title">💸 額外花費</div>';
    if (displayExtraCosts.length === 0) {
        extraHtml += '<div class="detail-row" style="color:#666;">（無）</div>';
    } else {
        displayExtraCosts.forEach(ec => {
            const userName = ec.user?.id
                ? getMemberNameById(ec.user.id, ec.user.name)
                : (ec.user?.name || ec.user || '');
            const itemName = ec.item === '__fancy__' ? '神奇剪刀' : ec.item === '__platinum__' ? '白金神奇剪刀' : ec.item;
            extraHtml += `<div class="detail-row"><span>${userName}（${itemName}）</span><span style="color:#ff6b6b;">-${(ec.amount||0).toFixed(1)}萬</span></div>`;
        });
    }
    // 額外花費明細插入 detail-snow 後面（需要在 HTML 加 detail-extra）
    const detailExtraEl = document.getElementById('detail-extra');
    if (detailExtraEl) detailExtraEl.innerHTML = extraHtml;

    document.getElementById('detail-total').innerText = totalPool.toFixed(1) + '萬';

    const tbody = document.getElementById('settlement-member-body');
    tbody.innerHTML = '';
    active.forEach(m => {
        const income = actualIncome[m.id] ?? actualIncome[m.name] ?? 0;
        const should = shouldGet[m.id]    ?? shouldGet[m.name]    ?? 0;
        const d      = diff[m.id]         ?? diff[m.name]         ?? 0;
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
        payEl.innerHTML = payments.map(p => `
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
    const kc = document.getElementById('userKeyCode')?.value.trim();

    const record = {
        date:       document.getElementById('settlement-date')?.value || new Date().toISOString().split('T')[0],
        boss:       selectedBosses.length > 0 ? selectedBosses.join('、') : '未知',
        result:     lastSettlementResult,
        drops:      JSON.parse(JSON.stringify(dropRows)),
        snows:      JSON.parse(JSON.stringify(snowRows)),
        extraCosts: JSON.parse(JSON.stringify(extraCostRows)),
        members:    JSON.parse(JSON.stringify(getActiveMembers()))
    };

    if (currentHistoryIndex >= 0) {
        // 更新現有紀錄：保留原本的 sharedId
        record.sharedId = settlementHistory[currentHistoryIndex]?.sharedId || null;
        settlementHistory[currentHistoryIndex] = record;

        // 同步更新共用雲端對應的那筆
        if (kc && record.sharedId) {
            updateSharedHistory(record.sharedId, {
                date:    record.date,
                boss:    record.boss,
                result:  record.result,
                members: record.members,
            });
        }
    } else {
        // 新增紀錄：產生新的 sharedId 並存入共用雲端
        const sharedId = `${kc}_${Date.now()}`;
        record.sharedId = sharedId;
        settlementHistory.unshift(record);
        if (settlementHistory.length > 100) settlementHistory.pop();
        settlementHistory.sort((a, b) => new Date(b.date) - new Date(a.date));
        currentHistoryIndex = 0;

        if (kc) {
            const sharedRecord = {
                id:      sharedId,
                keycode: kc,
                date:    record.date,
                boss:    record.boss,
                result:  record.result,
                members: record.members,
            };
            saveToSharedHistory(sharedRecord);
        }
    }

    localStorage.setItem('maple_settlement_history', JSON.stringify(settlementHistory));
    if (kc) {
        setDoc(doc(db, "player_history", kc), { history: settlementHistory }, { merge: false })
            .catch(e => console.error("歷史雲端儲存失敗：", e));
    }
    renderHistorySelect();
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

// ==========================================================================
// 📋 共用結算紀錄（管理員功能）
// ==========================================================================
let sharedHistory        = [];   // 從共用雲端載入的結算紀錄
let selectedSharedIds    = [];   // 目前勾選的紀錄 id 陣列
let lastMergedDiff       = null; // 最後一次合併計算的差額結果（用於已結清）

// 儲存一筆紀錄到共用雲端
async function saveToSharedHistory(record) {
    try {
        const snap = await getDoc(doc(db, 'shared_data', 'shared_history'));
        const existing = snap.exists() ? (snap.data().records || []) : [];
        existing.unshift(record);
        await setDoc(doc(db, 'shared_data', 'shared_history'), { records: existing }, { merge: false });
        // 如果管理員區塊已經顯示，重新載入
        if (isAdmin) loadSharedHistory();
    } catch(e) {
        console.error('共用紀錄儲存失敗：', e);
    }
}

// 更新共用雲端對應的那筆紀錄
async function updateSharedHistory(sharedId, updates) {
    try {
        const snap = await getDoc(doc(db, 'shared_data', 'shared_history'));
        if (!snap.exists()) return;
        const records = snap.data().records || [];
        const idx = records.findIndex(r => r.id === sharedId);
        if (idx === -1) return;
        records[idx] = { ...records[idx], ...updates };
        await setDoc(doc(db, 'shared_data', 'shared_history'), { records }, { merge: false });
        if (isAdmin) loadSharedHistory();
    } catch(e) {
        console.error('共用紀錄更新失敗：', e);
    }
}

// 刪除共用雲端對應的那筆紀錄
async function deleteFromSharedHistory(sharedId) {
    if (!sharedId) return;
    try {
        const snap = await getDoc(doc(db, 'shared_data', 'shared_history'));
        if (!snap.exists()) return;
        const records = snap.data().records.filter(r => r.id !== sharedId);
        await setDoc(doc(db, 'shared_data', 'shared_history'), { records }, { merge: false });
        if (isAdmin) loadSharedHistory();
    } catch(e) {
        console.error('共用紀錄刪除失敗：', e);
    }
}

// 從共用雲端載入所有結算紀錄
async function loadSharedHistory() {
    try {
        const snap = await getDoc(doc(db, 'shared_data', 'shared_history'));
        sharedHistory = snap.exists() ? (snap.data().records || []) : [];
    } catch(e) {
        sharedHistory = [];
    }
    renderSharedHistoryList();
}

// 渲染共用紀錄勾選清單
function renderSharedHistoryList() {
    const el = document.getElementById('shared-history-list');
    if (!el) return;
    if (sharedHistory.length === 0) {
        el.innerHTML = '<div style="padding:16px;text-align:center;color:#555;font-size:13px;">尚無共用紀錄</div>';
        return;
    }
    el.innerHTML = sharedHistory.map(r => `
        <label style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid #2a2a2a;cursor:pointer;font-size:13px;color:#e0e0e0;" onmouseover="this.style.background='#252525'" onmouseout="this.style.background=''">
            <input type="checkbox" data-id="${r.id}" style="width:15px;height:15px;cursor:pointer;" ${selectedSharedIds.includes(r.id) ? 'checked' : ''}>
            <span style="color:#aaa;white-space:nowrap;">${r.date}</span>
            <span style="flex:1;">${r.boss}</span>
            <span style="color:#666;font-size:12px;white-space:nowrap;">[${r.keycode || '—'}]</span>
        </label>
    `).join('');

    el.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.addEventListener('change', () => {
            const id = cb.dataset.id;
            if (cb.checked) {
                if (!selectedSharedIds.includes(id)) selectedSharedIds.push(id);
            } else {
                selectedSharedIds = selectedSharedIds.filter(i => i !== id);
            }
            // 有勾選才啟用合併按鈕
            document.getElementById('btn-merge-payments').disabled = selectedSharedIds.length === 0;
            // 清空已結清按鈕和合併結果
            document.getElementById('btn-settle-clear').disabled = true;
            document.getElementById('merged-payment-result').style.display = 'none';
            lastMergedDiff = null;
        });
    });

    document.getElementById('btn-merge-payments').disabled = selectedSharedIds.length === 0;
}

// 合併付款指示：把勾選的紀錄差額加總重新計算
function mergePayments() {
    const selected = sharedHistory.filter(r => selectedSharedIds.includes(r.id));
    if (selected.length === 0) { showToast('⚠️ 請先勾選紀錄！'); return; }

    // 收集所有成員（以 id 為主，name 為輔）
    const memberMap = {}; // { id: name }
    selected.forEach(r => {
        (r.members || []).forEach(m => { memberMap[m.id] = m.name; });
    });

    // 加總每人差額
    const totalDiff = {};
    selected.forEach(r => {
        const { diff, actualIncome, shouldGet } = r.result;
        // diff 可能用 id 或 name 當 key，統一用 id
        (r.members || []).forEach(m => {
            const d = diff?.[m.id] ?? diff?.[m.name] ?? 0;
            totalDiff[m.id] = (totalDiff[m.id] || 0) + d;
        });
    });

    // 四捨五入
    Object.keys(totalDiff).forEach(id => {
        totalDiff[id] = Math.round(totalDiff[id] * 10) / 10;
    });

    // 計算最少付款路徑
    const prices  = getPrices();
    const members = Object.keys(totalDiff).map(id => ({ id, name: memberMap[id] || id }));
    const payments = calcPayments(totalDiff, members, prices);

    lastMergedDiff = { totalDiff, memberMap, payments };

    // 渲染合併結果
    const detailEl = document.getElementById('merged-payment-detail');
    if (payments.length === 0) {
        detailEl.innerHTML = '<div style="color:#666;font-size:13px;">無需付款，大家收支平衡！</div>';
    } else {
        detailEl.innerHTML = payments.map(p => `
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

    document.getElementById('merged-payment-result').style.display = 'block';
    document.getElementById('btn-settle-clear').disabled = false;
    showToast('✅ 合併計算完成');
}

// 已結清：刪除勾選的共用紀錄
async function settleAndClear() {
    if (!lastMergedDiff) { showToast('⚠️ 請先執行合併付款指示！'); return; }
    if (!confirm(`確定要刪除這 ${selectedSharedIds.length} 筆紀錄嗎？（個人紀錄不受影響）`)) return;

    sharedHistory = sharedHistory.filter(r => !selectedSharedIds.includes(r.id));
    try {
        await setDoc(doc(db, 'shared_data', 'shared_history'), { records: sharedHistory }, { merge: false });
        selectedSharedIds = [];
        lastMergedDiff    = null;
        document.getElementById('btn-settle-clear').disabled        = true;
        document.getElementById('merged-payment-result').style.display = 'none';
        renderSharedHistoryList();
        showToast('✅ 已結清，紀錄已刪除');
    } catch(e) {
        showToast('❌ 刪除失敗：' + e.message);
    }
}

function deleteHistoryRecord() {
    if (!confirm("確定要刪除此筆紀錄嗎？")) return;
    const idx = currentHistoryIndex >= 0 ? currentHistoryIndex : 0;
    const deletedRecord = settlementHistory[idx];
    settlementHistory.splice(idx, 1);
    localStorage.setItem('maple_settlement_history', JSON.stringify(settlementHistory));
    const kc = document.getElementById('userKeyCode')?.value.trim();
    if (kc) {
        setDoc(doc(db, "player_history", kc), { history: settlementHistory }, { merge: false })
            .catch(e => console.error("歷史雲端刪除失敗：", e));
        // 同時刪除共用雲端對應的那筆
        if (deletedRecord?.sharedId) deleteFromSharedHistory(deletedRecord.sharedId);
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
    if (sel?.dataset.skipChange === 'true') return;
    const idx = sel?.value;
    if (idx === '' || idx === undefined) {
        currentHistoryIndex = -1;
        document.getElementById('btn-delete-record').disabled = true;
        return;
    }
    const record = settlementHistory[parseInt(idx)];
    if (!record) return;
    currentHistoryIndex = parseInt(idx);

    if (record.members) {
        const checkedIds   = record.members.map(m => m.id).filter(Boolean);
        const checkedNames = record.members.map(m => m.name);
        members = members.map(m => ({
            ...m,
            checked: checkedIds.includes(m.id) || checkedNames.includes(m.name),
            ratio:   record.members.find(rm => rm.id === m.id || rm.name === m.name)?.ratio ?? m.ratio
        }));
        renderMembers();
    }

    if (record.boss) {
        // 還原多選王狀態（舊紀錄可能是單一字串，新紀錄是頓號分隔）
        selectedBosses = record.boss.split('、').filter(b => bossList.includes(b));
        renderBossSelect();
        updateDropButtons();
    }

    if (record.date) document.getElementById('settlement-date').value = record.date;

    dropRows = record.drops || [];
    rerenderDropTable();

    snowRows = record.snows || [];
    rerenderSnowTable();

    extraCostRows = record.extraCosts || [];
    rerenderExtraCostTable();

    lastSettlementResult = record.result;
    renderSettlementResult(record.result, record.members || getActiveMembers(), record.drops, record.snows, record.extraCosts);
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
    renderModalExtraItemList();
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
            <span style="flex:1;">${boss}</span>
            <button class="edit-btn modal-edit-boss" data-index="${i}" style="margin:0;margin-right:4px;">✏️</button>
            <button class="del-btn modal-del-boss" data-index="${i}" style="margin:0;">✕</button>
        </div>
    `).join('');

    let dragIdx = null;
    el.querySelectorAll('.modal-list-item').forEach(item => {
        item.addEventListener('dragstart', () => { dragIdx = parseInt(item.dataset.index); item.style.opacity = '0.5'; });
        item.addEventListener('dragend',   () => { item.style.opacity = '1'; });
        item.addEventListener('dragover',  (e) => { e.preventDefault(); item.style.background = '#333'; });
        item.addEventListener('dragleave', () => { item.style.background = '#252525'; });
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

    // 編輯王名稱：同步更新 bossList 和 bossItemMap 的 key
    el.querySelectorAll('.modal-edit-boss').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const idx     = parseInt(btn.dataset.index);
            const oldName = bossList[idx];
            const newName = prompt(`請輸入新的王名稱：`, oldName);
            if (!newName || !newName.trim() || newName.trim() === oldName) return;
            const trimmed = newName.trim();
            if (bossList.includes(trimmed)) { alert(`「${trimmed}」已存在！`); return; }
            // 更新 bossList
            bossList[idx] = trimmed;
            // 把舊 key 的物品搬到新 key，刪掉舊 key
            if (bossItemMap[oldName]) {
                bossItemMap[trimmed] = bossItemMap[oldName];
                delete bossItemMap[oldName];
            }
            await saveSharedLists();
            renderBossSelect();
            renderModalBossList();
            renderModalBossFilter();
            renderModalItemList();
            showToast(`✅ 已將「${oldName}」改為「${trimmed}」`);
        });
    });

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

    let dragIdx = null;
    el.querySelectorAll('.modal-list-item').forEach(item => {
        item.addEventListener('dragstart', () => { dragIdx = parseInt(item.dataset.index); item.style.opacity = '0.5'; });
        item.addEventListener('dragend',   () => { item.style.opacity = '1'; });
        item.addEventListener('dragover',  (e) => { e.preventDefault(); item.style.background = '#333'; });
        item.addEventListener('dragleave', () => { item.style.background = '#252525'; });
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

// 額外花費項目管理（排序、刪除）
function renderModalExtraItemList() {
    const el = document.getElementById('modal-extra-item-list');
    if (!el) return;
    if (extraCostItems.length === 0) { el.innerHTML = '<div style="color:#666;font-size:13px;">尚無自訂項目</div>'; return; }
    el.innerHTML = extraCostItems.map((item, i) => `
        <div class="modal-list-item" draggable="true" data-index="${i}" style="cursor:grab;">
            <span style="color:#aaa;margin-right:8px;">☰</span>
            <span style="flex:1;">${item}</span>
            <button class="del-btn modal-del-extra-item" data-index="${i}" style="margin:0;">✕</button>
        </div>
    `).join('');

    let dragIdx = null;
    el.querySelectorAll('.modal-list-item').forEach(item => {
        item.addEventListener('dragstart', () => { dragIdx = parseInt(item.dataset.index); item.style.opacity = '0.5'; });
        item.addEventListener('dragend',   () => { item.style.opacity = '1'; });
        item.addEventListener('dragover',  (e) => { e.preventDefault(); item.style.background = '#333'; });
        item.addEventListener('dragleave', () => { item.style.background = '#252525'; });
        item.addEventListener('drop', async () => {
            item.style.background = '#252525';
            const dropIdx = parseInt(item.dataset.index);
            if (dragIdx === null || dragIdx === dropIdx) return;
            const moved = extraCostItems.splice(dragIdx, 1)[0];
            extraCostItems.splice(dropIdx, 0, moved);
            await saveSharedLists();
            renderModalExtraItemList();
            showToast('✅ 排序已儲存');
        });
    });

    el.querySelectorAll('.modal-del-extra-item').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const idx  = parseInt(btn.dataset.index);
            const name = extraCostItems[idx];
            if (!confirm(`確定要刪除項目「${name}」嗎？`)) return;
            extraCostItems.splice(idx, 1);
            await saveSharedLists();
            renderModalExtraItemList();
            showToast(`🗑 已刪除「${name}」`);
        });
    });
}

// ==========================================================================
// ⚔️ 裝備計算
// ==========================================================================
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

function calculateBaseAtk() {
    const mainStat   = parseFloat(document.getElementById('mainStat').value)   || 0;
    const subStat    = parseFloat(document.getElementById('subStat').value)    || 0;
    const maxAtk     = parseFloat(document.getElementById('maxAtk').value)     || 0;
    const percentAtk = (parseFloat(document.getElementById('percentAtk').value) || 0) / 100;
    const coeff      = parseFloat(document.getElementById('coeff').value);

    // 優先使用「裝備屬性反推」算出的精確值（未捨去小數，僅本次瀏覽期間記憶體暫存）；
    // 沒跑過、或跑完後面板整數已被改動（與精確值捨去後對不上），視為過期，自動退回面板整數（極小機率的 ±1 內誤差）
    const mainVal = (lastPreciseMainStat !== null && Math.floor(lastPreciseMainStat) === mainStat) ? lastPreciseMainStat : mainStat;
    const subVal  = (lastPreciseSubStat  !== null && Math.floor(lastPreciseSubStat)  === subStat)  ? lastPreciseSubStat  : subStat;
    const statFactor = (mainVal * 4 + subVal) / 100;

    if (statFactor === 0 || coeff === 0 || maxAtk === 0) { alert("請輸入正確的能力值！"); return; }
    const est = Math.round((maxAtk / coeff / statFactor) / (1 + percentAtk));
    let matched = est;
    for (let t = Math.max(1, est - 1000); t <= est + 1000; t++) {
        // 新公式：AP 不捨去小數，直接帶入比對，只在最終表攻結果四捨五入
        if (Math.round(t * (1 + percentAtk) * coeff * statFactor) === Math.round(maxAtk)) { matched = t; break; }
    }
    document.getElementById('resultDisplay').innerText = matched;
    ['A','B'].forEach(s => {
        document.getElementById(`calcBaseAtk${s}`).value    = matched;
        document.getElementById(`calcAtkPercent${s}`).value = document.getElementById('percentAtk').value;
    });
}

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
    // 記錄未捨去的精確主屬總值，供「基礎攻擊力反推」使用（提高精確度，僅記憶體暫存）
    lastPreciseMainStat = (baseAdj + found) * (1 + percent);
    ['A','B'].forEach(s => {
        document.getElementById(`calcMainBase${s}`).value    = base;
        document.getElementById(`calcMainEquip${s}`).value   = found;
        document.getElementById(`calcMainPercent${s}`).value = document.getElementById('statPercent').value;
    });
}

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
    // 記錄未捨去的精確副屬總值，供「基礎攻擊力反推」使用（提高精確度，僅記憶體暫存）
    lastPreciseSubStat = (baseAdj + found) * (1 + percent);
    ['A','B'].forEach(s => {
        document.getElementById(`calcSubBase${s}`).value    = base;
        document.getElementById(`calcSubEquip${s}`).value   = found;
        document.getElementById(`calcSubPercent${s}`).value = document.getElementById('subStatPercent').value;
    });
}

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

    // 新公式：主屬、副屬、AP 皆不捨去小數，直接帶入公式運算，只在最終表攻結果四捨五入
    const totalMain  = (mainBaseAdj + mainEquip) * (1 + mainPct);
    const totalSub   = (subBaseAdj  + subEquip)  * (1 + subPct);
    const statFactor = (totalMain * 4 + totalSub) / 100;
    const totalAtk   = base * (1 + atkPct);
    const result     = Math.round(totalAtk * coeff * statFactor);

    document.getElementById(`finalAtkDisplay${suffix}`).innerText = result.toLocaleString();
}

function calculateFinalAtk() { calcFinalAtk('A'); calcFinalAtk('B'); }

// ==========================================================================
// 📊 經驗計算
// ==========================================================================

// --- 全域狀態 ---
let selectedMinutes   = 10;    // 預設計時長度（分鐘）
let timerInterval     = null;  // 計時 setInterval
let timerSeconds      = 0;     // 已計時秒數
let timerStartTime    = null;  // 計時開始的時間戳記（用於背景節流時仍能正確計時）
let timerWorker       = null;  // Web Worker 計時器
let countdownInterval = null;  // 倒數計時 setInterval
let captureStream     = null;  // 螢幕分享 MediaStream（左右共用）
let captureRegion     = null;  // 經驗值框選座標 {x, y, w, h}
let startCanvas       = null;  // 起始經驗截圖 canvas
let endCanvas         = null;  // 結束經驗截圖 canvas
let captureRegionMeso = null;  // 楓幣框選座標 {x, y, w, h}
let startCanvasMeso   = null;  // 起始楓幣截圖 canvas
let endCanvasMeso     = null;  // 結束楓幣截圖 canvas
let captureWithMeso   = false; // 是否同時截楓幣（對應勾選狀態）
let timerAutoStop     = false; // 本次是否為時間到自動停止（決定是否自動解析）

// --- 初始化：從 localStorage 還原上次框選座標 ---
(function initExpCalc() {
    // 還原經驗值框選座標
    const saved = localStorage.getItem('maple_capture_region');
    if (saved) {
        try {
            captureRegion = JSON.parse(saved);
            updateCaptureCoordsEl('capture-coords', captureRegion);
            document.getElementById('capture-preview').innerText = '已有上次框選座標，請先授權';
            document.getElementById('btn-capture-select').innerText = '授權並截圖';
        } catch(e) {}
    }
    // 還原楓幣框選座標
    const savedMeso = localStorage.getItem('maple_capture_region_meso');
    if (savedMeso) {
        try {
            captureRegionMeso = JSON.parse(savedMeso);
            updateCaptureCoordsEl('capture-coords-meso', captureRegionMeso);
            document.getElementById('capture-preview-meso').innerText = '已有上次框選座標，請先授權';
            document.getElementById('btn-capture-select-meso').innerText = '授權並截圖';
        } catch(e) {}
    }
})();

// --- 勾選「同時截楓幣」：控制右欄 UI 狀態 ---

// 勾選變動事件
function onMesoEnabledChange(e) {
    captureWithMeso = e.target.checked;
    // 存到 localStorage（雲端由 triggerAutoSave 負責）
    applyMesoEnabledUI(captureWithMeso);
}

// 套用楓幣啟用/停用 UI（勾選 checkbox 或從雲端還原時共用）
function applyMesoEnabledUI(enabled) {
    // 右欄框選整區
    const panel = document.getElementById('meso-capture-panel');
    if (panel) {
        panel.style.opacity        = enabled ? '1'    : '0.35';
        panel.style.pointerEvents  = enabled ? 'auto' : 'none';
    }
    // 四格截圖預覽中的楓幣格
    ['ocr-meso-start-wrap','ocr-meso-end-wrap'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.style.opacity       = enabled ? '1'    : '0.35';
            el.style.pointerEvents = enabled ? 'auto' : 'none';
        }
    });
    // 楓幣輸入框
    ['ocr-meso-start-input-wrap','ocr-meso-end-input-wrap'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.style.opacity       = enabled ? '1'    : '0.35';
            el.style.pointerEvents = enabled ? 'auto' : 'none';
        }
    });
    // 楓幣結果列
    const mesoResult = document.getElementById('meso-result-section');
    if (mesoResult) mesoResult.style.display = enabled ? '' : 'none';
}

// --- 框選與截圖 ---

// 通用版授權並框選（target = 'exp' 或 'meso'）
// 左右共用同一個 captureStream，授權只做一次
async function startCaptureSelect(target = 'exp') {
    try {
        const isMeso    = target === 'meso';
        const btnId     = isMeso ? 'btn-capture-select-meso' : 'btn-capture-select';
        const region    = isMeso ? captureRegionMeso          : captureRegion;
        const btnText   = document.getElementById(btnId).innerText;
        const needReselect = btnText === '重新框選';

        // 如果已有 stream 且還活著，不重新授權（左右共用）
        if (!captureStream || captureStream.getTracks().every(t => t.readyState === 'ended')) {
            captureStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
            captureStream.getTracks()[0].addEventListener('ended', () => {
                captureStream = null;
                // 兩欄按鈕都回到未授權狀態
                document.getElementById('btn-capture-select').innerText =
                    captureRegion ? '授權並截圖' : '授權並框選';
                document.getElementById('btn-capture-select-meso').innerText =
                    captureRegionMeso ? '授權並截圖' : '授權並框選';
                document.getElementById('capture-preview').innerText      = '授權已結束';
                document.getElementById('capture-preview-meso').innerText = '授權已結束';
                document.getElementById('btn-preview-exp').disabled  = true;
                document.getElementById('btn-preview-meso').disabled = true;
            });
        }

        // 需要重新框選或尚無座標 → 進框選流程
        if (needReselect || !region) {
            showSelectionOverlay(target);
        } else {
            // 有上次座標且非重新框選 → 直接截圖預覽
            await takePreviewShot(target);
            document.getElementById(btnId).innerText = '重新框選';
            // 截圖成功後啟用「重新截圖」按鈕
            document.getElementById(isMeso ? 'btn-preview-meso' : 'btn-preview-exp').disabled = false;
        }
    } catch(e) {
        alert('授權失敗或已取消：' + e.message);
    }
}

// 顯示全螢幕框選 overlay（target = 'exp' 或 'meso'）
function showSelectionOverlay(target = 'exp') {
    const isMeso    = target === 'meso';
    const labelText = isMeso
        ? '🪙 拖曳框選楓幣區域，放開滑鼠完成選取'
        : '🖱 拖曳框選經驗值區域，放開滑鼠完成選取';

    let vidW = 0;
    let vidH = 0;

    const overlay = document.createElement('div');
    overlay.id = 'capture-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:99999;background:#000;display:flex;flex-direction:column;';

    const titleBar = document.createElement('div');
    titleBar.style.cssText = 'background:rgba(0,0,0,0.85);padding:10px 16px;font-size:13px;color:#aaa;display:flex;justify-content:space-between;align-items:center;flex-shrink:0;';
    titleBar.innerHTML = `
        <span>${labelText}</span>
        <div style="display:flex;gap:8px;align-items:center;">
            <label style="font-size:12px;color:#aaa;">縮放</label>
            <input type="range" id="zoom-slider" min="100" max="300" value="100" style="width:80px;cursor:pointer;">
            <button id="btn-change-window" style="background:#1e88e5;border:none;color:white;padding:6px 14px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:bold;">🔄 更換視窗</button>
            <button id="btn-cancel-select" style="background:#e55353;border:none;color:white;padding:6px 14px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:bold;">✕ 取消</button>
        </div>
    `;
    overlay.appendChild(titleBar);

    const videoWrap = document.createElement('div');
    videoWrap.style.cssText = 'position:relative;flex:1;overflow:auto;cursor:crosshair;background:#000;';

    const video = document.createElement('video');
    video.srcObject = captureStream;
    video.autoplay  = true;
    video.style.cssText = 'width:100%;height:auto;display:block;background:#000;';
    videoWrap.appendChild(video);

    const loadingMask = document.createElement('div');
    loadingMask.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;font-size:16px;color:#aaa;z-index:10;pointer-events:all;cursor:default;';
    loadingMask.innerText = '載入中...';
    videoWrap.appendChild(loadingMask);

    const selBox = document.createElement('div');
    selBox.style.cssText = 'position:absolute;border:2px solid #4dae4c;background:rgba(77,174,76,0.15);pointer-events:none;display:none;';
    videoWrap.appendChild(selBox);

    overlay.appendChild(videoWrap);
    document.body.appendChild(overlay);

    requestAnimationFrame(() => {

        document.getElementById('zoom-slider').addEventListener('input', (e) => {
            video.style.width = e.target.value + '%';
        });

        document.getElementById('btn-cancel-select').addEventListener('click', () => {
            document.body.removeChild(overlay);
        });

        // 更換視窗：停止舊 stream，重新授權，再進框選
        document.getElementById('btn-change-window').addEventListener('click', async () => {
            document.body.removeChild(overlay);
            try {
                if (captureStream) captureStream.getTracks().forEach(t => t.stop());
                captureStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
                captureStream.getTracks()[0].addEventListener('ended', () => {
                    captureStream = null;
                    document.getElementById('btn-capture-select').innerText =
                        captureRegion ? '授權並截圖' : '授權並框選';
                    document.getElementById('btn-capture-select-meso').innerText =
                        captureRegionMeso ? '授權並截圖' : '授權並框選';
                    document.getElementById('capture-preview').innerText      = '授權已結束';
                    document.getElementById('capture-preview-meso').innerText = '授權已結束';
                    document.getElementById('btn-preview-exp').disabled  = true;
                    document.getElementById('btn-preview-meso').disabled = true;
                });
                showSelectionOverlay(target);
            } catch(e) {
                alert('授權失敗或已取消：' + e.message);
            }
        });

        video.addEventListener('playing', () => {
            vidW = video.videoWidth;
            vidH = video.videoHeight;
            loadingMask.remove();
        }, { once: true });

        let startX, startY, isDragging = false;

        videoWrap.addEventListener('mousedown', (e) => {
            if (loadingMask.parentNode) return;
            isDragging = true;
            const rect = videoWrap.getBoundingClientRect();
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

            const videoRect = video.getBoundingClientRect();
            const scaleX = vidW / videoRect.width;
            const scaleY = vidH / videoRect.height;

            const selLeft = parseFloat(selBox.style.left);
            const selTop  = parseFloat(selBox.style.top);

            const newRegion = {
                x: Math.max(0, Math.round(selLeft * scaleX)),
                y: Math.max(0, Math.round(selTop  * scaleY)),
                w: Math.round(parseFloat(selBox.style.width)  * scaleX),
                h: Math.round(parseFloat(selBox.style.height) * scaleY),
            };
            newRegion.w = Math.min(newRegion.w, vidW - newRegion.x);
            newRegion.h = Math.min(newRegion.h, vidH - newRegion.y);

            if (isMeso) {
                // 儲存楓幣框選座標
                captureRegionMeso = newRegion;
                localStorage.setItem('maple_capture_region_meso', JSON.stringify(captureRegionMeso));
                updateCaptureCoordsEl('capture-coords-meso', captureRegionMeso);
            } else {
                // 儲存經驗值框選座標
                captureRegion = newRegion;
                localStorage.setItem('maple_capture_region', JSON.stringify(captureRegion));
                updateCaptureCoordsEl('capture-coords', captureRegion);
            }

            document.body.removeChild(overlay);
            takePreviewShot(target);

            // 框選完成後更新按鈕文字與啟用「重新截圖」
            const btnId = isMeso ? 'btn-capture-select-meso' : 'btn-capture-select';
            document.getElementById(btnId).innerText = '重新框選';
            document.getElementById(isMeso ? 'btn-preview-meso' : 'btn-preview-exp').disabled = false;
        });

    });
}

// 顯示框選座標資訊（通用）
function updateCaptureCoordsEl(elId, region) {
    if (!region) return;
    const el = document.getElementById(elId);
    if (el) el.innerText = `X: ${region.x}　Y: ${region.y}　寬: ${region.w}　高: ${region.h}`;
}

// 截圖並顯示在對應的框選預覽區（target = 'exp' 或 'meso'）
async function takePreviewShot(target = 'exp') {
    const isMeso    = target === 'meso';
    const region    = isMeso ? captureRegionMeso : captureRegion;
    const previewId = isMeso ? 'capture-preview-meso' : 'capture-preview';
    if (!region || !captureStream) return;

    const canvas = await captureRegionToCanvas(region);
    if (!canvas) return;

    const el = document.getElementById(previewId);
    el.innerHTML = '';
    const img = document.createElement('img');
    img.src = canvas.toDataURL();
    img.style.cssText = 'width:100%;height:auto;border-radius:4px;display:block;';
    el.appendChild(img);
}

// 更新 OCR 解析按鈕狀態（需要：截圖都有 + 對應輸入框都空）
function updateOcrBtnState() {
    const btn      = document.getElementById('btn-ocr');
    const startVal = document.getElementById('ocr-start-val').value.trim();
    const endVal   = document.getElementById('ocr-end-val').value.trim();
    // 有截圖才可解析
    const hasExpScreenshots = startCanvas && endCanvas;
    // 輸入框空才可解析（避免覆蓋手動輸入）
    let allEmpty = startVal === '' && endVal === '';
    if (captureWithMeso) {
        const mesoStartVal = document.getElementById('ocr-start-val-meso').value.trim();
        const mesoEndVal   = document.getElementById('ocr-end-val-meso').value.trim();
        allEmpty = allEmpty && mesoStartVal === '' && mesoEndVal === '';
    }
    btn.disabled = !(hasExpScreenshots && allEmpty);
    // 重新截圖按鈕：有起始截圖且有結束截圖才可用
    const recapBtn = document.getElementById('btn-recapture-end');
    if (recapBtn) recapBtn.disabled = !(startCanvas && endCanvas);
}

// 重新截結束截圖：清空所有輸入欄位後重截結束截圖，再自動解析計算
// 時間與起始截圖不變
async function recaptureEnd() {
    if (!captureStream || !captureRegion) { showToast('⚠️ 請先授權並框選區域！'); return; }

    // 清空所有輸入欄位（截圖圖片保留）
    document.getElementById('ocr-start-val').value      = '';
    document.getElementById('ocr-end-val').value        = '';
    document.getElementById('ocr-start-val-meso').value = '';
    document.getElementById('ocr-end-val-meso').value   = '';

    // 截新的結束截圖（經驗）
    endCanvas = await captureRegionToCanvas(captureRegion);
    showCanvasInEl(endCanvas, 'ocr-end-img');

    // 有勾楓幣時同時重截楓幣結束截圖
    if (captureWithMeso && captureRegionMeso) {
        endCanvasMeso = await captureRegionToCanvas(captureRegionMeso);
        showCanvasInEl(endCanvasMeso, 'ocr-end-img-meso');
    }

    updateOcrBtnState();

    // 自動解析（與計時結束時相同流程）
    await parseScreenshots();
}

// 解析截圖：有勾楓幣時四張 Promise.all 同時送，否則只送兩張
let ocrCooldown = false;
async function parseScreenshots() {
    if (ocrCooldown) return;
    if (!startCanvas || !endCanvas) { showToast('⚠️ 請先完成截圖！'); return; }

    const btn = document.getElementById('btn-ocr');
    btn.disabled = true;
    btn.innerText = '解析中...';

    try {
        // 組合要解析的任務（有勾楓幣才加入楓幣兩張）
        const tasks = [
            ocrCanvas(startCanvas),
            ocrCanvas(endCanvas),
        ];
        if (captureWithMeso && startCanvasMeso && endCanvasMeso) {
            tasks.push(ocrCanvas(startCanvasMeso));
            tasks.push(ocrCanvas(endCanvasMeso));
        }

        // 同時送出所有解析任務
        const results = await Promise.all(tasks);

        if (results[0]) document.getElementById('ocr-start-val').value = results[0];
        if (results[1]) document.getElementById('ocr-end-val').value   = results[1];
        if (captureWithMeso && results[2]) document.getElementById('ocr-start-val-meso').value = results[2];
        if (captureWithMeso && results[3]) document.getElementById('ocr-end-val-meso').value   = results[3];

        btn.disabled = true;
        btn.innerText = '🔍 解析截圖';

        // 解析完成後，若對應欄位都有值則自動計算
        tryAutoCalculate();

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

// 解析完後若欄位都有值自動計算（不跳 alert）
function tryAutoCalculate() {
    const startVal = document.getElementById('ocr-start-val').value.trim();
    const endVal   = document.getElementById('ocr-end-val').value.trim();
    if (!startVal || !endVal) return;
    if (captureWithMeso) {
        const mesoStart = document.getElementById('ocr-start-val-meso').value.trim();
        const mesoEnd   = document.getElementById('ocr-end-val-meso').value.trim();
        if (!mesoStart || !mesoEnd) return;
    }
    // 靜默計算（不跳 alert，直接更新結果）
    calculateExpResult(true);
}

// 截圖高度不足 60px 時等比放大
function resizeCanvas(src, targetHeight) {
    const scale = targetHeight / src.height;
    const dst = document.createElement('canvas');
    dst.width  = Math.round(src.width * scale);
    dst.height = targetHeight;
    dst.getContext('2d').drawImage(src, 0, 0, dst.width, dst.height);
    return dst;
}

// 呼叫 PaddleOCR API 解析 canvas
// 楓幣格式（1,123,456,789）和經驗值格式（:123456789[...]）共用同一解析邏輯
async function ocrCanvas(canvas) {
    try {
        const resized = canvas.height < 60 ? resizeCanvas(canvas, 60) : canvas;
        const base64  = resized.toDataURL('image/png').split(',')[1];
        const res = await fetch('https://paddle-ocr.jack19950130.workers.dev', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: base64 }),
        });
        const data  = await res.json();
        console.log('PaddleOCR結果：', data.text);
        // 取開頭連續數字（含逗號），去掉逗號後回傳純數字字串
        // 經驗值：:123456789[12.34%] → match "123456789"
        // 楓幣：1,123,456,789 → match "1,123,456,789" → "1123456789"
        const match = data.text?.match(/^[\d,]+/);
        console.log('解析數字：', match);
        return match ? match[0].replace(/,/g, '') : '';
    } catch (e) {
        showToast('⚠️ 解析失敗，請手動輸入數值');
        return '';
    }
}

// 擷取指定 region 到 canvas（通用，支援多組 region）
async function captureRegionToCanvas(region) {
    if (!region) return null;
    try {
        const track = captureStream.getVideoTracks()[0];

        if (typeof ImageCapture !== 'undefined') {
            const imageCapture = new ImageCapture(track);
            await new Promise(r => setTimeout(r, 300));
            const bitmap = await imageCapture.grabFrame();
            const canvas = document.createElement('canvas');
            canvas.width  = region.w;
            canvas.height = region.h;
            canvas.getContext('2d').drawImage(bitmap, region.x, region.y, region.w, region.h, 0, 0, region.w, region.h);
            return canvas;
        }

        // fallback：用 video 元素截圖
        return await new Promise(resolve => {
            const video = document.createElement('video');
            video.srcObject = captureStream;
            video.autoplay  = true;
            video.onplaying = () => {
                const canvas = document.createElement('canvas');
                canvas.width  = region.w;
                canvas.height = region.h;
                canvas.getContext('2d').drawImage(video, region.x, region.y, region.w, region.h, 0, 0, region.w, region.h);
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

// 將 canvas 顯示在指定元素內
function showCanvasInEl(canvas, elId) {
    const el = document.getElementById(elId);
    if (!el || !canvas) return;
    el.innerHTML = '';
    // 圖片置中顯示，點擊可放大
    el.style.cssText += 'display:flex;align-items:center;justify-content:center;';
    const img = document.createElement('img');
    img.src = canvas.toDataURL();
    img.style.cssText = 'max-width:100%;max-height:100%;object-fit:contain;border-radius:4px;cursor:zoom-in;';
    // 點擊圖片開啟 lightbox 放大
    img.addEventListener('click', () => showLightbox(canvas.toDataURL()));
    el.appendChild(img);
}

// Lightbox：全螢幕顯示截圖，點任意處關閉
function showLightbox(src) {
    const existing = document.getElementById('capture-lightbox');
    if (existing) existing.remove();

    const lb = document.createElement('div');
    lb.id = 'capture-lightbox';
    lb.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:99999;background:rgba(0,0,0,0.88);display:flex;align-items:center;justify-content:center;overflow:hidden;';

    const img = document.createElement('img');
    img.src = src;
    // transition 讓放大/還原有平滑過渡效果
    img.style.cssText = 'max-width:90vw;max-height:90vh;object-fit:contain;border-radius:8px;box-shadow:0 8px 32px rgba(0,0,0,0.8);cursor:zoom-in;transition:transform 0.2s ease;transform:scale(1);';

    // 用 dataset 記錄目前是否已放大
    img.dataset.zoomed = 'false';

    // 點圖片：切換放大兩倍 / 還原正常大小
    img.addEventListener('click', (e) => {
        e.stopPropagation(); // 避免事件冒泡到背景觸發關閉
        const zoomed = img.dataset.zoomed === 'true';
        img.style.transform = zoomed ? 'scale(1)' : 'scale(2)';
        img.style.cursor    = zoomed ? 'zoom-in' : 'zoom-out';
        img.dataset.zoomed  = zoomed ? 'false' : 'true';
    });

    lb.appendChild(img);
    // 點背景（圖片以外的地方）才關閉
    lb.addEventListener('click', () => lb.remove());
    document.body.appendChild(lb);
}

// --- 計時器 ---

function formatTime(seconds) {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
}

// 開始計時：5 秒倒數後截起始截圖，再開始計時
async function startExpTimer() {
    if (!captureStream || !captureRegion) { alert('請先授權並框選區域！'); return; }

    // 有勾楓幣時，檢查楓幣右欄是否有預覽截圖（確保框選座標有效）
    if (captureWithMeso) {
        const mesoPreview = document.getElementById('capture-preview-meso');
        const hasPreview  = mesoPreview && mesoPreview.querySelector('img');
        if (!hasPreview) {
            alert('請先對楓幣區域進行截圖測試（點右欄「📷 重新截圖」）');
            return;
        }
    }

    // 清空上次的截圖、解析值、結果
    startCanvas = null; endCanvas = null;
    startCanvasMeso = null; endCanvasMeso = null;
    document.getElementById('ocr-start-img').innerHTML      = '';
    document.getElementById('ocr-end-img').innerHTML        = '';
    document.getElementById('ocr-start-img-meso').innerHTML = '';
    document.getElementById('ocr-end-img-meso').innerHTML   = '';
    document.getElementById('ocr-start-val').value          = '';
    document.getElementById('ocr-end-val').value            = '';
    document.getElementById('ocr-start-val-meso').value     = '';
    document.getElementById('ocr-end-val-meso').value       = '';
    document.getElementById('exp-total').innerText          = '—';
    document.getElementById('exp-per10').innerText          = '—';
    document.getElementById('exp-per30').innerText          = '—';
    document.getElementById('exp-total-label').innerText    = '總獲得經驗';
    document.getElementById('meso-total').innerText         = '—';
    document.getElementById('meso-per10').innerText         = '—';
    document.getElementById('meso-per30').innerText         = '—';
    timerAutoStop = false;
    updateOcrBtnState();

    document.getElementById('btn-start-timer').disabled = true;
    document.getElementById('btn-stop-timer').disabled  = false;

    // 5 秒倒數
    let countdown = 5;
    document.getElementById('timer-status').innerText = '準備中，請切換到遊戲視窗...';
    document.getElementById('timer-display').style.color = '#ff9f43';

    countdownInterval = setInterval(async () => {
        document.getElementById('timer-display').innerText = `${countdown}`;
        countdown--;
        if (countdown < 0) {
            clearInterval(countdownInterval);

            // 截起始截圖（經驗）
            startCanvas = await captureRegionToCanvas(captureRegion);
            showCanvasInEl(startCanvas, 'ocr-start-img');

            // 有勾楓幣時同時截楓幣起始截圖
            if (captureWithMeso && captureRegionMeso) {
                startCanvasMeso = await captureRegionToCanvas(captureRegionMeso);
                showCanvasInEl(startCanvasMeso, 'ocr-start-img-meso');
            }

            updateOcrBtnState();
            document.getElementById('timer-display').style.color = '#64b5f6';
            document.getElementById('timer-status').innerText = '計時中...';
            timerSeconds = 0;

            // 使用 Web Worker 計時，不受瀏覽器背景節流影響
            if (timerWorker) timerWorker.terminate();
            timerWorker = new Worker('timer-worker.js');
            timerWorker.postMessage({ type: 'start', targetMinutes: selectedMinutes });
            timerWorker.onmessage = async (e) => {
                const { type, seconds } = e.data;
                if (type === 'tick') {
                    timerSeconds = seconds;
                    document.getElementById('timer-display').innerText = formatTime(timerSeconds);
                }
                if (type === 'done') {
                    // 時間到自動停止並截圖
                    timerSeconds  = seconds;
                    timerAutoStop = true;
                    await stopExpTimer(true);
                }
            };
        }
    }, 1000);
}

// 停止計時並截結束截圖
// isAuto = true：時間到自動停止（自動解析）；false：手動停止（不自動解析）
async function stopExpTimer(isAuto = false) {
    clearInterval(countdownInterval);
    // 停止 Web Worker 計時器
    if (timerWorker) {
        timerWorker.terminate();
        timerWorker = null;
    }

    // 截結束截圖（經驗）
    endCanvas = await captureRegionToCanvas(captureRegion);
    showCanvasInEl(endCanvas, 'ocr-end-img');

    // 有勾楓幣時同時截楓幣結束截圖
    if (captureWithMeso && captureRegionMeso) {
        endCanvasMeso = await captureRegionToCanvas(captureRegionMeso);
        showCanvasInEl(endCanvasMeso, 'ocr-end-img-meso');
    }

    updateOcrBtnState();
    document.getElementById('timer-status').innerText    = `已計時 ${formatTime(timerSeconds)}`;
    document.getElementById('btn-start-timer').disabled  = false;
    document.getElementById('btn-stop-timer').disabled   = true;
    document.getElementById('exp-total-label').innerText = `總獲得經驗（${formatTime(timerSeconds)}）`;

    // 時間到自動停止才自動解析；手動停止不自動解析
    if (isAuto) {
        await parseScreenshots();
    }
}

// 根據起始/結束經驗值和計時時間計算獲得經驗
// silent = true：靜默模式（自動計算，遇到問題就 return，不跳 alert）
function calculateExpResult(silent = false) {
    const startVal = parseFloat(document.getElementById('ocr-start-val').value) || 0;
    const endVal   = parseFloat(document.getElementById('ocr-end-val').value)   || 0;
    if (endVal <= startVal) { if (!silent) alert('結束數值必須大於起始數值！'); return; }
    if (timerSeconds === 0) { if (!silent) alert('請先完成計時！'); return; }

    const totalExp = endVal - startVal;
    const per10    = Math.round(totalExp / timerSeconds * 600);
    const per30    = Math.round(totalExp / timerSeconds * 1800);

    document.getElementById('exp-total').innerText  = totalExp.toLocaleString();
    document.getElementById('exp-per10').innerText  = per10.toLocaleString();
    document.getElementById('exp-per30').innerText  = per30.toLocaleString();

    // 計算加成係數（勾選的加成加總：基礎固定為 1，祈禱加 pct/100，加倍卷加 (倍數-1)，休息加 1）
    const prayerOn  = document.getElementById('bonus-prayer')?.checked;
    const twoxOn    = document.getElementById('bonus-2x')?.checked;
    const restOn    = document.getElementById('bonus-rest')?.checked;
    const teachOn   = document.getElementById('bonus-teach')?.checked;
    const prayerPct = parseFloat(document.getElementById('bonus-prayer-val')?.value) || 0;
    const twoxMult  = parseFloat(document.getElementById('bonus-2x-val')?.value)     || 1;
    const teachPct  = parseFloat(document.getElementById('bonus-teach-val')?.value)  || 0;
    const bonus     = (prayerOn ? prayerPct / 100 : 0) + (twoxOn ? (twoxMult - 1) : 0) + (restOn ? 1 : 0) + (teachOn ? teachPct / 100 : 0);
    const hasBonus  = bonus > 0;
    const coeff     = 1 + bonus;

    // 基礎值（除掉加成係數回推底層數值），沒有勾選任何加成時隱藏
    ['total', 'per10', 'per30'].forEach(key => {
        const row = document.getElementById(`exp-${key}-base-row`);
        if (row) row.style.display = hasBonus ? 'block' : 'none';
    });
    if (hasBonus) {
        document.getElementById('exp-total-base').innerText  = Math.round(totalExp / coeff).toLocaleString();
        document.getElementById('exp-per10-base').innerText  = Math.round(per10    / coeff).toLocaleString();
        document.getElementById('exp-per30-base').innerText  = Math.round(per30    / coeff).toLocaleString();
    }

    // 選 1 分時額外計算桑拿經驗（8/16/20 小時）
    if (selectedMinutes === 1) {
        const perMinute = totalExp;
        document.getElementById('exp-per8h').innerText  = Math.round(perMinute * 60 * 8).toLocaleString();
        document.getElementById('exp-per16h').innerText = Math.round(perMinute * 60 * 16).toLocaleString();
        document.getElementById('exp-per20h').innerText = Math.round(perMinute * 60 * 20).toLocaleString();
    } else {
        document.getElementById('exp-per8h').innerText  = '—';
        document.getElementById('exp-per16h').innerText = '—';
        document.getElementById('exp-per20h').innerText = '—';
    }

    // 有勾楓幣時計算楓幣結果（不需加成換算，直接顯示原始差值，允許 0 或負數）
    if (captureWithMeso) {
        const mesoStartStr = document.getElementById('ocr-start-val-meso').value.trim();
        const mesoEndStr   = document.getElementById('ocr-end-val-meso').value.trim();
        // 兩欄位都有填值才計算（不限制結束必須大於起始，可能沒變或減少）
        if (mesoStartStr !== '' && mesoEndStr !== '') {
            const mesoStart = parseFloat(mesoStartStr) || 0;
            const mesoEnd   = parseFloat(mesoEndStr)   || 0;
            const totalMeso = mesoEnd - mesoStart;
            const mesoPer10 = Math.round(totalMeso / timerSeconds * 600);
            const mesoPer30 = Math.round(totalMeso / timerSeconds * 1800);
            document.getElementById('meso-total').innerText  = totalMeso.toLocaleString();
            document.getElementById('meso-per10').innerText  = mesoPer10.toLocaleString();
            document.getElementById('meso-per30').innerText  = mesoPer30.toLocaleString();
        }
    }
}

// ==========================================================================
// 📋 效率紀錄
// ==========================================================================

let expRecords      = [];   // 從雲端載入的所有紀錄
let expRecordSortKey = 'date'; // 目前排序欄位
let expRecordSortAsc = false;  // true = 升序，false = 降序

// 初始化：載入效率紀錄並綁定事件
async function initExpRecords() {
    await loadExpRecords();
    document.getElementById('btn-save-exp-record').addEventListener('click', saveExpRecord);
    document.querySelectorAll('.exp-record-th').forEach(th => {
        th.addEventListener('click', () => {
            const key = th.dataset.key;
            if (expRecordSortKey === key) {
                expRecordSortAsc = !expRecordSortAsc;
            } else {
                expRecordSortKey = key;
                expRecordSortAsc = false;
            }
            renderExpRecords();
        });
    });
}

// 從共用雲端載入效率紀錄
async function loadExpRecords() {
    try {
        const snap = await getDoc(doc(db, 'shared_data', 'exp_records'));
        expRecords = snap.exists() ? (snap.data().records || []) : [];
    } catch(e) {
        console.error('效率紀錄載入失敗：', e);
        expRecords = [];
    }
    renderExpRecords();
}

// 儲存一筆效率紀錄到共用雲端
async function saveExpRecord() {
    const kc    = document.getElementById('userKeyCode')?.value.trim();
    if (!kc) { showToast('⚠️ 請先輸入代碼才能儲存！'); return; }

    const level = document.getElementById('record-level').value.trim();
    const job   = document.getElementById('record-job').value.trim();
    const map   = document.getElementById('record-map').value.trim();
    if (!level || !job || !map) { showToast('⚠️ 請填寫等級、職業、地圖！'); return; }

    // 取得計算結果（基礎值）
    const expPer10El = document.getElementById('exp-per10-base');
    const expPer10Base = expPer10El?.innerText?.replace(/,/g, '');
    // 如果沒有勾選加成，直接用 exp-per10 的值
    const expPer10Raw  = document.getElementById('exp-per10')?.innerText?.replace(/,/g, '');
    const expPer10Val  = (expPer10Base && expPer10Base !== '—' && expPer10Base !== '') ? parseInt(expPer10Base) : parseInt(expPer10Raw);

    if (!expPer10Val || isNaN(expPer10Val) || expPer10Val <= 0) { showToast('⚠️ 請先完成計算再儲存！'); return; }

    // 楓幣/10分（有勾才帶值，否則 null）
    const mesoPer10El  = document.getElementById('meso-per10');
    const mesoPer10Raw = mesoPer10El?.innerText?.replace(/,/g, '');
    const mesoPer10Val = (captureWithMeso && mesoPer10Raw && mesoPer10Raw !== '—') ? parseInt(mesoPer10Raw) : null;

    const record = {
        id:        `${kc}_${Date.now()}`,  // 唯一 id，包含 keycode 用於判斷刪除權限
        keycode:   kc,
        date:      new Date().toISOString().split('T')[0],
        level:     parseInt(level),
        job,
        map,
        minutes:   formatTime(timerSeconds), // 實際計時秒數格式（mm:ss）
        expPer10:  expPer10Val,
        mesoPer10: mesoPer10Val,
    };

    expRecords.unshift(record);
    try {
        await setDoc(doc(db, 'shared_data', 'exp_records'), { records: expRecords }, { merge: false });
        renderExpRecords();
        showToast('💾 紀錄已儲存！');
        // 只清空地圖欄位，等級和職業保留
        document.getElementById('record-map').value = '';
    } catch(e) {
        expRecords.shift();
        showToast('❌ 儲存失敗：' + e.message);
    }
}

// 刪除一筆效率紀錄
async function deleteExpRecord(id) {
    if (!confirm('確定要刪除此筆紀錄嗎？')) return;
    const idx = expRecords.findIndex(r => r.id === id);
    if (idx === -1) return;
    const removed = expRecords.splice(idx, 1)[0];
    try {
        await setDoc(doc(db, 'shared_data', 'exp_records'), { records: expRecords }, { merge: false });
        renderExpRecords();
        showToast('🗑 紀錄已刪除');
    } catch(e) {
        expRecords.splice(idx, 0, removed);
        showToast('❌ 刪除失敗：' + e.message);
    }
}

// 渲染效率紀錄表格
function renderExpRecords() {
    const tbody   = document.getElementById('exp-record-tbody');
    const emptyEl = document.getElementById('exp-record-empty');
    if (!tbody) return;

    const kc = document.getElementById('userKeyCode')?.value.trim();

    // 排序
    const sorted = [...expRecords].sort((a, b) => {
        let va = a[expRecordSortKey], vb = b[expRecordSortKey];
        // 數字欄位
        if (['level','expPer10','mesoPer10'].includes(expRecordSortKey)) {
            va = va ?? -Infinity;
            vb = vb ?? -Infinity;
            return expRecordSortAsc ? va - vb : vb - va;
        }
        // 文字欄位
        va = va ?? '';
        vb = vb ?? '';
        return expRecordSortAsc ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
    });

    // 更新排序箭頭
    document.querySelectorAll('.sort-icon').forEach(el => {
        const key = el.dataset.key;
        el.innerText = key === expRecordSortKey ? (expRecordSortAsc ? ' ▲' : ' ▼') : '';
    });

    if (sorted.length === 0) {
        tbody.innerHTML = '';
        if (emptyEl) emptyEl.style.display = 'block';
        return;
    }
    if (emptyEl) emptyEl.style.display = 'none';

    tbody.innerHTML = sorted.map(r => {
        const canDelete = kc && r.keycode === kc;
        const mesoStr   = r.mesoPer10 != null ? r.mesoPer10.toLocaleString() : '—';
        return `
            <tr style="border-bottom:1px solid #2a2a2a;">
                <td style="padding:7px 6px;font-size:12px;color:#aaa;white-space:nowrap;">${r.date}</td>
                <td style="padding:7px 6px;font-size:12px;color:#e0e0e0;text-align:center;">${r.level}</td>
                <td style="padding:7px 6px;font-size:12px;color:#e0e0e0;">${r.job}</td>
                <td style="padding:7px 6px;font-size:12px;color:#e0e0e0;">${r.map}</td>
                <td style="padding:7px 6px;font-size:12px;color:#aaa;text-align:center;">${r.minutes}</td>
                <td style="padding:7px 6px;font-size:12px;color:#64b5f6;text-align:right;white-space:nowrap;">${r.expPer10.toLocaleString()}</td>
                <td style="padding:7px 6px;font-size:12px;color:#4dae4c;text-align:right;white-space:nowrap;">${mesoStr}</td>
                <td style="padding:7px 6px;text-align:center;">
                    ${canDelete ? `<button class="del-btn exp-record-del" data-id="${r.id}" style="margin:0;">✕</button>` : ''}
                </td>
            </tr>
        `;
    }).join('');

    tbody.querySelectorAll('.exp-record-del').forEach(btn => {
        btn.addEventListener('click', () => deleteExpRecord(btn.dataset.id));
    });
}

// --- 休息經驗計算 ---
function calculateRestExp() {
    const current = parseFloat(document.getElementById('restCurrent').value) || 0;
    const after   = parseFloat(document.getElementById('restAfter').value)   || 0;
    if (after <= current) { alert('獲得後的數值必須大於當前數值！'); return; }

    const perMinute   = after - current;
    const accumulated = current / perMinute;
    const maxExp      = Math.round(perMinute * 60 * 24);
    const remainMin   = Math.max(0, 60 * 24 - accumulated);

    const accumHours   = Math.floor(accumulated / 60);
    const accumMinutes = Math.floor(accumulated % 60);
    const remainHours  = Math.floor(remainMin / 60);
    const remainMins   = Math.floor(remainMin % 60);

    document.getElementById('restAccumTime').innerText  = `${accumHours}小時${accumMinutes}分`;
    document.getElementById('restRemainTime').innerText = `${remainHours}小時${remainMins}分`;
    document.getElementById('restMaxExp').innerText     = maxExp.toLocaleString();
}