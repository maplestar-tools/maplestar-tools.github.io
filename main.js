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
   🧱 1. 全域/系統功能區 (頁面初始化、頁面切換、雲端基礎連線)
   ========================================================================== */

// 頁面切換功能
window.switchTab = function(tabId) {
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    document.querySelector(`button[onclick="switchTab('${tabId}')"]`).classList.add('active');
};

// 雲端讀取功能 (首頁使用)
window.loadFromCloud = async function() {
    const keyCode = document.getElementById('userKeyCode').value.trim();
    if (!keyCode) { alert('請先輸入代碼！'); return; }
    try {
        const docSnap = await getDoc(doc(db, "player_data", keyCode));
        if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.settlementRates) {
                document.getElementById('moneyToMileage').value = data.settlementRates.moneyToMileage;
                document.getElementById('cubeFancyPrice').value = data.settlementRates.cubeFancyPrice;
                document.getElementById('cubeSuspiciousPrice').value = data.settlementRates.cubeSuspiciousPrice;
                updateDynamicPrices(); // 同步更新計算結果
            }
            alert(`📥 讀取成功！上次存檔：${data.lastSaveTime || '無'}`);
        } else { alert("⚠️ 找不到該代碼資料。"); }
    } catch (e) { console.error("讀取失敗：", e); }
};

/* ==========================================================================
   ⚙️ 2. 團隊分紅：基礎設定區 (匯率計算、自動同步)
   ========================================================================== */

// 自動計算剪刀與雪花價格
function updateDynamicPrices() {
    const mileageRatio = parseFloat(document.getElementById('moneyToMileage').value) || 10000;
    const getPriceInWan = (mileage) => ((mileage / mileageRatio) * 1000).toFixed(1);

    const fancyEl = document.getElementById('priceFancy');
    const platinumEl = document.getElementById('pricePlatinum');
    const snowEl = document.getElementById('priceSnow');

    if(fancyEl) fancyEl.innerText = getPriceInWan(3900);
    if(platinumEl) platinumEl.innerText = getPriceInWan(7100);
    if(snowEl) snowEl.innerText = getPriceInWan(3500 / 11);
}

// 基礎設定儲存邏輯 (自動同步用)
window.saveSettlementRates = async function() {
    const keyCode = document.getElementById('userKeyCode').value.trim();
    if (!keyCode) return;
    await setDoc(doc(db, "player_data", keyCode), { 
        settlementRates: {
            moneyToMileage: parseFloat(document.getElementById('moneyToMileage').value),
            cubeFancyPrice: parseFloat(document.getElementById('cubeFancyPrice').value),
            cubeSuspiciousPrice: parseFloat(document.getElementById('cubeSuspiciousPrice').value)
        } 
    }, { merge: true });
};

// 儲存按鈕專用 (首頁按鈕)
window.saveToCloud = async function() {
    const keyCode = document.getElementById('userKeyCode').value.trim();
    if (!keyCode) { alert('請輸入代碼！'); return; }
    await saveSettlementRates(); // 呼叫基礎儲存
    alert("✅ 資料已成功儲存！");
};

/* ==========================================================================
   👥 3. 團隊分紅：共用雲端隊員管理區
   ========================================================================== */
window.members = []; // 這是從雲端讀取的共用清單

// 新增隊員到網頁暫存表
window.addMember = function() {
    const name = prompt("請輸入隊員名稱:");
    if (!name) return;
    window.members.push({ name: name, ratio: 1, checked: false });
    renderMembers();
};

// 刪除表格隊員
window.removeMember = function(index) {
    window.members.splice(index, 1);
    renderMembers();
};

// 渲染表格 (包含勾選框)
function renderMembers() {
    const tbody = document.getElementById('member-table-body');
    tbody.innerHTML = '';
    window.members.forEach((member, index) => {
        tbody.innerHTML += `
            <tr>
                <td style="text-align: center;"><input type="checkbox" ${member.checked ? 'checked' : ''} onchange="window.members[${index}].checked = this.checked"></td>
                <td style="padding: 5px;"><input type="text" value="${member.name}" class="cloud-input" disabled></td>
                <td style="padding: 5px;"><input type="number" value="${member.ratio}" class="cloud-input" onchange="window.members[${index}].ratio = this.value"></td>
                <td style="text-align: center;"><button onclick="removeMember(${index})" class="calc-btn btn-red">X</button></td>
            </tr>
        `;
    });
}

// 核心比對儲存邏輯：比對雲端與表格，將新隊員補上，刪除被移除的隊員
window.saveMembersToCloud = async function() {
    const keyCode = document.getElementById('userKeyCode').value.trim();
    if (!keyCode) {
        alert("🔒 尚未登入代碼！請先至首頁輸入代碼。");
        return;
    }

    try {
        // 準備送出的資料 (加入 addedBy 標記)
        const updatedList = window.members.map(m => ({
            name: m.name,
            ratio: m.ratio,
            addedBy: m.addedBy || keyCode // 若已有則保留，無則標記為當前代碼
        }));

        await setDoc(doc(db, "shared_data", "team_members"), { 
            members: updatedList 
        }, { merge: false }); // merge: false 表示直接覆蓋以確保刪除動作同步
        
        alert("✅ 共用雲端名單已同步！");
    } catch (e) {
        alert("同步失敗：" + e.message);
    }
};

// 讀取共用雲端
window.loadFromCloud = async function() {
    const keyCode = document.getElementById('userKeyCode').value.trim();
    if (!keyCode) { alert('請先輸入代碼！'); return; }
    
    try {
        const docSnap = await getDoc(doc(db, "shared_data", "team_members"));
        if (docSnap.exists()) {
            window.members = docSnap.data().members || [];
            renderMembers();
            alert("📥 已讀取共用名單。");
        }
    } catch (e) { console.error("讀取失敗：", e); }
};

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

// 🧮 第二類：裝備純屬性反推
function calculateEquipStat() {
    const statTotal = parseFloat(document.getElementById('statTotal').value) || 0;
    const statBaseOnly = parseFloat(document.getElementById('statBaseOnly').value) || 0;
    const statPercent = (parseFloat(document.getElementById('statPercent').value) || 0) / 100;
    const elDisplay = document.getElementById('equipStatDisplay');

    let matchedEquipStat = Math.max(0, Math.round((statTotal / (1 + statPercent)) - statBaseOnly));
    elDisplay.innerText = matchedEquipStat;

    document.getElementById('calcMainBase').value = statBaseOnly;
    document.getElementById('calcMainEquip').value = matchedEquipStat;
    document.getElementById('calcMainPercent').value = document.getElementById('statPercent').value;
}

// 🧮 第三類：完整表攻計算器 (針對正向計算的精準修正)
function calculateFinalAtk() {
    const baseAtk = parseFloat(document.getElementById('calcBaseAtk').value) || 0;
    const atkPercent = (parseFloat(document.getElementById('calcAtkPercent').value) || 0) / 100;
    const mainBase = parseFloat(document.getElementById('calcMainBase').value) || 0;
    const mainEquip = parseFloat(document.getElementById('calcMainEquip').value) || 0;
    const mainPercent = (parseFloat(document.getElementById('calcMainPercent').value) || 0) / 100;
    const subStat = parseFloat(document.getElementById('calcSubStat').value) || 0;
    const coeff = parseFloat(document.getElementById('coeff').value) || 1.0;

    // 1. 先計算總主屬，遊戲內面板通常會四捨五入顯示總主屬
    const totalMainStat = Math.round((mainBase + mainEquip) * (1 + mainPercent));
    
    // 2. 屬性因子：(總主屬 * 4 + 副屬) / 100
    const statFactor = (totalMainStat * 4 + subStat) / 100;
    
    // 3. 攻擊力因子：基礎攻擊力 * (1 + 攻擊%)，遊戲內計算會取整數 (無條件捨去)
    const totalAtk = Math.floor(baseAtk * (1 + atkPercent));
    
    // 4. 最後計算最大表攻：總攻擊力因子 * 職業係數 * 屬性因子
    // 遊戲最後的表攻結果是四捨五入取整數
    const finalAtk = Math.round(totalAtk * coeff * statFactor);

    document.getElementById('finalMaxAtkDisplay').innerText = finalAtk.toLocaleString();
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btnCalcBaseAtk').addEventListener('click', calculateBaseAtk);
    document.getElementById('btnCalcEquipStat').addEventListener('click', calculateEquipStat);
    document.getElementById('btnCalcFinal').addEventListener('click', calculateFinalAtk);
});