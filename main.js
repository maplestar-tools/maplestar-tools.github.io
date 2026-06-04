// 從模組匯入函式
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
/* ==========================================================================
   🧱 1. 全域/系統功能區 (包含首頁的存檔與讀取)
   ========================================================================== */
// 【修正模組化問題】明確將函式綁定到 window 物件，HTML 才找得到
function switchTab(tabId) {
    // 1. 隱藏所有內容與移除所有按鈕的 active
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));

    // 2. 顯示目標分頁內容
    document.getElementById(tabId).classList.add('active');

    // 3. 根據 tabId 來點亮對應的按鈕
    // 這裡我們直接透過對應的 id 來加 active，這比原本的寫法更準確
    if (tabId === 'home') document.getElementById('btn-tab-home').classList.add('active');
    if (tabId === 'money-split') document.getElementById('btn-tab-money').classList.add('active');
    if (tabId === 'equip-calc') document.getElementById('btn-tab-equip').classList.add('active');
}

/* --- 統一初始化中心：頁面載入後依序執行 --- */
window.addEventListener('DOMContentLoaded', () => {
    // 1. 本地資料還原 (優先權最高)
    const localData = localStorage.getItem('maple_tool_data');
    if (localData) {
        try {
            fillValues(JSON.parse(localData));
            updateSyncUI('synced');
        } catch (e) { console.error("本地資料還原失敗", e); }
    }

    // 2. 初始化分頁狀態
    const firstTab = document.querySelector('.tab-content');
    const firstBtn = document.querySelector('.tab-btn');
    if (firstTab) firstTab.classList.add('active');
    if (firstBtn) firstBtn.classList.add('active');

    // 3. 系統功能初始化
    updateDynamicPrices();
    loadSharedMembers();

    // 4. 事件監聽：總守門員 (全域 input 監聽)
    document.addEventListener('input', (event) => {
        // 排除掉不該自動觸發儲存的欄位 (例如 KeyCode)
        if ((event.target.tagName === 'INPUT' || event.target.tagName === 'SELECT') && event.target.id !== 'userKeyCode') {
            triggerAutoSave();
        }
    });

    // 5. 按鈕點擊事件綁定
    // 1. 分頁切換
    document.getElementById('btn-tab-home').addEventListener('click', () => switchTab('home'));
    document.getElementById('btn-tab-money').addEventListener('click', () => switchTab('money-split'));
    document.getElementById('btn-tab-equip').addEventListener('click', () => switchTab('equip-calc'));
    // 2. 雲端同步區塊
    document.getElementById('btn-load-cloud').addEventListener('click', loadFromCloud);
    document.getElementById('btn-manual-sync').addEventListener('click', () => saveAllToCloud(true));
    // 3. 團隊成員管理
    // 注意：toggleSection 需要傳入點擊的元素，這裡用事件對象 e 取得
    document.getElementById('btn-toggle-member').addEventListener('click', (e) => toggleSection(e.currentTarget));
    document.getElementById('btn-add-member').addEventListener('click', addMember);
    document.getElementById('btn-save-members').addEventListener('click', saveMembersToCloud);
    // 4. 計算器綁定
    document.getElementById('btnCalcBaseAtk').addEventListener('click', calculateBaseAtk);
    document.getElementById('btnCalcEquipStat').addEventListener('click', calculateEquipStat);
    document.getElementById('btnCalcFinal').addEventListener('click', calculateFinalAtk);

    // 6.處理動態成員表格的輸入與刪除
    document.getElementById('member-table-body').addEventListener('change', (e) => {
        const idx = e.target.dataset.index;
        if (e.target.classList.contains('mem-check')) members[idx].checked = e.target.checked;
        if (e.target.classList.contains('mem-name')) updateMemberData(idx, 'name', e.target.value);
        if (e.target.classList.contains('mem-ratio')) updateMemberData(idx, 'ratio', parseFloat(e.target.value));
    });

    document.getElementById('member-table-body').addEventListener('click', (e) => {
        if (e.target.classList.contains('mem-del')) removeMember(e.target.dataset.index);
    });
});

// 摺疊功能 (最單純的寫法，確保不報錯)
function toggleSection(el) {
    const content = document.getElementById('member-section');
    if (!content) return;
    
    // 判斷是否為展開狀態 (用 display 判斷更穩定)
    if (content.style.maxHeight && content.style.maxHeight !== '0px') {
        content.style.maxHeight = '0px';
        el.querySelector('span').innerText = '▼';
    } else {
        content.style.maxHeight = content.scrollHeight + "px";
        el.querySelector('span').innerText = '▲';
    }
};

// 雲端儲存與讀取系統
/* --- 全域變數 --- */
let saveTimer;         // 用於 15 秒自動儲存的計時器
let lastSavedData = null; // 用於比對資料是否變更，避免無意義的雲端寫入

/* --- UI 更新函式：負責狀態燈顯示 --- */
function updateSyncUI(status, message = "") {
    const dot = document.getElementById('sync-dot');
    const text = document.getElementById('sync-status-text');
    const states = {
        synced: { color: '#4caf50', label: '已同步' },   // 綠色：正常
        pending: { color: '#ff9800', label: '同步中...' }, // 黃色：變更中
        error: { color: '#f44336', label: '同步失敗' }   // 紅色：錯誤
    };
    if (dot && text) {
        dot.style.backgroundColor = states[status].color;
        text.innerText = message || states[status].label;
    }
}

/* --- 自動儲存觸發器：所有 input 變動時會自動呼叫此函式 --- */
function triggerAutoSave() {
    if (typeof updateDynamicPrices === 'function') updateDynamicPrices();
    
    // 1. 本地即時備份：確保無論網路狀況如何，資料都不會流失
    const currentData = getFormValues();
    localStorage.setItem('maple_tool_data', JSON.stringify(currentData));
    
    // 2. 獲取當前 KeyCode，決定是否要上傳雲端
    const keyCode = document.getElementById('userKeyCode')?.value.trim();
    
    if (keyCode) {
        updateSyncUI('pending'); // 開始進入同步等待
        
        // 3. 15 秒防抖延遲：避免頻繁操作導致寫入資料庫過載
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
            // 只有內容真的有變更，才進行雲端寫入
            if (JSON.stringify(currentData) !== JSON.stringify(lastSavedData)) {
                saveAllToCloud(false);
            } else {
                updateSyncUI('synced'); // 無變更則維持綠燈
            }
        }, 15000);
    }
};

/* --- 雲端同步核心：執行寫入動作 --- */
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
        
        // 寫入雲端
        await setDoc(doc(db, "player_data", keyCode), dataToSave, { merge: true });
        
        // 同步狀態更新
        lastSavedData = JSON.parse(JSON.stringify(dataToSave));
        localStorage.setItem('maple_tool_data', JSON.stringify(dataToSave));
        updateSyncUI('synced');
        
        // 更新 UI 顯示的帳號代碼
        document.getElementById('display-keycode').innerText = keyCode;
        if (isManual) showToast("💾 手動同步成功");
    } catch (e) {
        updateSyncUI('error', '同步失敗');
        alert("❌ 儲存失敗：" + e.message);
    }
};

/* --- 資料讀取功能 --- */
async function loadFromCloud() {
    const keyCode = document.getElementById('userKeyCode')?.value.trim();
    if (!keyCode) { alert('請先輸入代碼！'); return; }
    
    try {
        const docSnap = await getDoc(doc(db, "player_data", keyCode));
        if (!docSnap.exists()) { alert("找不到資料"); return; }
        
        const data = docSnap.data();
        fillValues(data); // 呼叫你的填充欄位函式
        
        // 讀取後寫入本地備份並更新狀態
        localStorage.setItem('maple_tool_data', JSON.stringify(data));
        lastSavedData = JSON.parse(JSON.stringify(data));
        updateSyncUI('synced');
        
        document.getElementById('display-keycode').innerText = keyCode;
        if (typeof updateDynamicPrices === 'function') updateDynamicPrices();
        if (typeof calculateFinalAtk === 'function') calculateFinalAtk();
        
        alert("📥 設定讀取成功！");
    } catch (e) { 
        alert("讀取失敗：" + e.message); 
    }
};

/* --- 輔助：填寫資料 --- */
function fillValues(obj) {
    for (let key in obj) {
        if (typeof obj[key] === 'object' && obj[key] !== null) {
            fillValues(obj[key]);
        } else {
            const el = document.getElementById(key);
            if (el) el.value = obj[key];
        }
    }
}

/* --- 輔助：取得資料 --- */
function getFormValues() {
    return {
        settlementRates: {
            moneyToMileage: document.getElementById('moneyToMileage')?.value || 0,
            cubeFancyPrice: document.getElementById('cubeFancyPrice')?.value || 0,
            cubeSuspiciousPrice: document.getElementById('cubeSuspiciousPrice')?.value || 0
        },
        calcSettings: {
            coeff: document.getElementById('coeff')?.value || 1.0,
            mainStat: document.getElementById('mainStat')?.value || 0,
            subStat: document.getElementById('subStat')?.value || 0,
            maxAtk: document.getElementById('maxAtk')?.value || 0,
            percentAtk: document.getElementById('percentAtk')?.value || 0,
            statTotal: document.getElementById('statTotal')?.value || 0,
            statBaseOnly: document.getElementById('statBaseOnly')?.value || 0,
            statPercent: document.getElementById('statPercent')?.value || 0,
            calcBaseAtk: document.getElementById('calcBaseAtk')?.value || 0,
            calcAtkPercent: document.getElementById('calcAtkPercent')?.value || 0,
            calcMainBase: document.getElementById('calcMainBase')?.value || 0,
            calcMainEquip: document.getElementById('calcMainEquip')?.value || 0,
            calcMainPercent: document.getElementById('calcMainPercent')?.value || 0,
            calcSubStat: document.getElementById('calcSubStat')?.value || 0
        }
    };
}
/* ==========================================================================
   ⚙️ 2. 團隊分紅：基礎設定與計算
   ========================================================================== */
// A. 專門負責「算數字」的 (給 oninput 用)
function updateDynamicPrices() {
    const mileageRatio = parseFloat(document.getElementById('moneyToMileage').value) || 10000;
    const getPriceInWan = (mileage) => ((mileage / mileageRatio) * 1000).toFixed(1);
    document.getElementById('priceFancy').innerText = getPriceInWan(3900);
    document.getElementById('pricePlatinum').innerText = getPriceInWan(7100);
    document.getElementById('priceSnow').innerText = getPriceInWan(3500 / 11);
}
/* ==========================================================================
   👥 3. 團隊分紅：共用隊員管理區
   ========================================================================== */
let members = [];

async function loadSharedMembers() {
    try {
        const sharedSnap = await getDoc(doc(db, "shared_data", "team_members"));
        if (sharedSnap.exists()) {
            members = sharedSnap.data().members || [];
            renderMembers();
        }
    } catch (e) { console.error("共用讀取失敗：", e); }
};

async function saveMembersToCloud() {
    const keyCode = document.getElementById('userKeyCode').value.trim();
    if (!keyCode) { alert("🔒 尚未登入代碼，無法同步！"); return; }
    try {
        await setDoc(doc(db, "shared_data", "team_members"), { members: members }, { merge: false });
        alert("✅ 共用名單已同步至雲端！");
    } catch (e) { alert("同步失敗：" + e.message); }
};

function addMember() {
    members.push({ name: "", ratio: 1, checked: false });
    renderMembers();
};

function removeMember(index) {
    members.splice(index, 1);
    renderMembers();
};

function updateMemberData(index, field, value) {
    members[index][field] = value;
};

function renderMembers() {
    const tbody = document.getElementById('member-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    members.forEach((member, index) => {
        const tr = document.createElement('tr');
        tr.style.verticalAlign = "middle";
        tr.innerHTML = `
            <td style="text-align: center;"><input type="checkbox" class="mem-check" data-index="${index}" ${member.checked ? 'checked' : ''}></td>
            <td style="padding: 5px;"><input type="text" value="${member.name}" class="cloud-input mem-name" data-index="${index}" placeholder="名稱..."></td>
            <td style="padding: 5px;"><input type="number" value="${member.ratio}" class="cloud-input mem-ratio" data-index="${index}"></td>
            <td style="text-align: center;"><button class="calc-btn btn-red mem-del" data-index="${index}" style="width:35px;height:35px;padding:0;font-weight:bold;">X</button></td>
        `;
        tbody.appendChild(tr);
    });
}

// 🧮 第一類：基礎攻擊力反推
function calculateBaseAtk() {
    const mainStat = parseFloat(document.getElementById('mainStat').value) || 0;
    const subStat = parseFloat(document.getElementById('subStat').value) || 0;
    const maxAtk = parseFloat(document.getElementById('maxAtk').value) || 0;
    const percentAtk = (parseFloat(document.getElementById('percentAtk').value) || 0) / 100;
    const coeff = parseFloat(document.getElementById('coeff').value);
    
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
    
    document.getElementById('calcBaseAtk').value = matchedBaseAtk;
    document.getElementById('calcAtkPercent').value = document.getElementById('percentAtk').value;
    document.getElementById('calcMainBase').value = mainStat;
    document.getElementById('calcMainEquip').value = 0;
    document.getElementById('calcMainPercent').value = 0;
    document.getElementById('calcSubStat').value = subStat;
}

// 🧮 第二類：裝備純屬性反推 (使用窮舉法，杜絕誤差)
function calculateEquipStat() {
    const statTotal = parseFloat(document.getElementById('statTotal').value) || 0;
    const statBaseOnly = parseFloat(document.getElementById('statBaseOnly').value) || 0;
    const statPercent = (parseFloat(document.getElementById('statPercent').value) || 0) / 100;
    const elDisplay = document.getElementById('equipStatDisplay');

    let foundStat = 0;
    
    // 從 0 到 10000 窮舉可能的裝備屬性 (範圍視需求調整)
    for (let testStat = 0; testStat <= 10000; testStat++) {
        // 使用與遊戲一模一樣的公式：Floor((基礎+裝備) * (1+%) )
        const calculated = Math.floor((statBaseOnly + testStat) * (1 + statPercent));
        
        if (calculated === statTotal) {
            foundStat = testStat;
            break; // 找到第一個符合的就停止
        }
    }

    elDisplay.innerText = foundStat;

    // 自動帶入第三部分
    document.getElementById('calcMainBase').value = statBaseOnly;
    document.getElementById('calcMainEquip').value = foundStat;
    document.getElementById('calcMainPercent').value = document.getElementById('statPercent').value;
}

// 🧮 第三類：完整表攻計算器 (最終修正版)
function calculateFinalAtk() {
    const baseAtk = parseFloat(document.getElementById('calcBaseAtk').value) || 0;
    const atkPercent = (parseFloat(document.getElementById('calcAtkPercent').value) || 0) / 100;
    const mainBase = parseFloat(document.getElementById('calcMainBase').value) || 0;
    const mainEquip = parseFloat(document.getElementById('calcMainEquip').value) || 0;
    const mainPercent = (parseFloat(document.getElementById('calcMainPercent').value) || 0) / 100;
    const subStat = parseFloat(document.getElementById('calcSubStat').value) || 0;
    const coeff = parseFloat(document.getElementById('coeff').value) || 1.0;

    // 關鍵修正：使用 Math.floor 無條件捨去，以符合遊戲內部邏輯
    const totalMainStat = Math.floor((mainBase + mainEquip) * (1 + mainPercent));
    
    // 屬性因子：保留完整小數
    const statFactor = (totalMainStat * 4 + subStat) / 100;
    
    // 攻擊力因子：遊戲內部運算為無條件捨去
    const totalAtk = Math.floor(baseAtk * (1 + atkPercent));
    
    // 最終表攻：最後結果四捨五入
    const finalAtk = Math.round(totalAtk * coeff * statFactor);

    document.getElementById('finalMaxAtkDisplay').innerText = finalAtk.toLocaleString();
}