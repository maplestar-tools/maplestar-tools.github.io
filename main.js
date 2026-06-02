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
// 🔄 切換職業類型 (物理 / 魔法)
window.toggleJob = function(type) {
    const weaponGroup = document.getElementById('weaponGroup');
    const lblMain = document.getElementById('lblMain');
    const lblSub = document.getElementById('lblSub');
    const resTitle = document.getElementById('resTitle');
    
    if (type === 'magic') {
        weaponGroup.style.display = 'none';
        lblMain.innerText = '主屬性 (智力 INT)';
        lblSub.innerText = '副屬性 (幸運 LUK)';
        resTitle.innerText = '反推純淨基礎魔法攻擊力';
    } else {
        weaponGroup.style.display = 'block';
        lblMain.innerText = '主屬性 (STR / DEX / LUK)';
        lblSub.innerText = '副屬性 (DEX / STR)';
        resTitle.innerText = '反推純淨基礎物理攻擊力';
    }
}

// 🧮 核心演算法：反推乾淨攻擊力
window.calculateBaseAtk = function() {
    const jobType = document.querySelector('input[name="jobType"]:checked').value;
    const mainStat = parseFloat(document.getElementById('mainStat').value) || 0;
    const subStat = parseFloat(document.getElementById('subStat').value) || 0;
    const maxAtk = parseFloat(document.getElementById('maxAtk').value) || 0;
    const percentAtk = (parseFloat(document.getElementById('percentAtk').value) || 0) / 100;
    
    let coeff = 1.0;
    if (jobType === 'physical') {
        coeff = parseFloat(document.getElementById('coeff').value);
    }
    
    // 計算屬性基底
    const statFactor = (mainStat * 4 + subStat) / 100;
    
    if (statFactor === 0 || coeff === 0) {
        alert("請輸入正確的能力值！");
        return;
    }
    
    // 反推總攻擊力，再扣除 %攻 的加成
    const totalAtk = maxAtk / coeff / statFactor;
    const baseAtk = totalAtk / (1 + percentAtk);
    
    // 四捨五入輸出
    document.getElementById('resultDisplay').innerText = Math.round(baseAtk);
}
