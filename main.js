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

// 🧮 第一類：基礎攻擊力反推（分段截斷優化版）
function calculateBaseAtk() {
    const mainStat = parseFloat(document.getElementById('mainStat').value) || 0;
    const subStat = parseFloat(document.getElementById('subStat').value) || 0;
    const maxAtk = parseFloat(document.getElementById('maxAtk').value) || 0;
    const percentAtk = (parseFloat(document.getElementById('percentAtk').value) || 0) / 100;
    const coeff = parseFloat(document.getElementById('coeff').value);
    
    // 1. 遊戲內部的屬性總乘積必定是整數
    const statFactor = Math.floor((mainStat * 4 + subStat) + 0.0001);
    
    if (statFactor === 0 || coeff === 0) {
        alert("請輸入正確的能力值！");
        return;
    }
    
    // 2. 模擬遊戲面板反推：先算出含總%的總攻擊力（整數）
    const totalAtkWithPercent = Math.floor((maxAtk / coeff / (statFactor / 100)) + 0.0001);
    
    // 3. 再次反推乾淨基礎攻擊力
    const baseAtk = totalAtkWithPercent / (1 + percentAtk);
    
    document.getElementById('resultDisplay').innerText = Math.floor(baseAtk + 0.0001);
}

// 🧮 第二類：裝備純屬性反推（分段截斷優化版）
function calculateEquipStat() {
    const elTotal = document.getElementById('statTotal');
    const elBase = document.getElementById('statBaseOnly');
    const elPercent = document.getElementById('statPercent');
    const elDisplay = document.getElementById('equipStatDisplay');

    if (!elTotal || !elBase || !elPercent || !elDisplay) { return; }

    const statTotal = parseFloat(elTotal.value) || 0;
    const statBaseOnly = parseFloat(elBase.value) || 0;
    const statPercent = (parseFloat(elPercent.value) || 0) / 100;

    // 💡 模擬遊戲邏輯：吃 % 數的總額，其實是「總面板 - 不吃%基礎值」
    const premiumStatTotal = statTotal - statBaseOnly;
    
    // 反推純裝備屬性並立刻截斷
    const rawEquipStat = premiumStatTotal / (1 + statPercent);
    const finalEquipStat = Math.max(0, Math.floor(rawEquipStat + 0.0001));
    
    elDisplay.innerText = finalEquipStat;
}

// 🧮 第三類：攻擊力邊際效益模擬（分段截斷優化版）
function simulateAtkBenefit() {
    const mainStat = parseFloat(document.getElementById('mainStat').value) || 0;
    const subStat = parseFloat(document.getElementById('subStat').value) || 0;
    const maxAtk = parseFloat(document.getElementById('maxAtk').value) || 0;
    const percentAtk = (parseFloat(document.getElementById('percentAtk').value) || 0) / 100;
    const coeff = parseFloat(document.getElementById('coeff').value);
    
    const statFactor = Math.floor((mainStat * 4 + subStat) + 0.0001);
    if (statFactor === 0 || coeff === 0) { alert("請先確保第一欄的攻擊力數據輸入正確！"); return; }
    
    const customAtkPercent = parseFloat(document.getElementById('simAtkPercentInput').value) || 0;
    const customAtkValue = parseFloat(document.getElementById('simAtkValueInput').value) || 0;

    // 先取得目前的高精度乾淨攻擊力
    const totalAtkWithPercent = maxAtk / coeff / (statFactor / 100);
    const baseAtk = totalAtkWithPercent / (1 + percentAtk); 

    // 💡 模擬遊戲分段計算：
    // 方案 A（增加%攻）：基礎攻擊力 * (總% 補上 新%) -> 點放後取整
    const simAtkPercentResult = Math.floor(baseAtk * (1 + percentAtk + (customAtkPercent / 100)) + 0.0001);
    
    // 方案 B（增加固定攻）：(基礎攻擊 + 額外攻擊) * 總% -> 點放後取整
    const simAtkValueResult = Math.floor((baseAtk + customAtkValue) * (1 + percentAtk) + 0.0001);

    document.getElementById('lblSimAtkPercent').innerText = `額外 +${customAtkPercent}% 攻擊力`;
    document.getElementById('lblSimAtkValue').innerText = `額外 +${customAtkValue} 固定攻擊`;

    document.getElementById('atkSimPercent').innerText = simAtkPercentResult;
    document.getElementById('atkSimValue').innerText = simAtkValueResult;
}

// 🧮 第三類：主屬性邊際效益模擬（分段截斷優化版）
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

    // 先反推出當前整數的純裝備屬性
    const premiumStatTotal = statTotal - statBaseOnly;
    const finalEquipStat = Math.max(0, Math.floor((premiumStatTotal / (1 + statPercent)) + 0.0001));

    // 💡 模擬遊戲分段：只有（裝備純屬）會去乘上（%數），不吃%的基礎值事後才加進來
    // 方案 A（增加%屬）：(裝備純屬) * (新總%) + 基礎不吃%值
    const partA = Math.floor(finalEquipStat * (1 + statPercent + (customStatPercent / 100)) + 0.0001);
    const simStatPercentResult = partA + statBaseOnly;
    
    // 方案 B（增加固定屬）：(裝備純屬 + 額外屬性) * 當前總% + 基礎不吃%值
    const partB = Math.floor((finalEquipStat + customStatValue) * (1 + statPercent) + 0.0001);
    const simStatValueResult = partB + statBaseOnly;

    document.getElementById('lblSimStatPercent').innerText = `額外 +${customStatPercent}% 主屬性`;
    document.getElementById('lblSimStatValue').innerText = `額外 +${customStatValue} 固定主屬`;

    document.getElementById('statSimPercent').innerText = simStatPercentResult;
    document.getElementById('statSimValue').innerText = simStatValueResult;
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