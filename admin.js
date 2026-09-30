// *** IMPORTANT ***
// คุณต้องนำ URL ของ Web App ที่ได้จาก Google Apps Script มาใส่ตรงนี้ (ต้องเป็น URL เดียวกับใน script.js)
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzLk2fmojtjc8upkQmYp-d7tbgaQVJw1moBGSpLWYiYd-MQ18WI-c8zYfRc4qI45vVQ/exec';

const loginScreen = document.getElementById('loginScreen');
const adminApp = document.getElementById('adminApp');
const loginForm = document.getElementById('loginForm');
const passwordInput = document.getElementById('passwordInput');
const loginError = document.getElementById('loginError');

const loading = document.getElementById('loading');
const tableContainer = document.getElementById('tableContainer');
const ordersTableBody = document.getElementById('ordersTableBody');
const errorMsg = document.getElementById('errorMsg');
const errorText = document.getElementById('errorText');
const lastUpdate = document.getElementById('lastUpdate');

// Modal Elements
const uploadModal = document.getElementById('uploadModal');
const uploadForm = document.getElementById('uploadForm');
const deliveryImageInput = document.getElementById('deliveryImage');
const deliveryPreviewContainer = document.getElementById('deliveryPreviewContainer');
const deliveryPreview = document.getElementById('deliveryPreview');
const confirmDeliveryBtn = document.getElementById('confirmDeliveryBtn');
const currentOrderId = document.getElementById('currentOrderId');

const alertModal = document.getElementById('alertModal');
const alertTitle = document.getElementById('alertTitle');
const alertMessage = document.getElementById('alertMessage');
const alertIcon = document.getElementById('alertIcon');
const alertIconContainer = document.getElementById('alertIconContainer');

let deliveryBase64 = null;

// Global State Variables
let allOrders = [];
let currentTab = 'active';
let knownOrderIds = new Set();
let isInitialLoad = true;
let isFetchingOrders = false;
let pollingInterval = null;
let lastDataFingerprint = '';
let pendingNewOrders = [];

// Login Logic
loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (passwordInput.value === '66040114545') {
        loginScreen.classList.add('hidden');
        adminApp.classList.remove('hidden');
        requestNotificationPermission();

        // 1. Instant render from local cache (0ms wait!)
        try {
            const cached = localStorage.getItem('adminCachedOrders');
            if (cached) {
                const parsed = JSON.parse(cached);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    allOrders = parsed;
                    allOrders.forEach(o => knownOrderIds.add(o.OrderID));
                    renderOrders();
                }
            }
        } catch(e) {}

        // 2. Fetch fresh data in background
        fetchOrders(allOrders.length > 0);
        startPolling();
    } else {
        loginError.classList.remove('hidden');
        passwordInput.value = '';
    }
});

function fetchOrders(silent = false) {
    if (isFetchingOrders) return; // Prevent overlapping requests
    isFetchingOrders = true;

    if (!silent && allOrders.length === 0) {
        loading.classList.remove('hidden');
        tableContainer.classList.add('hidden');
        errorMsg.classList.add('hidden');
    }

    // Clean up old pending JSONP tags
    document.querySelectorAll('script[data-jsonp="orders"]').forEach(s => {
        if (s.dataset.timeoutId) clearTimeout(parseInt(s.dataset.timeoutId));
        s.remove();
    });

    const script = document.createElement('script');
    script.dataset.jsonp = 'orders';
    script.src = `${SCRIPT_URL}?action=getOrders&callback=handleOrdersResponse&t=${Date.now()}`;

    // 25-second timeout for GAS cold start
    const tid = setTimeout(() => {
        script.remove();
        isFetchingOrders = false;
        if (!silent && allOrders.length === 0) {
            showError('โหลดข้อมูลนานเกินไป กรุณากดปุ่มรีเฟรชอีกครั้ง');
            loading.classList.add('hidden');
        }
        scheduleNextAdminPoll(8000);
    }, 25000);
    script.dataset.timeoutId = String(tid);

    script.onerror = () => {
        clearTimeout(tid);
        script.remove();
        isFetchingOrders = false;
        if (!silent && allOrders.length === 0) {
            showError('ไม่สามารถเชื่อมต่อกับ Google Apps Script ได้');
            loading.classList.add('hidden');
        }
        scheduleNextAdminPoll(8000);
    };

    document.body.appendChild(script);
}

// Robust POST with retry
async function robustPost(payload, retries = 3, delayMs = 1500) {
    for (let i = 0; i < retries; i++) {
        try {
            const res = await fetch(SCRIPT_URL, { method: 'POST', body: JSON.stringify(payload) });
            const data = await res.json();
            return data;
        } catch(e) {
            console.warn(`POST attempt ${i+1} failed:`, e.message);
            if (i < retries - 1) await new Promise(r => setTimeout(r, delayMs));
        }
    }
    throw new Error('POST failed after max retries');
}

// JSONP Callback
function handleOrdersResponse(data) {
    isFetchingOrders = false;

    // Clear timeout + remove script tag
    document.querySelectorAll('script[data-jsonp="orders"]').forEach(s => {
        if (s.dataset.timeoutId) clearTimeout(parseInt(s.dataset.timeoutId));
        s.remove();
    });

    // Schedule next silent poll 6 seconds AFTER current response is processed
    scheduleNextAdminPoll(6000);

    if (!Array.isArray(data)) {
        console.error('Data received is not an array:', data);
        loading.classList.add('hidden');
        tableContainer.classList.remove('hidden');
        return;
    }

    lastUpdate.textContent = new Date().toLocaleTimeString('th-TH');
    const incoming = data.slice().reverse();

    // Merge locally remembered photos so refreshing never loses photos
    incoming.forEach(o => {
        try {
            const localItems = localStorage.getItem('localItemsPhoto_' + o.OrderID);
            if (localItems && !o.ItemsPhoto) {
                o.ItemsPhoto = localItems;
            } else if (o.ItemsPhoto && o.ItemsPhoto.startsWith('http')) {
                localStorage.removeItem('localItemsPhoto_' + o.OrderID);
            }

            const localDelivery = localStorage.getItem('localDeliveryPhoto_' + o.OrderID);
            if (localDelivery && !o.DeliveryPhoto) {
                o.DeliveryPhoto = localDelivery;
            } else if (o.DeliveryPhoto && o.DeliveryPhoto.startsWith('http')) {
                localStorage.removeItem('localDeliveryPhoto_' + o.OrderID);
            }
        } catch(err) {}
    });

    // Cache locally for instant next load
    try {
        localStorage.setItem('adminCachedOrders', JSON.stringify(incoming));
    } catch(e) {}

    // Detect new order IDs
    const newOnes = incoming.filter(o => !knownOrderIds.has(o.OrderID));
    newOnes.forEach(o => knownOrderIds.add(o.OrderID));

    if (!isInitialLoad && newOnes.length > 0) {
        // Play sound + browser notification
        playNewOrderSound();
        showBrowserNotification(newOnes.length);
        flashTabTitle(newOnes.length);

        // Store pending data, show banner — DON'T auto re-render
        pendingNewOrders = incoming;
        showNewOrderBanner(newOnes.length);
    } else {
        const fingerprint = JSON.stringify(incoming.map(o => ({ 
            id: o.OrderID, 
            status: o.Status, 
            items: o.Items, 
            totalPrice: o.TotalPrice,
            hasItemsPhoto: !!o.ItemsPhoto,
            hasDeliveryPhoto: !!o.DeliveryPhoto 
        })));
        if (fingerprint !== lastDataFingerprint || isInitialLoad) {
            lastDataFingerprint = fingerprint;
            allOrders = incoming;
            renderOrders();
        } else {
            loading.classList.add('hidden');
            tableContainer.classList.remove('hidden');
        }
    }
    isInitialLoad = false;
}

function showNewOrderBanner(count) {
    let banner = document.getElementById('newOrderBanner');
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'newOrderBanner';
        banner.className = 'fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-green-500 text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 cursor-pointer animate-bounce';
        banner.onclick = applyPendingOrders;
        document.body.appendChild(banner);
    }
    banner.innerHTML = `<i class="fa-solid fa-bell text-xl"></i> <span class="font-bold">มีออเดอร์ใหม่ ${count} รายการ! กดเพื่อดูเลย</span> <i class="fa-solid fa-arrow-right"></i>`;
    banner.classList.remove('hidden');
}

function applyPendingOrders() {
    const banner = document.getElementById('newOrderBanner');
    if (banner) banner.classList.add('hidden');
    if (pendingNewOrders.length > 0) {
        allOrders = pendingNewOrders;
        pendingNewOrders = [];
    }
    lastDataFingerprint = JSON.stringify(allOrders.map(o => ({ id: o.OrderID, status: o.Status })));
    renderOrders();
}

function switchTab(tab) {
    currentTab = tab;
    
    const tabActive = document.getElementById('tabActive');
    const tabHistory = document.getElementById('tabHistory');
    
    if (tab === 'active') {
        tabActive.className = "py-3 px-6 text-sm font-bold border-b-2 border-green-500 text-green-600 focus:outline-none transition-colors";
        tabHistory.className = "py-3 px-6 text-sm font-bold border-b-2 border-transparent text-gray-500 hover:text-gray-700 focus:outline-none transition-colors";
    } else {
        tabHistory.className = "py-3 px-6 text-sm font-bold border-b-2 border-green-500 text-green-600 focus:outline-none transition-colors";
        tabActive.className = "py-3 px-6 text-sm font-bold border-b-2 border-transparent text-gray-500 hover:text-gray-700 focus:outline-none transition-colors";
    }
    
    renderOrders();
}

window.currentSortOrder = 'newest';
function changeSortOrder() {
    window.currentSortOrder = document.getElementById('sortOrderSelect').value;
    renderOrders();
}

function fetchShopStatus() {
    const script = document.createElement('script');
    script.src = `${SCRIPT_URL}?action=getShopStatus&callback=handleShopStatusResponse`;
    document.body.appendChild(script);
}

function handleShopStatusResponse(data) {
    const toggle = document.getElementById('shopToggle');
    const label = document.getElementById('shopStatusLabel');
    const bg = document.getElementById('shopToggleBg');
    const dot = document.getElementById('shopToggleDot');
    
    if (!toggle) return;
    
    toggle.checked = data.isOpen;
    if (data.isOpen) {
        label.textContent = "ร้านเปิดอยู่";
        label.classList.remove('text-red-500');
        bg.classList.replace('bg-red-400', 'bg-green-400') || bg.classList.add('bg-green-400');
        dot.classList.add('translate-x-6');
    } else {
        label.textContent = "ร้านปิดรับออเดอร์";
        label.classList.add('text-red-500');
        bg.classList.replace('bg-green-400', 'bg-red-400');
        dot.classList.remove('translate-x-6');
    }
}

async function toggleShopStatus() {
    const toggle = document.getElementById('shopToggle');
    const isOpen = toggle.checked;
    
    handleShopStatusResponse({ isOpen: isOpen });
    
    try {
        await fetch(SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors', // To avoid CORS console errors
            body: JSON.stringify({ action: "toggleShop", isOpen: isOpen })
        });
    } catch (e) {
        console.log('Toggle save error (expected if no-cors):', e);
    }
}

document.addEventListener('DOMContentLoaded', fetchShopStatus);

// ============================================================
// Notification System
// ============================================================

// Request browser notification permission on login
function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
}

// Play notification sound (beep 3 times for new order)
function playNewOrderSound() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const beep = (startTime) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = 'sine';
            osc.frequency.value = 880;
            gain.gain.setValueAtTime(0.6, startTime);
            gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.3);
            osc.start(startTime);
            osc.stop(startTime + 0.3);
        };
        beep(ctx.currentTime);
        beep(ctx.currentTime + 0.4);
        beep(ctx.currentTime + 0.8);
    } catch(e) {
        console.log('Audio error:', e);
    }
}

// Show browser notification
function showBrowserNotification(count) {
    if ('Notification' in window && Notification.permission === 'granted') {
        const n = new Notification('🛒 มีออเดอร์ใหม่! - hiwtororkorrr', {
            body: `มี ${count} ออเดอร์ใหม่รอดำเนินการครับ`,
            icon: 'hiwtororkorrr.png',
            badge: 'hiwtororkorrr.png',
            requireInteraction: true,
            tag: 'new-order'
        });
        n.onclick = () => { window.focus(); n.close(); };
        // Auto-close after 10 seconds
        setTimeout(() => n.close(), 10000);
    }
}

// Flash tab title
let flashInterval = null;
function flashTabTitle(count) {
    if (flashInterval) clearInterval(flashInterval);
    const original = document.title;
    let toggle = false;
    flashInterval = setInterval(() => {
        document.title = toggle ? `🔔 ${count} ออเดอร์ใหม่!` : original;
        toggle = !toggle;
    }, 1000);
    // Stop flashing after 30 seconds
    setTimeout(() => {
        clearInterval(flashInterval);
        flashInterval = null;
        document.title = original;
    }, 30000);
}

// ============================================================
// Adaptive Sequential Polling: ไม่ซ้อนทับ ไม่ดึงซ้ำตอนสลับแท็บ
// ============================================================
let adminPollTimer = null;

function scheduleNextAdminPoll(delayMs = 6000) {
    if (adminPollTimer) clearTimeout(adminPollTimer);
    if (document.hidden) return; // ไม่ดึงข้อมูลเมื่อแอดมินสลับไปแท็บอื่น
    adminPollTimer = setTimeout(() => {
        fetchOrders(true);
    }, delayMs);
}

function startPolling() {
    if (adminPollTimer) clearTimeout(adminPollTimer);
    scheduleNextAdminPoll(6000);
}

// เมื่อแอดมินสลับกลับมาที่แท็บ ให้ดึงข้อมูลทันที
document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
        fetchOrders(true);
    } else {
        if (adminPollTimer) clearTimeout(adminPollTimer);
    }
});


function updateDashboard() {
    let ordersToday = 0;
    let feesToday = 0;
    let revenueToday = 0;
    
    const d = new Date();
    const dStr1 = d.toLocaleDateString('th-TH');
    const dStr2 = `${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()+543}`;
    const dStr3 = `${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()}`;
    
    allOrders.forEach(order => {
        const orderDateStr = (order.Timestamp || '').split(' ')[0];
        
        let isToday = false;
        if (orderDateStr === dStr1 || orderDateStr === dStr2 || orderDateStr === dStr3) {
            isToday = true;
        } else {
            try {
                const dateObj = new Date(order.Timestamp);
                if (!isNaN(dateObj) && dateObj.toDateString() === d.toDateString()) {
                    isToday = true;
                }
            } catch(e){}
        }

        if (isToday && order.Status === 'Delivered') {
            ordersToday++;
            feesToday += parseFloat(order.DeliveryFee) || 0;
            revenueToday += parseFloat(order.TotalPrice) || 0;
        }
    });

    const dashboard = document.getElementById('dailyDashboard');
    if (dashboard) {
        dashboard.classList.remove('hidden');
        document.getElementById('dashOrdersToday').textContent = ordersToday;
        document.getElementById('dashFeesToday').textContent = feesToday;
        document.getElementById('dashRevenueToday').textContent = revenueToday;
    }
}

function renderOrders() {
    loading.classList.add('hidden');
    tableContainer.classList.remove('hidden');
    ordersTableBody.innerHTML = '';
    
    // Update Daily Dashboard
    updateDashboard();
    
    // Restore checkbox states from localStorage after render
    setTimeout(restoreChecklistStates, 50);
    
    // Filter orders by tab
    let filteredOrders = allOrders.filter(o => {
        const isHistory = o.Status === 'Delivered' || o.Status === 'ยกเลิก/ของหมด';
        if (currentTab === 'active') return !isHistory;
        return isHistory;
    });
    
    // Sort orders
    if (window.currentSortOrder === 'oldest') {
        filteredOrders.reverse();
    } else if (window.currentSortOrder === 'location') {
        filteredOrders.sort((a, b) => {
            const locA = (a.DormName || 'ไม่ได้ระบุ').trim().split(' - ')[0].toLowerCase();
            const locB = (b.DormName || 'ไม่ได้ระบุ').trim().split(' - ')[0].toLowerCase();
            return locA.localeCompare(locB);
        });
    }

    if (filteredOrders.length === 0) {
        ordersTableBody.innerHTML = `
            <tr>
                <td colspan="5" class="py-12 text-center text-gray-500">
                    <i class="fa-solid fa-box-open text-4xl text-gray-300 mb-3 block"></i>
                    ยังไม่มีรายการในหมวดหมู่นี้
                </td>
            </tr>
        `;
        return;
    }

    let lastLocation = null;

    filteredOrders.forEach(order => {
        // Group Header for Location Sort
        if (window.currentSortOrder === 'location') {
            const fullLoc = (order.DormName || 'ไม่ได้ระบุสถานที่').trim();
            const currentLoc = fullLoc.includes(' - ') ? fullLoc.split(' - ')[0] : fullLoc;
            
            if (currentLoc !== lastLocation) {
                ordersTableBody.innerHTML += `
                    <tr class="bg-blue-100/50 border-y-2 border-blue-200">
                        <td colspan="5" class="py-3 px-4 text-sm font-black text-blue-800 shadow-sm">
                            <i class="fa-solid fa-location-dot mr-2 text-blue-600 text-lg"></i> โซนจัดส่ง: ${currentLoc}
                        </td>
                    </tr>
                `;
                lastLocation = currentLoc;
            }
        }
        
        let itemsHtml = '';
        const isHistoryOrder = order.Status === 'Delivered' || order.Status === 'ยกเลิก/ของหมด';
        
        try {
            const items = JSON.parse(order.Items);
            window.orderItemsCache = window.orderItemsCache || {};
            window.orderItemsCache[order.OrderID] = items;
            
            let totalPrice = parseFloat(order.TotalPrice) || 0;
            let deliveryFee = parseFloat(order.DeliveryFee) || 20;
            
            if (isHistoryOrder) {
                // === HISTORY: Read-only simple list ===
                itemsHtml = `<div class="text-sm font-bold text-gray-500 mb-2">รายการที่สั่ง:</div>`;
                itemsHtml += items.map(item => {
                    const oosStyle = item.outOfStock ? 'line-through text-red-400 opacity-60' : 'text-gray-800';
                    const badge = item.outOfStock 
                        ? `<span class="text-xs bg-red-100 text-red-500 font-bold px-2 py-0.5 rounded-full ml-2">ของหมด</span>`
                        : `<span class="text-xs bg-green-100 text-green-700 font-bold px-2 py-0.5 rounded-full ml-1">${item.quantity} ${item.unit || 'ชิ้น'}</span>`;
                    const priceHtml = item.price && !item.outOfStock
                        ? `<span class="text-sm font-bold text-gray-600 ml-auto">${item.price} ฿</span>` : '';
                    return `
                    <div class="flex items-center text-sm mb-1.5 px-3 py-2 bg-gray-50 rounded-xl border border-gray-100">
                        <span class="font-semibold ${oosStyle} flex-1">${item.Name}</span>
                        ${badge}
                        ${priceHtml}
                    </div>`;
                }).join('');
                
                if (totalPrice > 0) {
                    itemsHtml += `
                    <div class="mt-2 flex justify-between items-center text-sm pt-2 border-t border-gray-200">
                        <span class="text-gray-500 font-semibold">ยอดรวม:</span>
                        <span class="font-bold text-red-500">${totalPrice} ฿</span>
                    </div>`;
                }

            } else {
                // === ACTIVE: Full edit mode ===
                itemsHtml = `
                <div class="flex justify-between items-center mb-3">
                    <span class="text-sm font-bold text-gray-700">รายการที่ต้องซื้อ:</span>
                    <div class="flex gap-2">
                        <button onclick="openEditOrderModal('${order.OrderID}')" class="text-xs bg-blue-100 text-blue-700 hover:bg-blue-200 py-1 px-3 rounded-full font-bold transition shadow-sm"><i class="fa-solid fa-pen-to-square mr-1"></i> แก้ไข</button>
                        <button onclick="deleteOrder('${order.OrderID}')" class="text-xs bg-red-100 text-red-700 hover:bg-red-200 py-1 px-3 rounded-full font-bold transition shadow-sm"><i class="fa-solid fa-trash mr-1"></i> ลบออเดอร์</button>
                    </div>
                </div>
                `;
                
                itemsHtml += items.map((item, idx) => {
                    let imgLink = '';
                    if (item.imageUrl) {
                        imgLink = `<a href="${item.imageUrl}" target="_blank" class="text-blue-500 hover:underline ml-2 text-xs font-semibold bg-blue-50 px-2 py-0.5 rounded-full"><i class="fa-solid fa-image"></i> รูป</a>`;
                    }
                    const chkId = `chk_${order.OrderID}_${idx}`;
                    const oosId = `oos_${order.OrderID}_${idx}`;
                    const isOOS = item.outOfStock ? 'checked' : '';
                    const displayStyle = item.outOfStock ? 'hidden' : 'flex';
                    const nameStyle = item.outOfStock ? 'line-through text-red-400' : 'text-gray-800';
                    const itemPrice = item.price ? parseFloat(item.price) : '';
                    
                    return `
                    <div class="flex items-center text-sm mb-2 bg-gray-50 p-3 rounded-xl border border-gray-100 transition hover:bg-gray-100">
                        <label for="${chkId}" class="flex items-center cursor-pointer mr-3">
                            <input type="checkbox" id="${chkId}" class="w-4 h-4 text-green-600 rounded focus:ring-green-500" onchange="toggleChecklist(this)">
                        </label>
                        <div class="flex-1 min-w-0">
                            <span class="font-bold item-name transition-colors block truncate ${nameStyle}">${item.Name}</span> 
                            <span class="text-green-700 bg-green-100 px-2 py-0.5 rounded-full text-xs font-bold inline-block mt-1">${item.quantity} ${item.unit || 'ชิ้น'}</span>
                            ${imgLink}
                        </div>
                        <div class="ml-2 flex items-center shrink-0 space-x-2">
                            <label class="flex items-center cursor-pointer text-xs font-bold text-red-500 bg-red-50 px-2 py-1.5 rounded-lg border border-red-100 hover:bg-red-100 transition">
                                <input type="checkbox" id="${oosId}" class="mr-1 w-3 h-3 text-red-500 rounded focus:ring-red-500" onchange="toggleOOS('${order.OrderID}', ${idx}, this)" ${isOOS}> หมด
                            </label>
                            <div id="price_div_${order.OrderID}_${idx}" class="${displayStyle} items-center">
                                <input type="number" step="0.5" min="0" placeholder="ราคา" value="${itemPrice}" oninput="calcTotal('${order.OrderID}')" class="item-price-${order.OrderID} w-16 p-1.5 text-center text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-green-500 outline-none">
                                <span class="text-xs text-gray-500 ml-1 font-bold">฿</span>
                            </div>
                        </div>
                    </div>
                    `;
                }).join('');
                
                itemsHtml += `
                    <div class="mt-3 bg-blue-50 p-3 rounded-xl border border-blue-100 space-y-2">
                        <div class="flex justify-between items-center text-sm">
                            <span class="font-bold text-gray-700">ค่าหิ้ว/ค่าส่ง:</span>
                            <div class="flex items-center">
                                <input type="number" id="fee_${order.OrderID}" value="${deliveryFee}" oninput="calcTotal('${order.OrderID}')" class="w-16 p-1.5 text-center text-sm border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-bold text-blue-700">
                                <span class="text-xs text-blue-700 ml-1 font-bold">฿</span>
                            </div>
                        </div>
                        <div class="flex justify-between items-center text-sm pt-2 border-t border-blue-200">
                            <span class="font-bold text-gray-900">ยอดรวมทั้งหมด:</span>
                            <div class="flex items-center">
                                <span id="total_${order.OrderID}" class="font-bold text-lg text-red-500 mr-1">${totalPrice || '-'}</span>
                                <span class="text-xs text-gray-500 font-bold">฿</span>
                                <button onclick="savePrices('${order.OrderID}')" id="saveBtn_${order.OrderID}" class="ml-3 bg-blue-500 hover:bg-blue-600 text-white text-xs font-bold py-1 px-3 rounded-lg shadow-sm transition"><i class="fa-solid fa-save"></i> บันทึก</button>
                            </div>
                        </div>
                    </div>
                    ${(() => {
                        if (!order.Status || order.Status === 'New' || order.Status === 'กำลังจัดหา') {
                            return `
                                <div class="mt-2.5">
                                    <button onclick="openItemsPhotoModal('${order.OrderID}')" class="w-full ${order.ItemsPhoto ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-300' : 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-300 border-dashed border-2'} border text-xs font-bold py-2.5 px-2 rounded-xl transition flex items-center justify-center gap-1.5 shadow-sm">
                                        <i class="fa-solid ${order.ItemsPhoto ? 'fa-circle-check text-emerald-600' : 'fa-camera text-amber-600'}"></i> 
                                        ${order.ItemsPhoto ? '✅ ถ่ายรูปของที่จัดเสร็จแล้ว (แตะดู/เปลี่ยน)' : '📸 ถ่ายรูปของที่จัดเสร็จ (เพื่อส่งยอด)'}
                                    </button>
                                </div>
                            `;
                        } else if (order.Status === 'รอชำระเงิน' || order.Status === 'รอตรวจสอบยอด') {
                            return `
                                <div class="mt-2.5">
                                    <button onclick="openItemsPhotoModal('${order.OrderID}')" class="w-full bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-bold py-2 px-2 rounded-xl transition flex items-center justify-center gap-1.5 shadow-sm">
                                        <i class="fa-solid fa-basket-shopping text-emerald-600"></i> 🛍️ ดูรูปสินค้าที่ส่งให้ลูกค้าตรวจ
                                    </button>
                                </div>
                            `;
                        } else if (order.Status === 'กำลังไปส่ง' || order.Status === 'กำลังจัดส่ง') {
                            return `
                                <div class="mt-2.5">
                                    <button onclick="openUploadModal('${order.OrderID}')" class="w-full ${order.DeliveryPhoto ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-300' : 'bg-blue-50 hover:bg-blue-100 text-blue-800 border-blue-300 border-dashed border-2'} border text-xs font-bold py-2.5 px-2 rounded-xl transition flex items-center justify-center gap-1.5 shadow-sm">
                                        <i class="fa-solid ${order.DeliveryPhoto ? 'fa-circle-check text-emerald-600' : 'fa-camera text-blue-600'}"></i> 
                                        ${order.DeliveryPhoto ? '✅ ถ่ายรูปตอนส่งแล้ว (แตะดู/เปลี่ยน)' : '📸 ถ่ายรูปตอนส่งของ (วางหน้าห้อง)'}
                                    </button>
                                </div>
                            `;
                        } else if (order.Status === 'Delivered') {
                            return `
                                <div class="mt-2.5 flex flex-wrap gap-2">
                                    ${order.ItemsPhoto ? `<button onclick="viewFullImage(processDriveUrl('${order.ItemsPhoto}'), '🛍️ รูปสินค้าที่จัดเสร็จ')" class="flex-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-xs font-bold py-1.5 px-2 rounded-xl transition flex items-center justify-center gap-1 shadow-sm"><i class="fa-solid fa-basket-shopping text-amber-600"></i> รูปที่จัด</button>` : ''}
                                    ${order.DeliveryPhoto ? `<button onclick="viewFullImage(processDriveUrl('${order.DeliveryPhoto}'), '🛵 รูปภาพยืนยันการส่งของ')" class="flex-1 bg-green-50 hover:bg-green-100 text-green-800 border border-green-200 text-xs font-bold py-1.5 px-2 rounded-xl transition flex items-center justify-center gap-1 shadow-sm"><i class="fa-solid fa-camera text-green-600"></i> รูปจัดส่งสำเร็จ</button>` : ''}
                                </div>
                            `;
                        }
                        return '';
                    })()}
                `;
            }
        } catch (e) {
            itemsHtml = order.Items;
        }

        let dateStr = order.Timestamp;
        try {
            const date = new Date(order.Timestamp);
            if (!isNaN(date.getTime())) {
                dateStr = date.toLocaleString('th-TH');
            }
        } catch (e) { }

        let locationHtml = '<span class="text-gray-400 text-xs"><i class="fa-solid fa-location-dot"></i> ไม่ได้ระบุพิกัด</span>';
        if (order.LocationLink) {
            locationHtml = `<a href="${order.LocationLink}" target="_blank" class="text-blue-600 hover:underline text-xs flex items-center gap-1 mt-1 font-semibold"><i class="fa-solid fa-map-location-dot"></i> ดูแผนที่ (GPS)</a>`;
        }

        // Helper to convert Drive URL
        const processDriveUrl = (url) => {
            if (!url) return '';
            let fileId = null;
            if (url.includes('/file/d/')) {
                fileId = url.split('/file/d/')[1].split('/')[0];
            } else if (url.includes('id=')) {
                fileId = url.split('id=')[1].split('&')[0];
            }
            return fileId ? `https://lh3.googleusercontent.com/d/${fileId}=w800` : url;
        };

        // 1. Current Status Badge
        let badgeColor = 'bg-amber-100 text-amber-800 border-amber-200';
        let badgeLabel = '🛒 กำลังจัดหา';

        if (order.Status === 'รอชำระเงิน') {
            badgeColor = 'bg-orange-100 text-orange-800 border-orange-200';
            badgeLabel = '⏳ รอชำระเงิน';
        } else if (order.Status === 'รอตรวจสอบยอด') {
            badgeColor = 'bg-purple-100 text-purple-800 border-purple-200';
            badgeLabel = '🧾 รอตรวจสอบยอด';
        } else if (order.Status === 'กำลังไปส่ง' || order.Status === 'กำลังจัดส่ง') {
            badgeColor = 'bg-blue-100 text-blue-800 border-blue-200';
            badgeLabel = '🛵 กำลังไปส่ง';
        } else if (order.Status === 'Delivered') {
            badgeColor = 'bg-green-100 text-green-800 border-green-200';
            badgeLabel = '✅ ส่งของสำเร็จ';
        } else if (order.Status === 'ยกเลิก/ของหมด') {
            badgeColor = 'bg-red-100 text-red-800 border-red-200';
            badgeLabel = '❌ ยกเลิก/ของหมด';
        }

        // 2. Primary Action Button for active orders
        let actionBtnHtml = '';
        let quickDropdownHtml = '';

        if (currentTab === 'active') {
            if (!order.Status || order.Status === 'New' || order.Status === 'กำลังจัดหา') {
                if (!order.ItemsPhoto) {
                    actionBtnHtml = `
                        <button onclick="openItemsPhotoModal('${order.OrderID}')" class="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold py-2.5 px-2 rounded-xl text-xs transition shadow flex items-center justify-center gap-1.5 mt-2">
                            <i class="fa-solid fa-camera"></i> จัดเสร็จแล้ว (ใส่รูปสินค้า)
                        </button>
                    `;
                } else {
                    actionBtnHtml = `
                        <button onclick="requestPaymentFor('${order.OrderID}')" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-2 rounded-xl text-xs transition shadow flex items-center justify-center gap-1.5 mt-2">
                            <i class="fa-solid fa-file-invoice-dollar"></i> เรียกเก็บเงิน
                        </button>
                    `;
                }
            } else if (order.Status === 'รอชำระเงิน') {
                actionBtnHtml = `
                    <button onclick="changeStatusDirect('${order.OrderID}', 'กำลังไปส่ง')" class="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-2.5 px-2 rounded-xl text-xs transition shadow flex items-center justify-center gap-1.5 mt-2">
                        <i class="fa-solid fa-motorcycle"></i> ไปส่งของเลย
                    </button>
                `;
            } else if (order.Status === 'รอตรวจสอบยอด') {
                actionBtnHtml = `
                    <button onclick="changeStatusDirect('${order.OrderID}', 'กำลังไปส่ง')" class="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-2.5 px-2 rounded-xl text-xs transition shadow flex items-center justify-center gap-1.5 mt-2 animate-pulse">
                        <i class="fa-solid fa-motorcycle"></i> ยอดถูกต้อง ไปส่ง
                    </button>
                `;
            } else if (order.Status === 'กำลังไปส่ง' || order.Status === 'กำลังจัดส่ง') {
                if (!order.DeliveryPhoto) {
                    actionBtnHtml = `
                        <button onclick="openUploadModal('${order.OrderID}')" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-2 rounded-xl text-xs transition shadow flex items-center justify-center gap-1.5 mt-2">
                            <i class="fa-solid fa-camera"></i> ถ่ายรูปส่งสำเร็จ
                        </button>
                    `;
                } else {
                    actionBtnHtml = `
                        <button onclick="changeStatusDirect('${order.OrderID}', 'Delivered')" class="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-2.5 px-2 rounded-xl text-xs transition shadow flex items-center justify-center gap-1.5 mt-2">
                            <i class="fa-solid fa-check"></i> ส่งสำเร็จแล้ว (จบงาน)
                        </button>
                    `;
                }
            }

            quickDropdownHtml = `
                <div class="mt-2">
                    <select onchange="changeStatusDirect('${order.OrderID}', this.value); this.selectedIndex=0;" class="w-full p-1.5 bg-white border border-gray-300 rounded-lg text-[11px] font-semibold text-gray-700 hover:border-green-500 focus:ring-1 focus:ring-green-500 outline-none cursor-pointer shadow-sm">
                        <option value="" disabled selected>⚙️ เปลี่ยนสถานะอื่น...</option>
                        <option value="กำลังจัดหา">🛒 กำลังจัดหา</option>
                        <option value="รอชำระเงิน">⏳ รอชำระเงิน</option>
                        <option value="รอตรวจสอบยอด">🧾 รอตรวจสอบยอด</option>
                        <option value="กำลังไปส่ง">🛵 กำลังไปส่ง</option>
                        <option value="Delivered">✅ ส่งของแล้ว</option>
                        <option value="ยกเลิก/ของหมด">❌ ยกเลิกออเดอร์</option>
                    </select>
                </div>
            `;
        }

        let statusHtml = `
            <div class="space-y-1">
                <span class="inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold border shadow-sm w-full ${badgeColor}">
                    ${badgeLabel}
                </span>
                ${actionBtnHtml}
                ${quickDropdownHtml}
            </div>
        `;
        
        statusHtml += `<div class="text-center space-y-2 mt-3 border-t border-gray-100 pt-2">`;
        
        // Show tip badge if customer left a tip
        if (order.Tip && parseFloat(order.Tip) > 0) {
            statusHtml += `
                <div class="bg-pink-50 border border-pink-200 rounded-lg px-3 py-1.5 text-xs font-bold text-pink-700 flex items-center justify-center gap-1">
                    <i class="fa-solid fa-heart"></i> ทิป: ${order.Tip} ฿
                </div>
            `;
        }
        if (order.ItemsPhoto) {
            const thumbUrl = processDriveUrl(order.ItemsPhoto);
            statusHtml += `
                <div class="mb-2">
                    <span class="block text-[10px] text-amber-700 font-bold mb-1"><i class="fa-solid fa-basket-shopping text-amber-500"></i> รูปของที่จัดเสร็จ</span>
                    <div onclick="viewFullImage('${thumbUrl}', '🛍️ รูปของที่จัดเสร็จ (ออเดอร์: ${order.OrderID})')" class="block border-2 border-amber-200 rounded-lg overflow-hidden hover:border-amber-400 transition hover:shadow-md cursor-pointer relative group">
                        <img src="${thumbUrl}" loading="lazy" class="w-full h-24 object-contain bg-amber-50/20" alt="Items Photo">
                        <div class="absolute inset-0 bg-black/10 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                            <span class="bg-black/75 text-white text-[10px] font-bold py-1 px-2 rounded-full"><i class="fa-solid fa-expand"></i> ดูรูปใหญ่</span>
                        </div>
                    </div>
                </div>
            `;
        }
        if (order.Slip) {
            const thumbUrl = processDriveUrl(order.Slip);
            statusHtml += `
                <div class="mb-2">
                    <span class="block text-[10px] text-purple-700 font-bold mb-1"><i class="fa-solid fa-receipt text-purple-500"></i> สลิปโอนเงินลูกค้า</span>
                    <div onclick="viewFullImage('${thumbUrl}', '🧾 สลิปโอนเงินลูกค้า (ออเดอร์: ${order.OrderID})')" class="block border-2 border-purple-200 rounded-lg overflow-hidden hover:border-purple-400 transition hover:shadow-md cursor-pointer relative group">
                        <img src="${thumbUrl}" loading="lazy" class="w-full h-24 object-contain bg-purple-50/20" alt="Slip">
                        <div class="absolute inset-0 bg-black/10 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                            <span class="bg-black/75 text-white text-[10px] font-bold py-1 px-2 rounded-full"><i class="fa-solid fa-expand"></i> ดูรูปใหญ่</span>
                        </div>
                    </div>
                </div>
            `;
        }
        if (order.DeliveryPhoto) {
            const thumbUrl = processDriveUrl(order.DeliveryPhoto);
            statusHtml += `
                <div class="mb-2">
                    <span class="block text-[10px] text-emerald-700 font-bold mb-1"><i class="fa-solid fa-image text-emerald-500"></i> รูปตอนส่งของ</span>
                    <div onclick="viewFullImage('${thumbUrl}', '🛵 รูปตอนส่งของ (ออเดอร์: ${order.OrderID})')" class="block border-2 border-emerald-200 rounded-lg overflow-hidden hover:border-emerald-400 transition hover:shadow-md cursor-pointer relative group">
                        <img src="${thumbUrl}" loading="lazy" class="w-full h-20 object-contain bg-emerald-50/20" alt="Delivery Photo">
                        <div class="absolute inset-0 bg-black/10 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                            <span class="bg-black/75 text-white text-[10px] font-bold py-1 px-2 rounded-full"><i class="fa-solid fa-expand"></i> ดูรูปใหญ่</span>
                        </div>
                    </div>
                </div>
            `;
        }
        statusHtml += `</div>`;

        const tr = document.createElement('tr');
        tr.className = 'hover:bg-gray-50 transition border-b border-gray-100';
        tr.innerHTML = `
            <td class="py-4 px-4 text-sm align-top">
                <div class="font-bold text-gray-800">${order.OrderID || '-'}</div>
                <div class="text-xs text-gray-500 mt-1"><i class="fa-regular fa-clock"></i> ${dateStr}</div>
            </td>
            <td class="py-4 px-4 text-sm align-top">
                <div class="font-bold text-gray-900">${order.CustomerName}</div>
                <a href="tel:${order.Phone}" class="text-green-600 hover:underline text-xs mt-1 block font-semibold"><i class="fa-solid fa-phone"></i> ${order.Phone}</a>
            </td>
            <td class="py-4 px-4 text-sm align-top">
                <div class="font-bold text-gray-800 mb-1">${order.DormName || '-'}</div>
                ${locationHtml}
            </td>
            <td class="py-4 px-4 align-top">${itemsHtml}</td>
            <td class="py-4 px-4 align-top w-48 min-w-[190px]">
                ${statusHtml}
            </td>
        `;
        ordersTableBody.appendChild(tr);
    });
}

function toggleChecklist(checkbox) {
    const label = checkbox.closest('label') || checkbox.parentElement;
    const itemDiv = label.closest('div.flex') || label.parentElement;
    const itemNameSpan = itemDiv.querySelector('.item-name');
    if (itemNameSpan) {
        if (checkbox.checked) {
            itemNameSpan.classList.add('checklist-done');
        } else {
            itemNameSpan.classList.remove('checklist-done');
        }
    }
    // Save to localStorage so it persists across refresh
    try {
        localStorage.setItem('chk_' + checkbox.id, checkbox.checked ? '1' : '0');
    } catch(e) {}
}

// Restore checkbox states after render
function restoreChecklistStates() {
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('chk_')) {
                const el = document.getElementById(key.substring(4));
                if (el && localStorage.getItem(key) === '1') {
                    el.checked = true;
                    const itemDiv = el.closest('label')?.closest('div.flex') || el.parentElement?.parentElement;
                    const span = itemDiv?.querySelector('.item-name');
                    if (span) span.classList.add('checklist-done');
                }
            }
        }
    } catch(e) {}
}

function showError(message) {
    loading.classList.add('hidden');
    errorMsg.classList.remove('hidden');
    errorText.textContent = message;
}

// Upload Modal Logic
function openUploadModal(orderId) {
    currentOrderId.value = orderId;
    const order = allOrders.find(o => o.OrderID === orderId);
    if (order && order.DeliveryPhoto) {
        deliveryPreview.src = processDriveUrl(order.DeliveryPhoto);
        deliveryPreviewContainer.classList.remove('hidden');
        deliveryBase64 = null;
    } else {
        removeDeliveryImage();
    }
    uploadModal.classList.remove('hidden');
}

function closeUploadModal() {
    uploadModal.classList.add('hidden');
    uploadForm.reset();
    removeDeliveryImage();
}

deliveryImageInput.addEventListener('change', function (e) {
    const file = e.target.files[0];
    if (file) {
        if (file.size > 2 * 1024 * 1024) {
            alert('กรุณาอัปโหลดรูปภาพขนาดไม่เกิน 2MB');
            this.value = '';
            removeDeliveryImage();
            return;
        }

        const reader = new FileReader();
        reader.onload = function (event) {
            deliveryBase64 = event.target.result;
            deliveryPreview.src = deliveryBase64;
            deliveryPreviewContainer.classList.remove('hidden');
        };
        reader.readAsDataURL(file);
    } else {
        removeDeliveryImage();
    }
});

function removeDeliveryImage(e) {
    if (e) e.stopPropagation();
    deliveryImageInput.value = '';
    deliveryPreviewContainer.classList.add('hidden');
    deliveryBase64 = null;
}

function toggleChecklist(checkbox) {
    const itemName = checkbox.closest('.flex-1').querySelector('.item-name');
    const container = checkbox.closest('.bg-gray-50');
    if (checkbox.checked) {
        itemName.classList.add('text-green-600');
        if (container) container.classList.add('bg-green-50');
    } else {
        itemName.classList.remove('text-green-600');
        if (container) container.classList.remove('bg-green-50');
    }
}

function toggleOOS(orderId, idx, checkbox) {
    const priceDiv = document.getElementById(`price_div_${orderId}_${idx}`);
    const priceInput = document.getElementById(`chk_${orderId}_${idx}`).closest('.flex').querySelector(`.item-price-${orderId}`);
    const itemName = checkbox.closest('.flex').querySelector('.item-name');
    
    if (checkbox.checked) {
        priceDiv.classList.add('hidden');
        priceDiv.classList.remove('flex');
        priceInput.value = ''; // clear price
        itemName.classList.add('line-through', 'text-red-400');
        itemName.classList.remove('text-gray-800');
    } else {
        priceDiv.classList.remove('hidden');
        priceDiv.classList.add('flex');
        itemName.classList.remove('line-through', 'text-red-400');
        itemName.classList.add('text-gray-800');
    }
    calcTotal(orderId);
}

uploadForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const orderId = currentOrderId.value;
    const originalBtnText = confirmDeliveryBtn.innerHTML;
    confirmDeliveryBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> กำลังบันทึก...';
    confirmDeliveryBtn.disabled = true;

    // 1. INSTANT UI UPDATE
    const order = allOrders.find(o => o.OrderID === orderId);
    if (order) {
        order.Status = 'Delivered';
        if (deliveryBase64) {
            order.DeliveryPhoto = deliveryBase64;
            try { localStorage.setItem('localDeliveryPhoto_' + orderId, deliveryBase64); } catch(e) {}
        }
    }
    closeUploadModal();
    renderOrders();
    showAlert('สำเร็จ', 'บันทึกสถานะส่งของเรียบร้อยแล้ว', 'fa-check', 'text-green-600', 'bg-green-100');

    try {
        localStorage.setItem('adminCachedOrders', JSON.stringify(allOrders));
    } catch(e) {}

    // 2. Persist in background
    try {
        const payload = {
            action: 'updateStatus',
            orderId: orderId,
            status: 'Delivered'
        };
        if (deliveryBase64) payload.deliveryPhotoBase64 = deliveryBase64;

        const res = await robustPost(payload);
        if (res && res.deliveryPhotoUrl && order) {
            order.DeliveryPhoto = res.deliveryPhotoUrl;
            try {
                localStorage.removeItem('localDeliveryPhoto_' + orderId);
                localStorage.setItem('adminCachedOrders', JSON.stringify(allOrders));
            } catch(e) {}
            renderOrders();
        }
    } catch (error) {
        console.error('Error:', error);
    } finally {
        confirmDeliveryBtn.innerHTML = originalBtnText;
        confirmDeliveryBtn.disabled = false;
    }
});

// --- Items Photo Modal Logic (รูปของที่จัดเสร็จ) ---
function openItemsPhotoModal(orderId) {
    const hiddenInput = document.getElementById('itemsPhotoOrderId');
    if (hiddenInput) hiddenInput.value = orderId;

    const order = allOrders.find(o => o.OrderID === orderId);
    if (order && order.ItemsPhoto) {
        document.getElementById('itemsPreview').src = processDriveUrl(order.ItemsPhoto);
        document.getElementById('itemsPreviewContainer').classList.remove('hidden');
        window.itemsPhotoBase64Data = null;
    } else {
        removeItemsImage();
    }
    document.getElementById('itemsPhotoModal').classList.remove('hidden');
}

function closeItemsPhotoModal() {
    document.getElementById('itemsPhotoModal').classList.add('hidden');
    removeItemsImage();
}

document.getElementById('itemsImage').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
        if (file.size > 2 * 1024 * 1024) {
            alert('ขนาดไฟล์ต้องไม่เกิน 2MB');
            this.value = '';
            removeItemsImage();
            return;
        }
        const reader = new FileReader();
        reader.onload = function(e) {
            document.getElementById('itemsPreview').src = e.target.result;
            document.getElementById('itemsPreviewContainer').classList.remove('hidden');
            window.itemsPhotoBase64Data = e.target.result;
        };
        reader.readAsDataURL(file);
    } else {
        removeItemsImage();
    }
});

function removeItemsImage(e) {
    if (e) e.stopPropagation();
    const input = document.getElementById('itemsImage');
    if (input) input.value = '';
    const container = document.getElementById('itemsPreviewContainer');
    if (container) container.classList.add('hidden');
    const preview = document.getElementById('itemsPreview');
    if (preview) preview.src = '';
    window.itemsPhotoBase64Data = null;
}

document.getElementById('itemsPhotoForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const orderId = document.getElementById('itemsPhotoOrderId').value;
    if (!orderId) {
        closeItemsPhotoModal();
        return;
    }

    const order = allOrders.find(o => o.OrderID === orderId);

    // Require photo if not already uploaded
    if (!window.itemsPhotoBase64Data && (!order || !order.ItemsPhoto)) {
        showAlert('แจ้งเตือน', 'กรุณาถ่ายรูปหรือเลือกรูปภาพก่อนบันทึกครับ', 'fa-image', 'text-yellow-600', 'bg-yellow-100');
        return;
    }
    
    const confirmBtn = document.getElementById('confirmItemsBtn');
    const originalText = confirmBtn.innerHTML;
    confirmBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> กำลังบันทึก...';
    confirmBtn.disabled = true;

    // 1. Gather prices and calculate total
    const feeInput = document.getElementById(`fee_${orderId}`);
    const fee = feeInput ? (parseFloat(feeInput.value) || 20) : (order && order.DeliveryFee ? parseFloat(order.DeliveryFee) : 20);

    let sum = 0;
    const items = (window.orderItemsCache && window.orderItemsCache[orderId]) ? window.orderItemsCache[orderId] : [];
    const priceInputs = document.querySelectorAll(`.item-price-${orderId}`);
    priceInputs.forEach((input, index) => {
        if (items[index]) {
            items[index].price = input.value || '';
            const oosCheckbox = document.getElementById(`oos_${orderId}_${index}`);
            if (oosCheckbox) items[index].outOfStock = oosCheckbox.checked;
            if (input.value && (!oosCheckbox || !oosCheckbox.checked)) {
                sum += parseFloat(input.value) || 0;
            }
        }
    });

    const totalPrice = (sum + fee).toFixed(2);
    const totalSpan = document.getElementById(`total_${orderId}`);
    if (totalSpan) totalSpan.textContent = totalPrice;

    // 2. INSTANT UI UPDATE
    if (order) {
        if (window.itemsPhotoBase64Data) {
            order.ItemsPhoto = window.itemsPhotoBase64Data;
            try { localStorage.setItem('localItemsPhoto_' + orderId, window.itemsPhotoBase64Data); } catch(e) {}
        }
        // Automatically advance to รอชำระเงิน as requested
        if (!order.Status || order.Status === 'New' || order.Status === 'กำลังจัดหา' || order.Status === 'รอชำระเงิน') {
            order.Status = 'รอชำระเงิน';
        }
        if (items.length > 0) order.Items = JSON.stringify(items);
        
        order.TotalPrice = totalPrice;
        order.DeliveryFee = fee;
    }

    try {
        localStorage.setItem('adminCachedOrders', JSON.stringify(allOrders));
    } catch(err) {}

    closeItemsPhotoModal();
    renderOrders();
    showAlert('สำเร็จ', 'อัปโหลดรูปเสร็จแล้ว! เปลี่ยนสถานะเป็น "รอชำระเงิน" เรียบร้อย', 'fa-check', 'text-green-600', 'bg-green-100');

    // 3. Persist to backend in background
    try {
        const payload = {
            action: 'updateStatus',
            orderId: orderId,
            status: order ? order.Status : 'รอชำระเงิน',
            deliveryFee: fee
        };
        if (window.itemsPhotoBase64Data) {
            payload.itemsPhotoBase64 = window.itemsPhotoBase64Data;
        }
        if (items.length > 0) {
            payload.itemsWithPrices = JSON.stringify(items);
        }
        payload.totalPrice = totalPrice;

        const res = await robustPost(payload);
        if (res && res.itemsPhotoUrl && order) {
            order.ItemsPhoto = res.itemsPhotoUrl;
            try {
                localStorage.removeItem('localItemsPhoto_' + orderId);
                localStorage.setItem('adminCachedOrders', JSON.stringify(allOrders));
            } catch(e) {}
            renderOrders();
        }
    } catch (error) {
        console.error('Error uploading items photo and setting รอชำระเงิน:', error);
    } finally {
        confirmBtn.innerHTML = originalText;
        confirmBtn.disabled = false;
    }
});

function showAlert(title, message, iconClass, iconColorClass, iconBgClass) {
    alertTitle.textContent = title;
    alertMessage.textContent = message;
    alertIcon.className = `fa-solid ${iconClass} ${iconColorClass} text-2xl`;
    alertIconContainer.className = `mx-auto flex items-center justify-center h-16 w-16 rounded-full mb-4 ${iconBgClass}`;
    alertModal.classList.remove('hidden');
}

function closeAlert() {
    alertModal.classList.add('hidden');
}

let currentEditItems = [];
let currentEditOrderId = null;

function openEditOrderModal(orderId) {
    const items = window.orderItemsCache[orderId];
    if (!items) return;
    
    // Capture existing inputs so we don't lose them on re-render
    const priceInputs = document.querySelectorAll(`.item-price-${orderId}`);
    for(let i=0; i<priceInputs.length; i++) {
        if (items[i]) {
            items[i].price = priceInputs[i].value || '';
            const oosCheckbox = document.getElementById(`oos_${orderId}_${i}`);
            if (oosCheckbox) items[i].outOfStock = oosCheckbox.checked;
        }
    }
    
    currentEditOrderId = orderId;
    currentEditItems = JSON.parse(JSON.stringify(items)); // deep copy
    
    document.getElementById('editOrderIdLabel').textContent = orderId;
    renderEditItems();
    
    document.getElementById('editOrderModal').classList.remove('hidden');
}

function closeEditOrderModal() {
    document.getElementById('editOrderModal').classList.add('hidden');
    currentEditItems = [];
    currentEditOrderId = null;
}

function renderEditItems() {
    const container = document.getElementById('editItemsContainer');
    container.innerHTML = '';
    
    if (currentEditItems.length === 0) {
        container.innerHTML = '<p class="text-center text-sm text-gray-500 py-4">ไม่มีรายการสินค้า</p>';
        return;
    }
    
    currentEditItems.forEach((item, idx) => {
        container.innerHTML += `
        <div class="flex items-center gap-2 mb-2 bg-white p-2 rounded-lg border border-gray-200">
            <div class="flex-1">
                <input type="text" class="w-full text-sm p-2 border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500 outline-none" value="${item.Name}" oninput="updateEditItemName(${idx}, this.value)" placeholder="ชื่อสินค้า">
            </div>
            <div class="w-20">
                <input type="number" class="w-full text-sm p-2 border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500 outline-none" value="${item.quantity || 1}" oninput="updateEditItemQuantity(${idx}, this.value)" placeholder="จำนวน" min="1">
            </div>
            <button onclick="removeEditItem(${idx})" class="w-8 h-8 flex items-center justify-center bg-red-50 text-red-500 rounded hover:bg-red-100 transition border border-red-100"><i class="fa-solid fa-trash text-xs"></i></button>
        </div>
        `;
    });
}

function updateEditItemName(idx, val) {
    if (currentEditItems[idx]) currentEditItems[idx].Name = val;
}

function updateEditItemQuantity(idx, val) {
    if (currentEditItems[idx]) currentEditItems[idx].quantity = val;
}

function removeEditItem(idx) {
    currentEditItems.splice(idx, 1);
    renderEditItems();
}

function addNewEditItem() {
    currentEditItems.push({
        Name: "",
        quantity: 1,
        unit: "ชิ้น",
        price: "",
        outOfStock: false
    });
    renderEditItems();
}

// Cancel order completely
async function cancelEntireOrder(orderId = null) {
    const targetOrderId = orderId || currentEditOrderId;
    if (!targetOrderId) return;
    
    if (currentEditOrderId) closeEditOrderModal();
    
    // 1. INSTANT UI UPDATE: change status in memory immediately
    const order = allOrders.find(o => o.OrderID === targetOrderId);
    if (order) {
        order.Status = 'ยกเลิก/ของหมด';
    }
    
    // 2. Instantly re-render (it disappears from "รอดำเนินการ" immediately!)
    renderOrders();
    showAlert('ยกเลิกออเดอร์แล้ว', `ออเดอร์ ${targetOrderId} ถูกยกเลิกเรียบร้อยแล้ว`, 'fa-check', 'text-green-600', 'bg-green-100');
    
    // 3. Save to localStorage
    try {
        localStorage.setItem('adminCachedOrders', JSON.stringify(allOrders));
    } catch(e) {}
    
    // 4. Save to backend in background
    const payload = {
        action: 'updateStatus',
        orderId: targetOrderId,
        status: 'ยกเลิก/ของหมด'
    };
    
    try {
        await robustPost(payload);
    } catch(e) {
        console.error('Failed to sync cancellation:', e);
    }
}

async function saveEditedOrder() {
    if (!currentEditOrderId) return;
    
    // ถ้าลบออเดอร์ออกหมด → ยกเลิกออเดอร์อัตโนมัติ
    if (currentEditItems.length === 0) {
        await cancelEntireOrder(currentEditOrderId);
        return;
    }
    
    for (let i = 0; i < currentEditItems.length; i++) {
        if (!currentEditItems[i].Name.trim()) {
            alert('กรุณากรอกชื่อสินค้าให้ครบถ้วน หรือลบรายการที่ว่างออก');
            return;
        }
    }
    
    const order = allOrders.find(o => o.OrderID === currentEditOrderId);
    if (!order) return;
    
    const feeInput = document.getElementById(`fee_${currentEditOrderId}`);
    let currentFee = feeInput ? parseFloat(feeInput.value) || 20 : 20;
    
    // Build payload with updated items (preserve price/outOfStock from current display)
    const priceInputs = document.querySelectorAll(`.item-price-${currentEditOrderId}`);
    currentEditItems.forEach((item, i) => {
        if (priceInputs[i]) item.price = priceInputs[i].value || item.price || '';
        const oosEl = document.getElementById(`oos_${currentEditOrderId}_${i}`);
        if (oosEl) item.outOfStock = oosEl.checked;
    });
    
    const saveBtn = document.getElementById('saveEditedOrderBtn');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> กำลังบันทึก...'; }
    
    // 1. INSTANT UI UPDATE
    order.Items = JSON.stringify(currentEditItems);
    order.DeliveryFee = currentFee;
    closeEditOrderModal();
    renderOrders();
    showAlert('บันทึกสำเร็จ', 'แก้ไขรายการออเดอร์เรียบร้อยแล้ว', 'fa-check', 'text-green-600', 'bg-green-100');
    
    // 2. Save to localStorage
    try {
        localStorage.setItem('adminCachedOrders', JSON.stringify(allOrders));
    } catch(e) {}
    
    // 3. Persist to backend
    const payload = {
        action: 'updateStatus',
        orderId: currentEditOrderId,
        itemsWithPrices: JSON.stringify(currentEditItems),
        deliveryFee: currentFee
    };
    
    try {
        await robustPost(payload);
    } catch(e) {
        console.error('Failed to sync edit:', e);
    } finally {
        if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '<i class="fa-solid fa-save mr-1"></i> บันทึกการแก้ไข'; }
    }
}

// Calculate total dynamically
function calcTotal(orderId) {
    const priceInputs = document.querySelectorAll(`.item-price-${orderId}`);
    let sum = 0;
    priceInputs.forEach(input => {
        if (input.value) sum += parseFloat(input.value) || 0;
    });
    
    const feeInput = document.getElementById(`fee_${orderId}`);
    const fee = feeInput && feeInput.value ? parseFloat(feeInput.value) || 0 : 0;
    
    const totalSpan = document.getElementById(`total_${orderId}`);
    if (totalSpan) {
        totalSpan.textContent = (sum + fee).toFixed(2);
    }
}

async function savePrices(orderId, newStatus = null, selectElement = null) {
    const btn = document.getElementById(`saveBtn_${orderId}`);
    if (btn) {
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
        btn.disabled = true;
        // store original text so we can revert
        btn.dataset.originalText = originalText;
    }
    
    if (selectElement) {
        selectElement.disabled = true;
    }
    
    const totalSpan = document.getElementById(`total_${orderId}`);
    const feeInput = document.getElementById(`fee_${orderId}`);
    const totalPrice = totalSpan ? parseFloat(totalSpan.textContent) : 0;
    const deliveryFee = feeInput ? parseFloat(feeInput.value) : 20;
    
    let itemsStr = '';
    if (window.orderItemsCache && window.orderItemsCache[orderId]) {
        const items = window.orderItemsCache[orderId];
        const priceInputs = document.querySelectorAll(`.item-price-${orderId}`);
        for(let i=0; i<priceInputs.length; i++) {
            const oosCheckbox = document.getElementById(`oos_${orderId}_${i}`);
            if (items[i]) {
                if (oosCheckbox && oosCheckbox.checked) {
                    items[i].outOfStock = true;
                    items[i].price = 0;
                } else {
                    items[i].outOfStock = false;
                    items[i].price = parseFloat(priceInputs[i].value) || 0;
                }
            }
        }
        itemsStr = JSON.stringify(items);
    }
    
    let payload = {
        action: 'updateStatus',
        orderId: orderId,
        status: newStatus,
        totalPrice: totalPrice,
        deliveryFee: deliveryFee,
        itemsWithPrices: itemsStr
    };
    
    if (window.currentEta) {
        payload.eta = window.currentEta;
        window.currentEta = null; // reset
    }
    
    if (!newStatus) {
        newStatus = 'รอชำระเงิน';
        payload.status = newStatus;
    }

    await doSavePrices(payload, btn, selectElement);
}

async function doSavePrices(payload, btn, selectElement) {
    // 1. INSTANT UI UPDATE
    const order = allOrders.find(o => o.OrderID === payload.orderId);
    if (order) {
        if (payload.status) order.Status = payload.status;
        if (payload.itemsWithPrices) order.Items = payload.itemsWithPrices;
        if (payload.totalPrice !== undefined) order.TotalPrice = payload.totalPrice;
        if (payload.deliveryFee !== undefined) order.DeliveryFee = payload.deliveryFee;
        
        try {
            localStorage.setItem('adminCachedOrders', JSON.stringify(allOrders));
        } catch(e) {}

        if (payload.status === 'Delivered' || payload.status === 'ยกเลิก/ของหมด') {
            renderOrders();
        }
    }

    if (selectElement) {
        selectElement.dataset.originalStatus = payload.status;
        selectElement.disabled = false;
        selectElement.style.backgroundColor = '#d1fae5';
        setTimeout(() => { selectElement.style.backgroundColor = ''; }, 1000);
    }
    
    if (btn) {
        btn.innerHTML = '<i class="fa-solid fa-check"></i>';
        btn.classList.replace('bg-blue-500', 'bg-green-500');
        setTimeout(() => {
            btn.innerHTML = btn.dataset.originalText;
            btn.classList.replace('bg-green-500', 'bg-blue-500');
            btn.disabled = false;
        }, 1500);
    }

    // 2. Persist to backend
    try {
        await robustPost(payload);
    } catch (e) {
        console.error('Save error:', e);
    }
}

// Request payment (calculate total, update status to รอชำระเงิน)
async function requestPaymentFor(orderId) {
    const order = allOrders.find(o => o.OrderID === orderId);
    // ถ้ายังไม่ได้ใส่รูปของที่จัดเสร็จ ให้เปิดหน้าต่างถ่ายรูปทันที
    if (order && !order.ItemsPhoto && !localStorage.getItem('localItemsPhoto_' + orderId)) {
        openItemsPhotoModal(orderId);
        return;
    }

    const feeInput = document.getElementById(`fee_${orderId}`);
    const fee = feeInput ? (parseFloat(feeInput.value) || 20) : 20;
    
    // Gather prices
    let sum = 0;
    const items = (window.orderItemsCache && window.orderItemsCache[orderId]) ? window.orderItemsCache[orderId] : [];
    const priceInputs = document.querySelectorAll(`.item-price-${orderId}`);
    priceInputs.forEach((input, index) => {
        if (items[index]) {
            items[index].price = input.value || '';
            const oosCheckbox = document.getElementById(`oos_${orderId}_${index}`);
            if (oosCheckbox) items[index].outOfStock = oosCheckbox.checked;
            if (input.value && (!oosCheckbox || !oosCheckbox.checked)) {
                sum += parseFloat(input.value) || 0;
            }
        }
    });

    const totalPrice = (sum + fee).toFixed(2);
    const totalSpan = document.getElementById(`total_${orderId}`);
    if (totalSpan) totalSpan.textContent = totalPrice;

    // Direct update to รอชำระเงิน
    await changeStatusDirect(orderId, 'รอชำระเงิน', {
        itemsWithPrices: JSON.stringify(items),
        totalPrice: totalPrice,
        deliveryFee: fee
    });
}

// Direct Status Change (Fast, robust, intuitive, no blocking)
async function changeStatusDirect(orderId, newStatus, extraPayload = {}) {
    if (!orderId || !newStatus) return;
    const order = allOrders.find(o => o.OrderID === orderId);
    if (!order) return;

    // ถ้ากดเปลี่ยนเป็น Delivered แล้วยังไม่ได้ถ่ายรูปส่งของ ให้เปิดหน้าต่างถ่ายรูปส่งของก่อน
    if (newStatus === 'Delivered' && (!order.DeliveryPhoto && !localStorage.getItem('localDeliveryPhoto_' + orderId))) {
        openUploadModal(orderId);
        return;
    }

    let eta = null;

    // 1. INSTANT UI UPDATE
    order.Status = newStatus;
    if (extraPayload.itemsWithPrices) order.Items = extraPayload.itemsWithPrices;
    if (extraPayload.totalPrice !== undefined) order.TotalPrice = extraPayload.totalPrice;
    if (extraPayload.deliveryFee !== undefined) order.DeliveryFee = extraPayload.deliveryFee;
    if (eta) order.ETA = eta;

    // Render immediately! If delivered or canceled, it moves to history tab right away!
    renderOrders();

    const statusNames = {
        'กำลังจัดหา': '🛒 กำลังจัดหา',
        'รอชำระเงิน': '⏳ รอชำระเงิน (แจ้งยอดแล้ว)',
        'รอตรวจสอบยอด': '🧾 รอตรวจสอบยอด',
        'กำลังไปส่ง': '🛵 กำลังไปส่ง',
        'Delivered': '✅ ส่งของสำเร็จแล้ว',
        'ยกเลิก/ของหมด': '❌ ยกเลิกออเดอร์แล้ว'
    };
    showAlert('อัปเดตสถานะแล้ว', `ออเดอร์ ${orderId} เปลี่ยนเป็น: ${statusNames[newStatus] || newStatus}`, 'fa-check', 'text-green-600', 'bg-green-100');

    // 2. Save to localStorage
    try {
        localStorage.setItem('adminCachedOrders', JSON.stringify(allOrders));
    } catch(e) {}

    // 3. Persist to backend
    const payload = {
        action: 'updateStatus',
        orderId: orderId,
        status: newStatus,
        ...extraPayload
    };
    if (eta) payload.eta = eta;

    try {
        await robustPost(payload);
    } catch(e) {
        console.error('Failed to sync status update:', e);
    }
}

// Payment Request Modal Logic
let paymentOrderId = null;
const paymentModal = document.createElement('div');
paymentModal.id = 'paymentModal';
paymentModal.className = 'fixed inset-0 bg-black bg-opacity-60 hidden flex items-center justify-center z-50 backdrop-blur-sm';
paymentModal.innerHTML = `
    <div class="bg-white p-6 rounded-2xl shadow-2xl max-w-md w-full mx-4 relative max-h-[90vh] overflow-y-auto">
        <button onclick="closePaymentModal()" class="absolute top-4 right-4 text-gray-400 hover:text-gray-600"><i class="fa-solid fa-xmark text-xl"></i></button>
        <h3 class="text-xl font-bold text-gray-900 mb-2"><i class="fa-solid fa-qrcode text-green-500 mr-2"></i>เรียกเก็บเงิน</h3>
        <p class="text-gray-500 text-sm mb-4">แนบรูป QR Code เพื่อให้ลูกค้าโอนเงิน</p>
        
        <form id="paymentForm" class="space-y-4">
            <div class="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center hover:bg-gray-50 transition cursor-pointer" onclick="document.getElementById('qrCodeInput').click()">
                <i class="fa-solid fa-cloud-arrow-up text-3xl text-gray-400 mb-2"></i>
                <p class="text-sm text-gray-500">อัปโหลดรูป QR Code หรือ PromptPay</p>
                <input type="file" id="qrCodeInput" accept="image/*" class="hidden">
            </div>
            <div id="qrPreview" class="hidden mt-3 relative text-center">
                <img id="qrPreviewImg" src="" class="max-h-48 mx-auto rounded-lg border border-gray-200">
                <button type="button" onclick="removeQrCode(event)" class="absolute top-0 right-1/4 transform translate-x-4 -translate-y-2 bg-red-500 text-white w-8 h-8 rounded-full shadow hover:bg-red-600"><i class="fa-solid fa-times"></i></button>
            </div>
            
            <button type="submit" id="confirmPaymentBtn" class="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-4 rounded-xl transition mt-4 disabled:bg-gray-400">
                ส่งยอดให้ลูกค้าโอน
            </button>
        </form>
    </div>
`;
document.body.appendChild(paymentModal);

function openPaymentRequestModal(orderId) {
    paymentOrderId = orderId;
    document.getElementById('qrCodeInput').value = '';
    document.getElementById('qrPreview').classList.add('hidden');
    document.getElementById('qrPreviewImg').src = '';
    paymentModal.classList.remove('hidden');
}

function closePaymentModal() {
    paymentModal.classList.add('hidden');
    paymentOrderId = null;
}

document.getElementById('qrCodeInput').addEventListener('change', function(e) {
    if (e.target.files && e.target.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) {
            document.getElementById('qrPreviewImg').src = e.target.result;
            document.getElementById('qrPreview').classList.remove('hidden');
        }
        reader.readAsDataURL(e.target.files[0]);
    }
});

function removeQrCode(e) {
    e.stopPropagation();
    document.getElementById('qrCodeInput').value = '';
    document.getElementById('qrPreview').classList.add('hidden');
    document.getElementById('qrPreviewImg').src = '';
}

document.getElementById('paymentForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const file = document.getElementById('qrCodeInput').files[0];
    if (!file) {
        alert('กรุณาอัปโหลดรูป QR Code');
        return;
    }
    
    const btn = document.getElementById('confirmPaymentBtn');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังอัปโหลด...';
    btn.disabled = true;
    
    const totalSpan = document.getElementById(`total_${paymentOrderId}`);
    const feeInput = document.getElementById(`fee_${paymentOrderId}`);
    const totalPrice = totalSpan ? parseFloat(totalSpan.textContent) : 0;
    const deliveryFee = feeInput ? parseFloat(feeInput.value) : 20;
    
    let itemsStr = '';
    if (window.orderItemsCache && window.orderItemsCache[paymentOrderId]) {
        const items = window.orderItemsCache[paymentOrderId];
        const priceInputs = document.querySelectorAll(`.item-price-${paymentOrderId}`);
        for(let i=0; i<priceInputs.length; i++) {
            if(items[i]) items[i].price = parseFloat(priceInputs[i].value) || 0;
        }
        itemsStr = JSON.stringify(items);
    }
    
    const reader = new FileReader();
    reader.onload = async function(ev) {
        try {
            const payload = {
                action: 'updateStatus',
                orderId: paymentOrderId,
                status: 'รอชำระเงิน',
                totalPrice: totalPrice,
                deliveryFee: deliveryFee,
                itemsWithPrices: itemsStr,
                qrCodeBase64: ev.target.result
            };
            
            await fetch(SCRIPT_URL, {
                method: 'POST',
                body: JSON.stringify(payload)
            });
            
            closePaymentModal();
            showAlert('ส่งยอดสำเร็จ', 'ระบบได้แจ้งยอดให้ลูกค้าทราบแล้ว', 'fa-check', 'text-green-600', 'bg-green-100');
            fetchOrders();
        } catch (error) {
            closePaymentModal();
            fetchOrders();
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    };
    reader.readAsDataURL(file);
});

// Fullscreen Lightbox Image Viewer
function viewFullImage(imgUrl, title = 'รูปภาพ') {
    if (!imgUrl) return;
    const modal = document.getElementById('imageViewerModal');
    const img = document.getElementById('imageViewerImg');
    const titleEl = document.getElementById('imageViewerTitle');
    if (modal && img) {
        img.src = imgUrl;
        if (titleEl) titleEl.textContent = title;
        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    }
}

function closeImageViewer() {
    const modal = document.getElementById('imageViewerModal');
    if (modal) {
        modal.classList.add('hidden');
        const img = document.getElementById('imageViewerImg');
        if (img) img.src = '';
        document.body.style.overflow = '';
    }
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeImageViewer();
});


async function deleteOrder(orderId) {
    if (!confirm('ยืนยันที่จะลบออเดอร์ ' + orderId + ' ใช่หรือไม่? (ลบแล้วกู้คืนไม่ได้)')) return;
    
    // 1. INSTANT UI UPDATE
    allOrders = allOrders.filter(o => o.OrderID !== orderId);
    renderOrders();
    
    try {
        localStorage.setItem('adminCachedOrders', JSON.stringify(allOrders));
    } catch(err) {}

    // 2. BACKGROUND SYNC
    try {
        const payload = { action: 'deleteOrder', orderId: orderId };
        const res = await robustPost(payload);
        if (res && res.status === 'success') {
            showAlert('ลบสำเร็จ', 'ลบออเดอร์เรียบร้อยแล้ว', 'fa-check', 'text-green-600', 'bg-green-100');
        } else {
            showAlert('เกิดข้อผิดพลาด', res.message || 'ไม่สามารถลบออเดอร์ได้', 'fa-xmark', 'text-red-600', 'bg-red-100');
            fetchOrders(true); // reload to get correct state
        }
    } catch (error) {
        showAlert('เกิดข้อผิดพลาด', 'ไม่สามารถเชื่อมต่อกับระบบได้', 'fa-xmark', 'text-red-600', 'bg-red-100');
        fetchOrders(true);
    }
}