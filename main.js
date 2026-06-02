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

// 🧮 第一類：基礎攻擊力反推（四捨五入真相版）
function calculateBaseAtk() {
    const mainStat = parseFloat(document.getElementById('mainStat').value) || 0;
    const subStat = parseFloat(document.getElementById('subStat').value) || 0;
    const maxAtk = parseFloat(document.getElementById('maxAtk').value) || 0;
    const percentAtk = (parseFloat(document.getElementById('percentAtk').value) || 0) / 100;
    const coeff = parseFloat(document.getElementById('coeff').value);
    
    const statFactor = (mainStat * 4 + subStat) / 100;
    if (statFactor === 0 || coeff === 0 || maxAtk === 0) { return; }
    
    let matchedBaseAtk = 0;
    for (let testAtk = 1; testAtk <= 10000; testAtk++) {
        // 💡 模擬遊戲：中間保持高精度，最後輸出四捨五入
        let totalAtk = testAtk * (1 + percentAtk);
        let calcMax = Math.round(totalAtk * coeff * statFactor);
        
        if (calcMax === Math.round(maxAtk)) {
            matchedBaseAtk = testAtk;
            break;
        }
    }
    
    document.getElementById('resultDisplay').innerText = matchedBaseAtk;
}

// 🧮 第二類：裝備純屬性反推（四捨五入真相版）
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
        let calcTotal = Math.round((statBaseOnly + testEquip) * (1 + statPercent));
        if (calcTotal === Math.round(statTotal)) {
            matchedEquipStat = testEquip;
            break;
        }
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
    if (statFactor === 0 || coeff === 0 || maxAtk === 0) { return; }
    
    const customAtkPercent = parseFloat(document.getElementById('simAtkPercentInput').value) || 0;
    const customAtkValue = parseFloat(document.getElementById('simAtkValueInput').value) || 0;

    let baseAtk = 0;
    for (let testAtk = 1; testAtk <= 10000; testAtk++) {
        if (Math.round(testAtk * (1 + percentAtk) * coeff * statFactor) === Math.round(maxAtk)) {
            baseAtk = testAtk;
            break;
        }
    }

    // 連動第三類輸出：同樣使用四捨五入
    const newMaxAtkPercent = Math.round(baseAtk * (1 + percentAtk + (customAtkPercent / 100)) * coeff * statFactor);
    const newMaxAtkValue = Math.round((baseAtk + customAtkValue) * (1 + percentAtk) * coeff * statFactor);

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

    if (!elTotal || !elBase || !elPercent || maxAtk === 0) { return; }

    const statTotal = parseFloat(elTotal.value) || 0;
    const statBaseOnly = parseFloat(elBase.value) || 0;
    const statPercent = (parseFloat(elPercent.value) || 0) / 100;

    const customStatPercent = parseFloat(document.getElementById('simStatPercentInput').value) || 0;
    const customStatValue = parseFloat(document.getElementById('simStatValueInput').value) || 0;

    let baseAtk = 0;
    for (let testAtk = 1; testAtk <= 10000; testAtk++) {
        if (Math.round(testAtk * (1 + percentAtk) * coeff * ((mainStat * 4 + subStat) / 100)) === Math.round(maxAtk)) {
            baseAtk = testAtk;
            break;
        }
    }

    let finalEquipStat = 0;
    for (let testEquip = 0; testEquip <= 10000; testEquip++) {
        if (Math.round((statBaseOnly + testEquip) * (1 + statPercent)) === Math.round(statTotal)) {
            finalEquipStat = testEquip;
            break;
        }
    }

    // 💡 屬性增量放大模擬（同步改為四捨五入）
    const statIncrementPercent = Math.round(finalEquipStat * (customStatPercent / 100));
    const newMainStatPercent = mainStat + statIncrementPercent;
    const newMaxAtkPercent = Math.round(baseAtk * (1 + percentAtk) * coeff * ((newMainStatPercent * 4 + subStat) / 100));
    
    const statIncrementValue = Math.round(customStatValue * (1 + statPercent));
    const newMainStatValue = mainStat + statIncrementValue;
    const newMaxAtkValue = Math.round(baseAtk * (1 + percentAtk) * coeff * ((newMainStatValue * 4 + subStat) / 100));

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