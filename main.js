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

// 🧮 第一類：基礎攻擊力反推（精準對齊版）
function calculateBaseAtk() {
    const mainStat = parseFloat(document.getElementById('mainStat').value) || 0;
    const subStat = parseFloat(document.getElementById('subStat').value) || 0;
    const maxAtk = parseFloat(document.getElementById('maxAtk').value) || 0;
    const percentAtk = (parseFloat(document.getElementById('percentAtk').value) || 0) / 100;
    const coeff = parseFloat(document.getElementById('coeff').value);
    
    const statFactor = (mainStat * 4 + subStat) / 100;
    
    if (statFactor === 0 || coeff === 0) {
        alert("請輸入正確的能力值！");
        return;
    }
    
    // 改回最穩定的無條件捨去反推補償，還原最真實的整數基礎攻擊力
    const totalAtk = maxAtk / coeff / statFactor;
    const baseAtk = totalAtk / (1 + percentAtk);
    
    // 透過加上 0.05 進行微調，確保 149.999 這種浮點數被正確歸位到 150
    document.getElementById('resultDisplay').innerText = Math.floor(baseAtk + 0.05);
}

// 🧮 第二類：裝備純屬性反推
function calculateEquipStat() {
    const elTotal = document.getElementById('statTotal');
    const elBase = document.getElementById('statBaseOnly');
    const elPercent = document.getElementById('statPercent');
    const elDisplay = document.getElementById('equipStatDisplay');

    if (!elTotal || !elBase || !elPercent || !elDisplay) { return; }

    const statTotal = parseFloat(elTotal.value) || 0;
    const statBaseOnly = parseFloat(elBase.value) || 0;
    const statPercent = (parseFloat(elPercent.value) || 0) / 100;

    // 反推純裝備屬性
    const rawEquipStat = (statTotal / (1 + statPercent)) - statBaseOnly;
    const finalEquipStat = Math.max(0, Math.floor(rawEquipStat + 0.05));
    
    elDisplay.innerText = finalEquipStat;
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

    // 重新取得第一類算出的「乾淨基礎攻擊力（整數）」作為絕對基準
    const baseAtk = Math.floor((maxAtk / coeff / statFactor) / (1 + percentAtk) + 0.05); 

    // 方案 A：只增加 %攻
    const newMaxAtkPercent = baseAtk * (1 + percentAtk + (customAtkPercent / 100)) * coeff * statFactor;
    
    // 方案 B：只增加固定攻
    const newMaxAtkValue = (baseAtk + customAtkValue) * (1 + percentAtk) * coeff * statFactor;

    // 更新標籤
    document.getElementById('lblSimAtkPercent').innerText = `模擬後最大表攻 (+${customAtkPercent}%)`;
    document.getElementById('lblSimAtkValue').innerText = `模擬後最大表攻 (+${customAtkValue} 攻)`;

    // 輸出（無條件捨去）
    document.getElementById('atkSimPercent').innerText = Math.floor(newMaxAtkPercent);
    document.getElementById('atkSimValue').innerText = Math.floor(newMaxAtkValue);
}

// 🧮 第三類：模擬屬性提升後的「全新最大表攻」
function simulateStatBenefit() {
    // 1. 抓取第一欄（攻擊力）的所有面板基底
    const mainStat = parseFloat(document.getElementById('mainStat').value) || 0;
    const subStat = parseFloat(document.getElementById('subStat').value) || 0;
    const maxAtk = parseFloat(document.getElementById('maxAtk').value) || 0;
    const percentAtk = (parseFloat(document.getElementById('percentAtk').value) || 0) / 100;
    const coeff = parseFloat(document.getElementById('coeff').value);

    // 2. 抓取第二欄（屬性）的所有面板基底
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

    // 3. 還原精準的乾淨基礎攻擊力（整數）
    const baseAtk = Math.floor((maxAtk / coeff / ((mainStat * 4 + subStat) / 100)) / (1 + percentAtk) + 0.05);

    // 4. 💡 解決少很多的關鍵：直接對「主屬性要素（mainStat）」進行增量模擬，不拆解公式
    
    // 方案 A（增加 %屬）：新增的主屬性 = 原本總主屬 + (原本總主屬 - 基礎AP) * (新增% / 當前總屬%)
    // 如果嫌上面太複雜，直接用最穩健的：原本總主屬直接加上洗出來的增量
    const rawEquipStat = Math.floor((statTotal / (1 + statPercent)) - statBaseOnly + 0.05);
    
    // 重新計算加入「新增%屬」後的新總主屬性
    const newMainStatPercent = mainStat + Math.floor(rawEquipStat * (customStatPercent / 100));
    const newStatFactorPercent = (newMainStatPercent * 4 + subStat) / 100;
    const newMaxAtkPercent = baseAtk * (1 + percentAtk) * coeff * newStatFactorPercent;
    
    // 方案 B（增加 固定屬）：新總主屬 = 原本總主屬 + (新增固定屬性 * (1 + 當前總屬%))
    const newMainStatValue = mainStat + Math.floor(customStatValue * (1 + statPercent));
    const newStatFactorValue = (newMainStatValue * 4 + subStat) / 100;
    const newMaxAtkValue = baseAtk * (1 + percentAtk) * coeff * newStatFactorValue;

    // 更新標籤文字
    document.getElementById('lblSimStatPercent').innerText = `模擬後最大表攻 (+${customStatPercent}%)`;
    document.getElementById('lblSimStatValue').innerText = `模擬後最大表攻 (+${customStatValue} 屬)`;

    // 輸出（無條件捨去）
    document.getElementById('statSimPercent').innerText = Math.floor(newMaxAtkPercent);
    document.getElementById('statSimValue').innerText = Math.floor(newMaxAtkValue);
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