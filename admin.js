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

// Login Logic
loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (passwordInput.value === '66040114545') {
        loginScreen.classList.add('hidden');
        adminApp.classList.remove('hidden');
        requestNotificationPermission();
        fetchOrders();
        startPolling();
    } else {
        loginError.classList.remove('hidden');
        passwordInput.value = '';
    }
});

async function fetchOrders() {
    loading.classList.remove('hidden');
    tableContainer.classList.add('hidden');
    errorMsg.classList.add('hidden');

    // Use JSONP to bypass CORS on file:///
    const script = document.createElement('script');
    script.src = `${SCRIPT_URL}?action=getOrders&callback=handleOrdersResponse`;

    // Add error handling for the script tag
    script.onerror = () => {
        showError('ไม่สามารถเชื่อมต่อกับ Google Apps Script ได้ (อาจจะถูกบล็อกหรือ URL ผิด)');
    };

    document.body.appendChild(script);
}

let allOrders = [];
let currentTab = 'active';

// JSONP Callback
function handleOrdersResponse(data) {
    lastUpdate.textContent = new Date().toLocaleTimeString('th-TH');
    
    // Sort from new to old once
    allOrders = data.slice().reverse();
    
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

let knownOrderIds = new Set();
let isInitialLoad = true;
let pollingInterval = null;

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
// Smart Polling: เร็วขึ้นเป็น 15 วิ ลดการโหลดซ้ำที่ไม่จำเป็น
// ============================================================
function startPolling() {
    if (pollingInterval) clearInterval(pollingInterval);
    pollingInterval = setInterval(fetchOrders, 15000); // 15 seconds
}


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
    
    // Check for new orders
    let newOrderCount = 0;
    allOrders.forEach(o => {
        if (!knownOrderIds.has(o.OrderID)) {
            if (!isInitialLoad) newOrderCount++;
            knownOrderIds.add(o.OrderID);
        }
    });
    
    if (newOrderCount > 0) {
        // 1. Play sound (3 beeps)
        playNewOrderSound();
        // 2. Browser notification
        showBrowserNotification(newOrderCount);
        // 3. Flash tab title
        flashTabTitle(newOrderCount);
    }
    isInitialLoad = false;
    
    // Update Daily Dashboard
    updateDashboard();
    
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
                    <button onclick="openEditOrderModal('${order.OrderID}')" class="text-xs bg-blue-100 text-blue-700 hover:bg-blue-200 py-1 px-3 rounded-full font-bold transition shadow-sm"><i class="fa-solid fa-pen-to-square mr-1"></i> แก้ไข/เพิ่ม/ลบรายการ</button>
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
            if (!url) return null;
            let fileId = null;
            if (url.includes('/file/d/')) {
                fileId = url.split('/file/d/')[1].split('/')[0];
            } else if (url.includes('id=')) {
                fileId = url.split('id=')[1].split('&')[0];
            }
            return fileId ? `https://drive.google.com/thumbnail?id=${fileId}&sz=w800` : url;
        };

        let statusHtml = `
            <select data-original-status="${order.Status}" onchange="handleStatusChange(this, '${order.OrderID}')" class="w-full mb-2 p-2 bg-gray-50 border border-gray-200 rounded-lg text-xs font-bold focus:ring-2 focus:ring-green-500 outline-none text-gray-700">
                <option value="กำลังจัดหา" ${(!order.Status || order.Status === 'New' || order.Status === 'กำลังจัดหา') ? 'selected' : ''}>🛒 กำลังจัดหา</option>
                <option value="รอชำระเงิน" ${order.Status === 'รอชำระเงิน' ? 'selected' : ''}>⏳ รอชำระเงิน</option>
                <option value="รอตรวจสอบยอด" ${order.Status === 'รอตรวจสอบยอด' ? 'selected' : ''}>🧾 รอตรวจสอบยอด</option>
                <option value="กำลังไปส่ง" ${order.Status === 'กำลังไปส่ง' ? 'selected' : ''}>🛵 กำลังไปส่ง</option>
                <option value="Delivered" ${order.Status === 'Delivered' ? 'selected' : ''}>✅ ส่งของแล้ว</option>
                <option value="ยกเลิก/ของหมด" ${order.Status === 'ยกเลิก/ของหมด' ? 'selected' : ''}>❌ ยกเลิก/ของหมด</option>
            </select>
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
        if (order.Slip) {
            const thumbUrl = processDriveUrl(order.Slip);
            statusHtml += `
                <div class="mb-2">
                    <span class="block text-[10px] text-gray-500 font-bold mb-1"><i class="fa-solid fa-receipt"></i> สลิปโอนเงินลูกค้า</span>
                    <a href="${thumbUrl}" target="_blank" class="block border-2 border-orange-200 rounded-lg overflow-hidden hover:border-orange-400 transition hover:shadow-md">
                        <img src="${thumbUrl}" class="w-full h-24 object-cover object-top" alt="Slip">
                    </a>
                </div>
            `;
        }
        if (order.Status === 'Delivered' && order.DeliveryPhoto) {
            const thumbUrl = processDriveUrl(order.DeliveryPhoto);
            statusHtml += `
                <div class="mb-2">
                    <span class="block text-[10px] text-gray-500 font-bold mb-1"><i class="fa-solid fa-image"></i> รูปตอนส่งของ</span>
                    <a href="${thumbUrl}" target="_blank" class="block border-2 border-blue-200 rounded-lg overflow-hidden hover:border-blue-400 transition hover:shadow-md">
                        <img src="${thumbUrl}" class="w-full h-20 object-cover object-center" alt="Delivery Photo">
                    </a>
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
            <td class="py-4 px-4 align-top w-32">
                ${statusHtml}
            </td>
        `;
        ordersTableBody.appendChild(tr);
    });
}

function toggleChecklist(checkbox) {
    const itemNameSpan = checkbox.nextElementSibling.querySelector('.item-name');
    if (checkbox.checked) {
        itemNameSpan.classList.add('checklist-done');
    } else {
        itemNameSpan.classList.remove('checklist-done');
    }
}

function showError(message) {
    loading.classList.add('hidden');
    errorMsg.classList.remove('hidden');
    errorText.textContent = message;
}

// Upload Modal Logic
function openUploadModal(orderId) {
    currentOrderId.value = orderId;
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
    if (!deliveryBase64) {
        alert('กรุณาแนบรูปภาพตอนส่งของ');
        return;
    }

    const orderId = currentOrderId.value;
    const originalBtnText = confirmDeliveryBtn.innerHTML;
    confirmDeliveryBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> กำลังอัปโหลด...';
    confirmDeliveryBtn.disabled = true;

    try {
        const payload = {
            action: 'updateStatus',
            orderId: orderId,
            status: 'Delivered',
            deliveryPhotoBase64: deliveryBase64
        };

        const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (result.status === 'success') {
            closeUploadModal();
            showAlert('สำเร็จ', 'อัปเดตสถานะการส่งและแนบรูปเรียบร้อยแล้ว', 'fa-check', 'text-green-600', 'bg-green-100');
            fetchOrders(); // Refresh table
        } else {
            alert('เกิดข้อผิดพลาด: ' + result.message);
        }
    } catch (error) {
        console.error('Error:', error);
        alert('เกิดข้อผิดพลาดในการเชื่อมต่อ');
    } finally {
        confirmDeliveryBtn.innerHTML = originalBtnText;
        confirmDeliveryBtn.disabled = false;
    }
});

// --- Items Photo Modal Logic ---
function closeItemsPhotoModal() {
    document.getElementById('itemsPhotoModal').classList.add('hidden');
    window.pendingSavePayload = null;
    window.pendingSaveElements = null;
}

document.getElementById('itemsImage').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
        if (file.size > 2 * 1024 * 1024) {
            alert('ขนาดไฟล์ต้องไม่เกิน 2MB');
            this.value = '';
            return;
        }
        const reader = new FileReader();
        reader.onload = function(e) {
            document.getElementById('itemsPreview').src = e.target.result;
            document.getElementById('itemsPreviewContainer').classList.remove('hidden');
            window.itemsPhotoBase64Data = e.target.result;
        };
        reader.readAsDataURL(file);
    }
});

function removeItemsImage(e) {
    e.stopPropagation();
    document.getElementById('itemsImage').value = '';
    document.getElementById('itemsPreviewContainer').classList.add('hidden');
    document.getElementById('itemsPreview').src = '';
    window.itemsPhotoBase64Data = null;
}

document.getElementById('itemsPhotoForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!window.pendingSavePayload) return;
    
    const confirmBtn = document.getElementById('confirmItemsBtn');
    const originalText = confirmBtn.innerHTML;
    confirmBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> กำลังบันทึก...';
    confirmBtn.disabled = true;
    
    if (window.itemsPhotoBase64Data) {
        window.pendingSavePayload.itemsPhotoBase64 = window.itemsPhotoBase64Data;
    }
    
    // Call doSavePrices
    await doSavePrices(window.pendingSavePayload, window.pendingSaveElements.btn, window.pendingSaveElements.selectElement);
    
    confirmBtn.innerHTML = originalText;
    confirmBtn.disabled = false;
    
    closeItemsPhotoModal();
    showAlert('สำเร็จ', 'อัปเดตราคาและรูปสินค้าเรียบร้อยแล้ว!', 'fa-check', 'text-blue-600', 'bg-blue-100');
    fetchOrders();
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

function saveEditedOrder() {
    if (!currentEditOrderId) return;
    
    for (let i = 0; i < currentEditItems.length; i++) {
        if (!currentEditItems[i].Name.trim()) {
            alert('กรุณากรอกชื่อสินค้าให้ครบถ้วน หรือลบรายการที่ว่างออก');
            return;
        }
    }
    
    const order = allOrders.find(o => o.OrderID === currentEditOrderId);
    if (order) {
        const feeInput = document.getElementById(`fee_${currentEditOrderId}`);
        let currentFee = 20;
        if (feeInput) currentFee = feeInput.value;
        
        order.Items = JSON.stringify(currentEditItems);
        order.DeliveryFee = currentFee;
        
        renderOrders();
        closeEditOrderModal();
        alert("✏️ แก้ไขออเดอร์สำเร็จ!\n(อย่าลืมกดปุ่ม [บันทึก] สีฟ้า หรือเปลี่ยนสถานะ เพื่อเซฟลงระบบ)");
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

    if (newStatus === 'รอชำระเงิน') {
        window.pendingSavePayload = payload;
        window.pendingSaveElements = { btn: btn, selectElement: selectElement };
        
        document.getElementById('itemsPhotoForm').reset();
        document.getElementById('itemsPreviewContainer').classList.add('hidden');
        document.getElementById('itemsPreview').src = '';
        window.itemsPhotoBase64Data = null;
        
        document.getElementById('itemsPhotoModal').classList.remove('hidden');
        
        if (btn) {
            btn.innerHTML = btn.dataset.originalText;
            btn.disabled = false;
        }
        if (selectElement) selectElement.disabled = false;
        
        return; // wait for modal submission
    }
    
    await doSavePrices(payload, btn, selectElement);
}

async function doSavePrices(payload, btn, selectElement) {
    try {
        await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        
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
    } catch (e) {
        // Handle CORS error smoothly (it actually succeeds on GAS)
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
    }
}

// Handle status change from select dropdown
function handleStatusChange(selectElement, orderId) {
    const newStatus = selectElement.value;
    const originalStatus = selectElement.dataset.originalStatus || 'กำลังจัดหา';

    if (newStatus === 'รอชำระเงิน') {
        const priceInputs = document.querySelectorAll(`.item-price-${orderId}`);
        let allFilled = true;
        priceInputs.forEach((input, index) => {
            const oosCheckbox = document.getElementById(`oos_${orderId}_${index}`);
            if (!input.value && !(oosCheckbox && oosCheckbox.checked)) {
                allFilled = false;
            }
        });
        
        if (!allFilled) {
            alert('กรุณากรอกราคาสินค้าให้ครบทุกชิ้นก่อนเรียกเก็บเงินครับ');
            selectElement.value = originalStatus;
            return;
        }
        
        // Save prices and update status directly (QR code is fixed on customer side)
        savePrices(orderId, 'รอชำระเงิน', selectElement);
    } 
    else if (newStatus === 'Delivered') {
        selectElement.value = originalStatus;
        openUploadModal(orderId);
    } 
    else if (newStatus === 'กำลังจัดส่ง') {
        const eta = prompt('โปรดระบุเวลาที่คาดว่าจะถึง (เช่น 10 นาที, 15 นาที):', '10 นาที');
        if (eta !== null) {
            // we must pass eta to savePrices. Let's add eta parameter or pass it globally.
            window.currentEta = eta.trim();
            savePrices(orderId, newStatus, selectElement);
        } else {
            selectElement.value = originalStatus; // cancelled
        }
    }
    else {
        // Just status update
        savePrices(orderId, newStatus, selectElement);
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
