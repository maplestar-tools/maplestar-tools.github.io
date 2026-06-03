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
window.switchTab = function(tabId) {
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    document.querySelector(`button[onclick="switchTab('${tabId}')"]`).classList.add('active');
};

document.addEventListener('DOMContentLoaded', () => {
    // 1. 強制顯示第一個分頁 (確保不是空的)
    const firstTab = document.querySelector('.tab-content');
    const firstBtn = document.querySelector('.tab-btn');
    if (firstTab) firstTab.classList.add('active');
    if (firstBtn) firstBtn.classList.add('active');

    // 2. 初始化計算與讀取
    updateDynamicPrices();
    window.loadSharedMembers();
});

// 摺疊功能 (最單純的寫法，確保不報錯)
window.toggleSection = function(el) {
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

// 【首頁儲存按鈕】儲存個人設定
window.saveToCloud = async function() {
    const keyCode = document.getElementById('userKeyCode').value.trim();
    if (!keyCode) { alert("請先輸入代碼！"); return; }
    
    try {
        await setDoc(doc(db, "player_data", keyCode), { 
            // 1. 原有的結算設定 (這些你已經有了)
            settlementRates: {
                moneyToMileage: parseFloat(document.getElementById('moneyToMileage').value) || 0,
                cubeFancyPrice: parseFloat(document.getElementById('cubeFancyPrice').value) || 0,
                cubeSuspiciousPrice: parseFloat(document.getElementById('cubeSuspiciousPrice').value) || 0
            },
            // 2. 這一塊是你「還沒加入」的，必須補上才能存計算機數據
            calcSettings: {
                baseAtk: parseFloat(document.getElementById('calcBaseAtk').value) || 0,
                atkPercent: parseFloat(document.getElementById('calcAtkPercent').value) || 0,
                mainBase: parseFloat(document.getElementById('calcMainBase').value) || 0,
                mainEquip: parseFloat(document.getElementById('calcMainEquip').value) || 0,
                mainPercent: parseFloat(document.getElementById('calcMainPercent').value) || 0,
                subStat: parseFloat(document.getElementById('calcSubStat').value) || 0,
                coeff: parseFloat(document.getElementById('coeff').value) || 1.0
            },
            lastUpdated: new Date()
        }, { merge: true }); // merge: true 確保不會覆蓋掉舊資料
        alert("💾 全面儲存完成！");
    } catch (e) { alert("儲存失敗：" + e.message); }
};

// 【首頁讀取按鈕】讀取個人設定
window.loadFromCloud = async function() {
    const keyCode = document.getElementById('userKeyCode').value.trim();
    if (!keyCode) { alert('請先輸入代碼！'); return; }
    
    try {
        const docSnap = await getDoc(doc(db, "player_data", keyCode));
        if (docSnap.exists()) {
            const data = docSnap.data();
            
            // 讀取並還原結算數據
            if (data.settlementRates) {
                document.getElementById('moneyToMileage').value = data.settlementRates.moneyToMileage || 0;
                document.getElementById('cubeFancyPrice').value = data.settlementRates.cubeFancyPrice || 0;
                document.getElementById('cubeSuspiciousPrice').value = data.settlementRates.cubeSuspiciousPrice || 0;
                updateDynamicPrices();
            }

            // 讀取並還原計算機數據
            if (data.calcSettings) {
                document.getElementById('calcBaseAtk').value = data.calcSettings.baseAtk || 0;
                document.getElementById('calcAtkPercent').value = data.calcSettings.atkPercent || 0;
                document.getElementById('calcMainBase').value = data.calcSettings.mainBase || 0;
                document.getElementById('calcMainEquip').value = data.calcSettings.mainEquip || 0;
                document.getElementById('calcMainPercent').value = data.calcSettings.mainPercent || 0;
                document.getElementById('calcSubStat').value = data.calcSettings.subStat || 0;
                document.getElementById('coeff').value = data.calcSettings.coeff || 1.0;
                
                // 讀取完畢後，強制執行一次計算，更新畫面
                calculateFinalAtk(); 
            }
            alert("📥 個人設定讀取成功！");
        }
    } catch (e) { alert("讀取失敗：" + e.message); }
};
// 【統一的雲端儲存函式】
window.saveAllToCloud = async function() {
    const keyCode = document.getElementById('userKeyCode').value.trim();
    if (!keyCode) return; // 沒有代碼就不自動觸發

    try {
        await setDoc(doc(db, "player_data", keyCode), { 
            settlementRates: {
                moneyToMileage: parseFloat(document.getElementById('moneyToMileage').value) || 0,
                cubeFancyPrice: parseFloat(document.getElementById('cubeFancyPrice').value) || 0,
                cubeSuspiciousPrice: parseFloat(document.getElementById('cubeSuspiciousPrice').value) || 0
            },
            calcSettings: {
                baseAtk: parseFloat(document.getElementById('calcBaseAtk').value) || 0,
                atkPercent: parseFloat(document.getElementById('calcAtkPercent').value) || 0,
                mainBase: parseFloat(document.getElementById('calcMainBase').value) || 0,
                mainEquip: parseFloat(document.getElementById('calcMainEquip').value) || 0,
                mainPercent: parseFloat(document.getElementById('calcMainPercent').value) || 0,
                subStat: parseFloat(document.getElementById('calcSubStat').value) || 0,
                coeff: parseFloat(document.getElementById('coeff').value) || 1.0
            },
            lastUpdated: new Date()
        }, { merge: true });
        console.log("💾 全部資料已同步至雲端");
    } catch (e) {
        console.error("自動儲存失敗", e);
    }
};

// 全域計時器
let saveTimer;

// 通用的自動儲存觸發器 (綁定給所有 input 的 oninput)
window.triggerAutoSave = function() {
    // 1. 若有價格更新需求，立刻執行
    if(typeof updateDynamicPrices === 'function') updateDynamicPrices();
    
    // 2. 防抖邏輯：停止輸入 5 秒後才存檔
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
        window.saveAllToCloud();
    }, 5000); 
};
/* ==========================================================================
   👥 2. 團隊分紅：共用隊員管理區
   ========================================================================== */
window.members = [];

document.addEventListener('DOMContentLoaded', () => {
    updateDynamicPrices();
    window.loadSharedMembers();
});

window.loadSharedMembers = async function() {
    try {
        const sharedSnap = await getDoc(doc(db, "shared_data", "team_members"));
        if (sharedSnap.exists()) {
            window.members = sharedSnap.data().members || [];
            renderMembers();
        }
    } catch (e) { console.error("共用讀取失敗：", e); }
};

window.saveMembersToCloud = async function() {
    const keyCode = document.getElementById('userKeyCode').value.trim();
    if (!keyCode) { alert("🔒 尚未登入代碼，無法同步！"); return; }
    try {
        await setDoc(doc(db, "shared_data", "team_members"), { members: window.members }, { merge: false });
        alert("✅ 共用名單已同步至雲端！");
    } catch (e) { alert("同步失敗：" + e.message); }
};

window.addMember = function() {
    window.members.push({ name: "", ratio: 1, checked: false });
    renderMembers();
};

window.removeMember = function(index) {
    window.members.splice(index, 1);
    renderMembers();
};

window.updateMemberData = function(index, field, value) {
    window.members[index][field] = value;
};

function renderMembers() {
    const tbody = document.getElementById('member-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    window.members.forEach((member, index) => {
        tbody.innerHTML += `
            <tr style="vertical-align: middle;">
                <td style="text-align: center;">
                    <input type="checkbox" ${member.checked ? 'checked' : ''} onchange="window.members[${index}].checked = this.checked">
                </td>
                <td style="padding: 5px;">
                    <input type="text" value="${member.name}" class="cloud-input" placeholder="名稱..." onchange="updateMemberData(${index}, 'name', this.value)">
                </td>
                <td style="padding: 5px;">
                    <input type="number" value="${member.ratio}" class="cloud-input" onchange="updateMemberData(${index}, 'ratio', parseFloat(this.value))">
                </td>
                <td style="text-align: center; vertical-align: middle;">
                    <button onclick="removeMember(${index})" class="calc-btn btn-red" 
                    style="width: 35px; height: 35px; padding: 0; line-height: 35px; margin: 0 auto; display: block; font-weight:bold;">
                        X
                    </button>
                </td>
            </tr>
        `;
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

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btnCalcBaseAtk').addEventListener('click', calculateBaseAtk);
    document.getElementById('btnCalcEquipStat').addEventListener('click', calculateEquipStat);
    document.getElementById('btnCalcFinal').addEventListener('click', calculateFinalAtk);
});