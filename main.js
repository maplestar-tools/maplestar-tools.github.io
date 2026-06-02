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

// 🌐 雲端儲存與讀取 (邏輯不變)
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

window.loadFromCloud = async function() {
    const keyCode = document.getElementById('userKeyCode').value.trim();
    const statusText = document.getElementById('cloudStatus');
    if (!keyCode) { alert('請先輸入你要讀取的自訂字串（代碼）！'); return; }
    try {
        const docRef = doc(db, "player_data", keyCode);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            const data = docSnap.data();
            alert(`【讀取成功！】\n代碼：${data.userCode}\n最後存檔時間：${data.lastSaveTime}`);
        } else {
            alert("找不到這個代碼的資料！");
        }
    } catch (error) { console.error("讀取失敗：", error); }
}

window.switchTab = function(tabId) {
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    document.querySelector(`button[onclick="switchTab('${tabId}')"]`).classList.add('active');
}

// 🧮 計算核心邏輯
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
    
    // 自動填入基準值欄位
    document.getElementById('baseAtkOverride').value = matchedBaseAtk;
    document.getElementById('mainStatOverride').value = mainStat;
}

function calculateEquipStat() {
    const statTotal = parseFloat(document.getElementById('statTotal').value) || 0;
    const statBaseOnly = parseFloat(document.getElementById('statBaseOnly').value) || 0;
    const statPercent = (parseFloat(document.getElementById('statPercent').value) || 0) / 100;

    let matchedEquipStat = Math.max(0, Math.round((statTotal / (1 + statPercent)) - statBaseOnly));
    document.getElementById('equipStatDisplay').innerText = matchedEquipStat;
}

// 🧮 模擬邏輯 (已加入基準值優先級判斷)
function simulateAtkBenefit() {
    const mainStat = parseFloat(document.getElementById('mainStatOverride').value) || parseFloat(document.getElementById('mainStat').value) || 0;
    const subStat = parseFloat(document.getElementById('subStat').value) || 0;
    const percentAtk = (parseFloat(document.getElementById('percentAtk').value) || 0) / 100;
    const coeff = parseFloat(document.getElementById('coeff').value);
    
    let baseAtk = parseFloat(document.getElementById('baseAtkOverride').value) || parseFloat(document.getElementById('resultDisplay').innerText) || 0;
    const statFactor = (mainStat * 4 + subStat) / 100;
    
    const customAtkPercent = parseFloat(document.getElementById('simAtkPercentInput').value) || 0;
    const customAtkValue = parseFloat(document.getElementById('simAtkValueInput').value) || 0;

    let newMaxAtkPercent = Math.round(Math.floor(baseAtk * (1 + percentAtk + (customAtkPercent / 100))) * coeff * statFactor);
    let newMaxAtkValue = Math.round(Math.floor((baseAtk + customAtkValue) * (1 + percentAtk)) * coeff * statFactor);

    document.getElementById('atkSimPercent').innerText = newMaxAtkPercent;
    document.getElementById('atkSimValue').innerText = newMaxAtkValue;
}

function simulateStatBenefit() {
    const subStat = parseFloat(document.getElementById('subStat').value) || 0;
    const percentAtk = (parseFloat(document.getElementById('percentAtk').value) || 0) / 100;
    const coeff = parseFloat(document.getElementById('coeff').value);
    
    let baseAtk = parseFloat(document.getElementById('baseAtkOverride').value) || parseFloat(document.getElementById('resultDisplay').innerText) || 0;
    let mainStat = parseFloat(document.getElementById('mainStatOverride').value) || parseFloat(document.getElementById('mainStat').value) || 0;
    const statPercent = (parseFloat(document.getElementById('statPercent').value) || 0) / 100;

    const customStatPercent = parseFloat(document.getElementById('simStatPercentInput').value) || 0;
    const customStatValue = parseFloat(document.getElementById('simStatValueInput').value) || 0;

    let finalEquipStat = parseFloat(document.getElementById('equipStatDisplay').innerText) || 0;

    let newStatFactorPercent = ((mainStat + Math.floor(finalEquipStat * (customStatPercent / 100))) * 4 + subStat) / 100;
    let newMaxAtkPercent = Math.round(Math.floor(baseAtk * (1 + percentAtk)) * coeff * newStatFactorPercent);
    
    let newStatFactorValue = ((mainStat + Math.floor(customStatValue * (1 + statPercent))) * 4 + subStat) / 100;
    let newMaxAtkValue = Math.round(Math.floor(baseAtk * (1 + percentAtk)) * coeff * newStatFactorValue);

    document.getElementById('statSimPercent').innerText = newMaxAtkPercent;
    document.getElementById('statSimValue').innerText = newMaxAtkValue;
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btnCalcBaseAtk').addEventListener('click', calculateBaseAtk);
    document.getElementById('btnCalcEquipStat').addEventListener('click', calculateEquipStat);
    document.getElementById('btnSimAtk').addEventListener('click', simulateAtkBenefit);
    document.getElementById('btnSimStat').addEventListener('click', simulateStatBenefit);
});