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
// 🛡️ 團隊分紅系統：基礎功能與自動同步邏輯
// ==========================================================================

// 1. 即時計算價格 (不需登入即可使用)
function updateDynamicPrices() {
    const mileageRatio = parseFloat(document.getElementById('moneyToMileage').value) || 10000;
    const getPrice = (mileage) => (mileage / mileageRatio) * 1000;

    document.getElementById('pricePlatinum').innerText = (getPrice(7100) / 10000).toFixed(2) + " 億";
    document.getElementById('priceNormal').innerText = (getPrice(3900) / 10000).toFixed(2) + " 億";
    document.getElementById('priceSnow').innerText = Math.round(getPrice(3500)) + " 萬";
}

// 2. 自動儲存邏輯 (有代碼時才執行)
async function triggerAutoSave() {
    updateDynamicPrices();
    const keyCode = document.getElementById('userKeyCode').value.trim();
    if (!keyCode) return;
    await saveSettlementRates();
}

// 3. 基礎設定儲存
window.saveSettlementRates = async function() {
    const keyCode = document.getElementById('userKeyCode').value.trim();
    if (!keyCode) return;

    const ratesData = {
        moneyToMileage: parseFloat(document.getElementById('moneyToMileage').value),
        cubeFancyPrice: parseFloat(document.getElementById('cubeFancyPrice').value),
        cubeSuspiciousPrice: parseFloat(document.getElementById('cubeSuspiciousPrice').value)
    };

    try {
        await setDoc(doc(db, "player_data", keyCode), { settlementRates: ratesData }, { merge: true });
        console.log("✅ 基礎設定已同步");
    } catch (error) {
        console.error("❌ 儲存失敗：", error);
    }
};

// 4. 讀取資料
window.loadFromCloud = async function() {
    const keyCode = document.getElementById('userKeyCode').value.trim();
    if (!keyCode) { alert('請先輸入代碼！'); return; }
    try {
        const docRef = doc(db, "player_data", keyCode);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            const data = docSnap.data();
            // 如果有儲存過基礎設定，讀取並顯示
            if (data.settlementRates) {
                document.getElementById('moneyToMileage').value = data.settlementRates.moneyToMileage;
                document.getElementById('cubeFancyPrice').value = data.settlementRates.cubeFancyPrice;
                document.getElementById('cubeSuspiciousPrice').value = data.settlementRates.cubeSuspiciousPrice;
                updateDynamicPrices(); // 讀取後更新價格
            }
            alert("📥 資料讀取成功！");
        } else {
            alert("⚠️ 找不到該代碼的資料。");
        }
    } catch (error) { console.error("讀取失敗：", error); }
};

// 5. 分頁切換
window.switchTab = function(tabId) {
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    document.querySelector(`button[onclick="switchTab('${tabId}')"]`).classList.add('active');
}

// 6. 網頁載入初始化
document.addEventListener('DOMContentLoaded', () => {
    ['moneyToMileage', 'cubeFancyPrice', 'cubeSuspiciousPrice'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', triggerAutoSave);
    });
    updateDynamicPrices();
});

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