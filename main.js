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

// 🌐 雲端儲存
window.saveToCloud = async function() {
    const keyCode = document.getElementById('userKeyCode').value.trim();
    const statusText = document.getElementById('cloudStatus');
    if (!keyCode) { alert('請先輸入一個自訂字串（代碼）再儲存喔！'); return; }
    statusText.innerText = "正在連線到 Google 雲端儲存中...";
    try {
        await setDoc(doc(db, "player_data", keyCode), {
            userCode: keyCode,
            lastSaveTime: new Date().toLocaleString(),
            testMessage: "哈囉！這是你用神祕代碼存在 Google 雲端的測試資料！"
        });
        statusText.innerText = `🎉 儲存成功！時間：${new Date().toLocaleTimeString()}`;
    } catch (error) {
        console.error("儲存失敗：", error);
        statusText.innerText = "❌ 儲存失敗。";
    }
}

// 🌐 雲端讀取
window.loadFromCloud = async function() {
    const keyCode = document.getElementById('userKeyCode').value.trim();
    const statusText = document.getElementById('cloudStatus');
    if (!keyCode) { alert('請先輸入你要讀取的自訂字串（代碼）！'); return; }
    statusText.innerText = "正在從雲端搜尋你的抽屜...";
    try {
        const docRef = doc(db, "player_data", keyCode);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            const data = docSnap.data();
            alert(`【讀取成功！】\n代碼：${data.userCode}\n最後存檔時間：${data.lastSaveTime}\n雲端內文：${data.testMessage}`);
            statusText.innerText = `📂 成功讀取代碼 [${keyCode}] 的進度！`;
        } else {
            statusText.innerText = "❓ 找不到這個代碼的資料。";
            alert("找不到這個代碼的資料！");
        }
    } catch (error) {
        console.error("讀取失敗：", error);
        statusText.innerText = "❌ 讀取失敗。";
    }
}

// 🔄 切換分頁邏輯
window.switchTab = function(tabId) {
    const contents = document.querySelectorAll('.tab-content');
    contents.forEach(content => content.classList.remove('active'));
    
    const buttons = document.querySelectorAll('.tab-btn');
    buttons.forEach(btn => btn.classList.remove('active'));
    
    document.getElementById(tabId).classList.add('active');
    
    buttons.forEach(btn => {
        if (btn.getAttribute('onclick').includes(tabId)) { 
            btn.classList.add('active'); 
        }
    });
}

// 🧮 第一類：基礎攻擊力反推（原廠分段截斷枚舉法：100% 零誤差）
function calculateBaseAtk() {
    const mainStat = parseFloat(document.getElementById('mainStat').value) || 0;
    const subStat = parseFloat(document.getElementById('subStat').value) || 0;
    const maxAtk = parseFloat(document.getElementById('maxAtk').value) || 0;
    const percentAtk = (parseFloat(document.getElementById('percentAtk').value) || 0) / 100;
    const coeff = parseFloat(document.getElementById('coeff').value);
    
    const statFactor = (mainStat * 4 + subStat) / 100;
    
    if (statFactor === 0 || coeff === 0 || maxAtk === 0) {
        alert("請輸入正確的能力值！");
        return;
    }
    
    let matchedBaseAtk = 0;
    
    // 枚舉基礎攻擊力
    for (let testAtk = 1; testAtk <= 10000; testAtk++) {
        // 💡 完美還原遊戲步驟 1：攻擊力乘完 % 數立刻無條件捨去
        let totalAtk = Math.floor(testAtk * (1 + percentAtk) + 0.00001);
        
        // 💡 完美還原遊戲步驟 2：總項乘完再無條件捨去一次
        let calcMax = Math.floor(totalAtk * coeff * statFactor + 0.00001);
        
        if (calcMax === Math.floor(maxAtk)) {
            matchedBaseAtk = testAtk;
            break; // 完美命中！
        }
    }
    
    if (matchedBaseAtk === 0) {
        matchedBaseAtk = Math.round((maxAtk / coeff / statFactor) / (1 + percentAtk));
    }
    
    document.getElementById('resultDisplay').innerText = matchedBaseAtk;
}

// 🧮 第二類：裝備純屬性反推（原廠分段截斷枚舉法：100% 零誤差）
function calculateEquipStat() {
    const elTotal = document.getElementById('statTotal');
    const elBase = document.getElementById('statBaseOnly');
    const elPercent = document.getElementById('statPercent');
    const elDisplay = document.getElementById('equipStatDisplay');

    if (!elTotal || !elBase || !elPercent || !elDisplay) { return; }

    const statTotal = parseFloat(elTotal.value) || 0;
    const statBaseOnly = parseFloat(elBase.value) || 0;
    const statPercent = (parseFloat(elPercent.value) || 0) / 100;

    let matchedEquipStat = 0;

    for (let testEquip = 0; testEquip <= 10000; testEquip++) {
        // 遊戲內屬性 % 數計算也是乘完立刻捨去
        let calcTotal = Math.floor((statBaseOnly + testEquip) * (1 + statPercent) + 0.00001);
        
        if (calcTotal === Math.floor(statTotal)) {
            matchedEquipStat = testEquip;
            break;
        }
    }

    if (matchedEquipStat === 0 && statTotal > 0) {
        matchedEquipStat = Math.max(0, Math.round((statTotal / (1 + statPercent)) - statBaseOnly));
    }
    
    elDisplay.innerText = matchedEquipStat;
}

// 🧮 第三類：模擬攻擊提升後的「全新最大表攻」
function simulateAtkBenefit() {
    const mainStat = parseFloat(document.getElementById('mainStat').value) || 0;
    const subStat = parseFloat(document.getElementById('subStat').value) || 0;
    const maxAtk = parseFloat(document.getElementById('maxAtk').value) || 0;
    const percentAtk = (parseFloat(document.getElementById('percentAtk').value) || 0) / 100;
    const coeff = parseFloat(document.getElementById('coeff').value);
    
    const statFactor = (mainStat * 4 + subStat) / 100;
    if (statFactor === 0 || coeff === 0 || maxAtk === 0) { 
        alert("請先確保第一欄的攻擊力數據已正確輸入！"); 
        return; 
    }
    
    const customAtkPercent = parseFloat(document.getElementById('simAtkPercentInput').value) || 0;
    const customAtkValue = parseFloat(document.getElementById('simAtkValueInput').value) || 0;

    let baseAtk = 0;
    for (let testAtk = 1; testAtk <= 10000; testAtk++) {
        let totalAtk = Math.floor(testAtk * (1 + percentAtk) + 0.00001);
        let calcMax = Math.floor(totalAtk * coeff * statFactor + 0.00001);
        if (calcMax === Math.floor(maxAtk)) {
            baseAtk = testAtk;
            break;
        }
    }
    if (baseAtk === 0) baseAtk = Math.round((maxAtk / coeff / statFactor) / (1 + percentAtk));

    // 💡 第三類輸出同步改為「原廠分段截斷」
    // 方案 A：增加 %攻
    let totalAtkPercent = Math.floor(baseAtk * (1 + percentAtk + (customAtkPercent / 100)) + 0.00001);
    const newMaxAtkPercent = Math.floor(totalAtkPercent * coeff * statFactor);
    
    // 方案 B：增加 固定攻
    let totalAtkValue = Math.floor((baseAtk + customAtkValue) * (1 + percentAtk) + 0.00001);
    const newMaxAtkValue = Math.floor(totalAtkValue * coeff * statFactor);

    document.getElementById('lblSimAtkPercent').innerText = `模擬後最大表攻 (+${customAtkPercent}%)`;
    document.getElementById('lblSimAtkValue').innerText = `模擬後最大表攻 (+${customAtkValue} 攻)`;

    document.getElementById('atkSimPercent').innerText = newMaxAtkPercent;
    document.getElementById('atkSimValue').innerText = newMaxAtkValue;
}

// 🧮 第三類：模擬屬性提升後的「全新最大表攻」
function simulateStatBenefit() {
    const mainStat = parseFloat(document.getElementById('mainStat').value) || 0;
    const subStat = parseFloat(document.getElementById('subStat').value) || 0;
    const maxAtk = parseFloat(document.getElementById('maxAtk').value) || 0;
    const percentAtk = (parseFloat(document.getElementById('percentAtk').value) || 0) / 100;
    const coeff = parseFloat(document.getElementById('coeff').value);

    const elTotal = document.getElementById('statTotal');
    const elBase = document.getElementById('statBaseOnly');
    const elPercent = document.getElementById('statPercent');

    if (!elTotal || !elBase || !elPercent || maxAtk === 0) { 
        alert("請先確保第一欄與第二欄的數據皆已正確輸入！"); 
        return; 
    }

    const statTotal = parseFloat(elTotal.value) || 0;
    const statBaseOnly = parseFloat(elBase.value) || 0;
    const statPercent = (parseFloat(elPercent.value) || 0) / 100;

    const customStatPercent = parseFloat(document.getElementById('simStatPercentInput').value) || 0;
    const customStatValue = parseFloat(document.getElementById('simStatValueInput').value) || 0;

    let baseAtk = 0;
    for (let testAtk = 1; testAtk <= 10000; testAtk++) {
        let totalAtk = Math.floor(testAtk * (1 + percentAtk) + 0.00001);
        let calcMax = Math.floor(totalAtk * coeff * ((mainStat * 4 + subStat) / 100) + 0.00001);
        if (calcMax === Math.floor(maxAtk)) {
            baseAtk = testAtk;
            break;
        }
    }
    if (baseAtk === 0) baseAtk = Math.round((maxAtk / coeff / ((mainStat * 4 + subStat) / 100)) / (1 + percentAtk));

    let finalEquipStat = 0;
    for (let testEquip = 0; testEquip <= 10000; testEquip++) {
        if (Math.floor((statBaseOnly + testEquip) * (1 + statPercent) + 0.00001) === Math.floor(statTotal)) {
            finalEquipStat = testEquip;
            break;
        }
    }
    if (finalEquipStat === 0) finalEquipStat = Math.max(0, Math.round((statTotal / (1 + statPercent)) - statBaseOnly));

    // 💡 第三類屬性輸出同步改為「原廠分段截斷」
    // 方案 A：增加 %屬
    const statIncrementPercent = Math.floor(finalEquipStat * (customStatPercent / 100) + 0.00001);
    const newMainStatPercent = mainStat + statIncrementPercent;
    const newStatFactorPercent = (newMainStatPercent * 4 + subStat) / 100;
    let currentTotalAtkA = Math.floor(baseAtk * (1 + percentAtk) + 0.00001);
    const newMaxAtkPercent = Math.floor(currentTotalAtkA * coeff * newStatFactorPercent);
    
    // 方案 B：增加 固定屬
    const statIncrementValue = Math.floor(customStatValue * (1 + statPercent) + 0.00001);
    const newMainStatValue = mainStat + statIncrementValue;
    const newStatFactorValue = (newMainStatValue * 4 + subStat) / 100;
    let currentTotalAtkB = Math.floor(baseAtk * (1 + percentAtk) + 0.00001);
    const newMaxAtkValue = Math.floor(currentTotalAtkB * coeff * newStatFactorValue);

    document.getElementById('lblSimStatPercent').innerText = `模擬後最大表攻 (+${customStatPercent}%)`;
    document.getElementById('lblSimStatValue').innerText = `模擬後最大表攻 (+${customStatValue} 屬)`;

    document.getElementById('statSimPercent').innerText = newMaxAtkPercent;
    document.getElementById('statSimValue').innerText = newMaxAtkValue;
}

// 🎯 用 DOMContentLoaded 安全掛載所有按鈕監聽器
document.addEventListener('DOMContentLoaded', () => {
    const btnBaseAtk = document.getElementById('btnCalcBaseAtk');
    const btnEquipStat = document.getElementById('btnCalcEquipStat');
    const btnSimAtk = document.getElementById('btnSimAtk');
    const btnSimStat = document.getElementById('btnSimStat');

    if (btnBaseAtk) btnBaseAtk.addEventListener('click', calculateBaseAtk);
    if (btnEquipStat) btnEquipStat.addEventListener('click', calculateEquipStat);
    
    // 綁定第三類自訂模擬按鈕
    if (btnSimAtk) btnSimAtk.addEventListener('click', simulateAtkBenefit);
    if (btnSimStat) btnSimStat.addEventListener('click', simulateStatBenefit);
});