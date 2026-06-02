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

// 🧮 第一類：基礎攻擊力反推（楓星純淨補償版）
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
    
    // 💡 修正核心：因為 maxAtk 被遊戲捨去過，我們反推總表攻時，加上 0.5 補償誤差
    const totalAtk = (maxAtk + 0.5) / coeff / statFactor;
    const baseAtk = totalAtk / (1 + percentAtk);
    
    // 還原乾淨攻擊力（通常裝備上的攻擊力總和是整數，用 round 最穩）
    document.getElementById('resultDisplay').innerText = Math.round(baseAtk);
}

// 🧮 第二類：裝備純屬性反推（楓星純淨補償版）
function calculateEquipStat() {
    const elTotal = document.getElementById('statTotal');
    const elBase = document.getElementById('statBaseOnly');
    const elPercent = document.getElementById('statPercent');
    const elDisplay = document.getElementById('equipStatDisplay');

    if (!elTotal || !elBase || !elPercent || !elDisplay) { return; }

    const statTotal = parseFloat(elTotal.value) || 0;
    const statBaseOnly = parseFloat(elBase.value) || 0;
    const statPercent = (parseFloat(elPercent.value) || 0) / 100;

    // 💡 修正核心：總屬性本身是整數，反推時加上微小補償防止被二進位制截斷
    const rawEquipStat = ((statTotal + 0.5) / (1 + statPercent)) - statBaseOnly;
    const finalEquipStat = Math.max(0, Math.floor(rawEquipStat));
    
    elDisplay.innerText = finalEquipStat;
}

// 🧮 第三類：攻擊力邊際效益模擬（連動高精度補償）
function simulateAtkBenefit() {
    const mainStat = parseFloat(document.getElementById('mainStat').value) || 0;
    const subStat = parseFloat(document.getElementById('subStat').value) || 0;
    const maxAtk = parseFloat(document.getElementById('maxAtk').value) || 0;
    const percentAtk = (parseFloat(document.getElementById('percentAtk').value) || 0) / 100;
    const coeff = parseFloat(document.getElementById('coeff').value);
    
    const statFactor = (mainStat * 4 + subStat) / 100;
    if (statFactor === 0 || coeff === 0) { alert("請先確保第一欄的攻擊力數據輸入正確！"); return; }
    
    const customAtkPercent = parseFloat(document.getElementById('simAtkPercentInput').value) || 0;
    const customAtkValue = parseFloat(document.getElementById('simAtkValueInput').value) || 0;

    // 這裡同樣使用補償後的總表攻，確保基底是準確的
    const totalAtk = (maxAtk + 0.5) / coeff / statFactor;
    const baseAtk = totalAtk / (1 + percentAtk); 

    // 模擬提升後的總表攻（最後交給遊戲公式的無條件捨去）
    const simAtkPercent = baseAtk * (1 + percentAtk + (customAtkPercent / 100)) * coeff * statFactor;
    const simAtkValue = (baseAtk + customAtkValue) * (1 + percentAtk) * coeff * statFactor;

    document.getElementById('lblSimAtkPercent').innerText = `額外 +${customAtkPercent}% 攻擊力`;
    document.getElementById('lblSimAtkValue').innerText = `額外 +${customAtkValue} 固定攻擊`;

    // 💡 最終輸出：模擬遊戲內部的面板呈現，直接無條件捨去
    document.getElementById('atkSimPercent').innerText = Math.floor(simAtkPercent);
    document.getElementById('atkSimValue').innerText = Math.floor(simAtkValue);
}

// 🧮 第三類：主屬性邊際效益模擬（連動高精度補償）
function simulateStatBenefit() {
    const elTotal = document.getElementById('statTotal');
    const elBase = document.getElementById('statBaseOnly');
    const elPercent = document.getElementById('statPercent');

    if (!elTotal || !elBase || !elPercent) { return; }

    const statTotal = parseFloat(elTotal.value) || 0;
    const statBaseOnly = parseFloat(elBase.value) || 0;
    const statPercent = (parseFloat(elPercent.value) || 0) / 100;

    const customStatPercent = parseFloat(document.getElementById('simStatPercentInput').value) || 0;
    const customStatValue = parseFloat(document.getElementById('simStatValueInput').value) || 0;

    // 反推出無誤差的純裝備屬性
    const rawEquipStat = ((statTotal + 0.5) / (1 + statPercent)) - statBaseOnly;
    const finalEquipStat = Math.max(0, Math.floor(rawEquipStat));

    // 模擬新面板屬性（無條件捨去）
    const simStatPercent = (statBaseOnly + finalEquipStat) * (1 + statPercent + (customStatPercent / 100));
    const simStatValue = (statBaseOnly + finalEquipStat + customStatValue) * (1 + statPercent);

    document.getElementById('lblSimStatPercent').innerText = `額外 +${customStatPercent}% 主屬性`;
    document.getElementById('lblSimStatValue').innerText = `額外 +${customStatValue} 固定主屬`;

    document.getElementById('statSimPercent').innerText = Math.floor(simStatPercent);
    document.getElementById('statSimValue').innerText = Math.floor(simStatValue);
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