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

// 雲端儲存
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

// 雲端讀取
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

// 切換分頁
window.switchTab = function(tabId) {
    const contents = document.querySelectorAll('.tab-content');
    contents.forEach(content => content.classList.remove('active'));
    const buttons = document.querySelectorAll('.tab-btn');
    buttons.forEach(btn => btn.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    buttons.forEach(btn => {
        if (btn.getAttribute('onclick').includes(tabId)) { btn.classList.add('active'); }
    });
}

// 💰 團隊分紅：切換稅率按鈕視覺效果
window.setTax = function(rate) {
    document.getElementById('taxRate').value = rate;
    const btn5 = document.getElementById('btnTax5');
    const btn3 = document.getElementById('btnTax3');
    if(!btn5 || !btn3) return;
    
    if (rate === 5) {
        btn5.style.background = '#ffaa00';
        btn5.style.color = 'black';
        btn3.style.background = '#2d2d2d';
        btn3.style.color = '#aaa';
    } else {
        btn3.style.background = '#ffaa00';
        btn3.style.color = 'black';
        btn5.style.background = '#2d2d2d';
        btn5.style.color = '#aaa';
    }
}

// 💰 團隊分紅：核心計算
window.calculateSplit = function() {
    const totalMoney = parseFloat(document.getElementById('totalMoney').value) || 0;
    const playerCount = parseInt(document.getElementById('playerCount').value) || 1;
    const taxRate = parseFloat(document.getElementById('taxRate').value) || 5;

    const totalTax = totalMoney * (taxRate / 100);
    const taxedTotal = totalMoney - totalTax;
    const perPlayer = Math.floor(taxedTotal / playerCount);

    document.getElementById('perPlayerMoney').innerText = perPlayer.toLocaleString() + " 楓幣";
    document.getElementById('totalTaxShow').innerText = Math.round(totalTax).toLocaleString() + " 楓幣";
}

// 🧮 第一類：基礎攻擊力反推（不分物魔，極簡通算版）
window.calculateBaseAtk = function() {
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
    
    const totalAtk = maxAtk / coeff / statFactor;
    const baseAtk = totalAtk / (1 + percentAtk);
    
    document.getElementById('resultDisplay').innerText = Math.round(baseAtk);
}

// 🧮 第二類：裝備純屬性反推
window.calculateEquipStat = function() {
    const statTotal = parseFloat(document.getElementById('statTotal').value) || 0;
    const statBaseOnly = parseFloat(document.getElementById('statBaseOnly').value) || 0;
    const statPercent = (parseFloat(document.getElementById('statPercent').value) || 0) / 100;

    const rawEquipStat = (statTotal / (1 + statPercent)) - statBaseOnly;
    const finalEquipStat = Math.max(0, Math.round(rawEquipStat));

    document.getElementById('equipStatDisplay').innerText = finalEquipStat;
}

// 初始化分紅稅率顏色
setTimeout(() => { if(document.getElementById('btnTax5')) setTax(5); }, 200);