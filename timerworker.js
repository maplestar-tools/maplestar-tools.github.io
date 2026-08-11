// timer-worker.js
// 在獨立執行緒跑計時器，不受瀏覽器背景節流影響

let startTime    = null;  // 計時開始時間戳記
let intervalId   = null;  // setInterval id
let targetMs     = 0;     // 目標毫秒數（0 = 無限）

self.onmessage = function(e) {
    const { type, targetMinutes } = e.data;

    if (type === 'start') {
        startTime  = Date.now();
        targetMs   = targetMinutes > 0 ? targetMinutes * 60 * 1000 : 0;

        intervalId = setInterval(() => {
            const elapsed = Date.now() - startTime;
            const seconds = Math.floor(elapsed / 1000);

            // 每秒回傳目前秒數
            self.postMessage({ type: 'tick', seconds });

            // 時間到通知主頁面
            if (targetMs > 0 && elapsed >= targetMs) {
                clearInterval(intervalId);
                self.postMessage({ type: 'done', seconds });
            }
        }, 500); // 每 500ms 檢查一次，確保準時觸發
    }

    if (type === 'stop') {
        clearInterval(intervalId);
        const seconds = startTime ? Math.floor((Date.now() - startTime) / 1000) : 0;
        self.postMessage({ type: 'stopped', seconds });
    }
};