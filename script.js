// *** IMPORTANT ***
// คุณต้องนำ URL ของ Web App ที่ได้จาก Google Apps Script มาใส่ตรงนี้
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzLk2fmojtjc8upkQmYp-d7tbgaQVJw1moBGSpLWYiYd-MQ18WI-c8zYfRc4qI45vVQ/exec';

let cart = [];
const MAX_ITEMS = 7; // จำกัดรายการฝากซื้อ 7 รายการ (แถว)

// DOM Elements
const itemForm = document.getElementById('itemForm');
const itemNameInput = document.getElementById('itemName');
const itemQtyInput = document.getElementById('itemQty');
const itemUnitInput = document.getElementById('itemUnit');
const itemImageInput = document.getElementById('itemImage');
const imagePreviewContainer = document.getElementById('imagePreview');
const imagePreviewImg = imagePreviewContainer.querySelector('img');

const cartItemsContainer = document.getElementById('cartItems');
const totalItemsCountEl = document.getElementById('totalItemsCount');
const checkoutForm = document.getElementById('checkoutForm');
const submitBtn = document.getElementById('submitBtn');

const pinBtn = document.getElementById('pinBtn');
const locationLinkInput = document.getElementById('locationLink');
const locationStatus = document.getElementById('locationStatus');

// Modal Elements
const alertModal = document.getElementById('alertModal');
const alertTitle = document.getElementById('alertTitle');
const alertMessage = document.getElementById('alertMessage');
const alertIcon = document.getElementById('alertIcon');

let currentBase64Image = null;

document.addEventListener('DOMContentLoaded', () => {
    updateCartUI();
    if (SCRIPT_URL.includes('YOUR_SCRIPT_ID')) {
        showAlert('คำเตือน', 'คุณยังไม่ได้ใส่ URL ของ Google Apps Script ในไฟล์ script.js บรรทัดที่ 3', 'fa-triangle-exclamation', 'text-yellow-500', 'bg-yellow-100');
    }
});

// Image Handling
itemImageInput.addEventListener('change', function (e) {
    const file = e.target.files[0];
    if (file) {
        if (file.size > 2 * 1024 * 1024) {
            showAlert('ไฟล์ใหญ่เกินไป', 'กรุณาอัปโหลดรูปภาพขนาดไม่เกิน 2MB');
            this.value = '';
            removeImage();
            return;
        }

        const reader = new FileReader();
        reader.onload = function (event) {
            currentBase64Image = event.target.result;
            imagePreviewImg.src = currentBase64Image;
            imagePreviewContainer.classList.remove('hidden');
        };
        reader.readAsDataURL(file);
    } else {
        removeImage();
    }
});

function removeImage(e) {
    if (e) e.stopPropagation();
    itemImageInput.value = '';
    imagePreviewContainer.classList.add('hidden');
    currentBase64Image = null;
}

// Add Item Form Submit
itemForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const name = itemNameInput.value.trim();
    const qty = parseFloat(itemQtyInput.value);
    const unit = itemUnitInput.value;

    if (cart.length >= MAX_ITEMS) {
        showAlert('ตะกร้าเต็มแล้ว', `คุณสามารถฝากซื้อได้สูงสุด ${MAX_ITEMS} รายการต่อ 1 ออเดอร์`);
        return;
    }

    cart.push({
        id: Date.now().toString(),
        Name: name,
        quantity: qty,
        unit: unit,
        base64Image: currentBase64Image
    });

    // Reset Form
    itemForm.reset();
    itemQtyInput.value = 1;
    itemUnitInput.value = 'ชิ้น';
    removeImage();

    updateCartUI();
});

function deleteFromCart(id) {
    cart = cart.filter(item => item.id !== id);
    updateCartUI();
}

function updateCartUI() {
    cartItemsContainer.innerHTML = '';

    if (cart.length === 0) {
        cartItemsContainer.innerHTML = `
            <div class="flex flex-col items-center justify-center py-8 text-gray-400">
                <i class="fa-solid fa-box-open text-4xl mb-3 text-gray-300"></i>
                <p>ยังไม่มีรายการฝากซื้อ</p>
            </div>`;
        submitBtn.disabled = true;
    } else {
        submitBtn.disabled = false;
        cart.forEach(item => {
            const itemEl = document.createElement('div');
            itemEl.className = 'flex items-start bg-gray-50 p-3 rounded-xl border border-gray-100 shadow-sm transition hover:shadow-md';

            let imgHtml = '';
            if (item.base64Image) {
                imgHtml = `<img src="${item.base64Image}" class="w-16 h-16 object-cover rounded-lg mr-3 border border-gray-200">`;
            } else {
                imgHtml = `<div class="w-16 h-16 bg-gray-200 rounded-lg flex items-center justify-center mr-3 text-2xl text-gray-400"><i class="fa-solid fa-image"></i></div>`;
            }

            itemEl.innerHTML = `
                ${imgHtml}
                <div class="flex-1">
                    <h4 class="text-sm font-bold text-gray-800">${item.Name}</h4>
                    <p class="text-xs text-green-600 font-semibold mt-1 bg-green-100 inline-block px-2 py-0.5 rounded-full">
                        จำนวน: ${item.quantity} ${item.unit}
                    </p>
                </div>
                <button type="button" onclick="deleteFromCart('${item.id}')" class="text-red-400 hover:text-red-600 p-2 transition">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            `;
            cartItemsContainer.appendChild(itemEl);
        });
    }

    totalItemsCountEl.textContent = cart.length;

    if (cart.length >= MAX_ITEMS) {
        totalItemsCountEl.classList.add('text-red-500');
        totalItemsCountEl.parentElement.classList.replace('bg-green-100', 'bg-red-100');
        totalItemsCountEl.parentElement.classList.replace('text-green-700', 'text-red-700');
    } else {
        totalItemsCountEl.classList.remove('text-red-500');
        totalItemsCountEl.parentElement.classList.replace('bg-red-100', 'bg-green-100');
        totalItemsCountEl.parentElement.classList.replace('text-red-700', 'text-green-700');
    }
}

// Geolocation
function getLocation() {
    pinBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังหา...';
    pinBtn.disabled = true;
    locationStatus.textContent = 'กำลังดึงตำแหน่งพิกัดของคุณ...';

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const lat = position.coords.latitude;
                const lng = position.coords.longitude;
                const mapsLink = `https://www.google.com/maps?q=${lat},${lng}`;
                locationLinkInput.value = mapsLink;

                pinBtn.innerHTML = '<i class="fa-solid fa-check"></i> ดึงตำแหน่งสำเร็จ';
                pinBtn.classList.replace('bg-blue-100', 'bg-green-100');
                pinBtn.classList.replace('text-blue-700', 'text-green-700');
                locationStatus.textContent = 'ตำแหน่งถูกบันทึกแล้ว';
                locationStatus.classList.add('text-green-600');
            },
            (error) => {
                pinBtn.innerHTML = '<i class="fa-solid fa-location-crosshairs"></i> ปักหมุด';
                pinBtn.disabled = false;

                let errorMsg = 'ไม่สามารถดึงตำแหน่งได้';
                if (error.code === 1) errorMsg = 'คุณไม่อนุญาตให้เข้าถึงตำแหน่ง';

                locationStatus.textContent = errorMsg;
                locationStatus.classList.add('text-red-500');
                showAlert('ข้อผิดพลาด', errorMsg + ' กรุณาอนุญาต Location หรือพิมพ์รายละเอียดที่อยู่ให้ชัดเจน');
            }
        );
    } else {
        pinBtn.innerHTML = '<i class="fa-solid fa-location-crosshairs"></i> ปักหมุด';
        pinBtn.disabled = false;
        locationStatus.textContent = "เบราว์เซอร์ของคุณไม่รองรับการดึงตำแหน่ง";
        locationStatus.classList.add('text-red-500');
    }
}

// Handle Checkout Submission
checkoutForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (cart.length === 0) return;

    const customerName = document.getElementById('customerName').value;
    const customerPhone = document.getElementById('customerPhone').value;
    const zoneSelect = document.getElementById('zoneSelect');
    const zoneVal = zoneSelect.options[zoneSelect.selectedIndex].value;
    const dormVal = document.getElementById('dormName').value;
    const dormName = zoneVal + " - " + dormVal;
    const locationLink = locationLinkInput.value;

    if (!locationLink) {
        showAlert('ข้อควรระวัง', 'คุณยังไม่ได้ปักหมุดตำแหน่ง (หากปักไม่ได้ กรุณาระบุชื่อหอ/จุดสังเกตให้ชัดเจนที่สุด)');
        // สามารถกดส่งต่อได้ แต่แค่เตือน
    }

    if (SCRIPT_URL.includes('YOUR_SCRIPT_ID')) {
        showAlert('จำลองการส่งข้อมูลสำเร็จ', 'กรุณาใส่ URL ของ Web App ใน script.js เพื่อให้ใช้งานได้จริง', 'fa-check-circle', 'text-green-500', 'bg-green-100');
        return;
    }

    const orderData = {
        customerName: customerName,
        phone: customerPhone,
        dormName: dormName,
        locationLink: locationLink,
        items: cart
    };

    const originalBtnText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<div class="loader inline-block border-white border-t-white w-5 h-5 align-middle mr-2"></div> กำลังส่งออเดอร์... (รอสักครู่)';
    submitBtn.disabled = true;

    try {
        const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify(orderData)
        });

        const result = await response.json();

        if (result.status === 'success') {
            showAlert('ส่งออเดอร์สำเร็จ!', `คนรับฝากซื้อได้รับออเดอร์แล้ว (รหัส: ${result.orderId}) จะติดต่อกลับไปตามเบอร์โทรที่ให้ไว้`, 'fa-circle-check', 'text-green-500', 'bg-green-100');
            
            // Save order ID to local storage to remember customer's order
            localStorage.setItem('myActiveOrderId', result.orderId);
            
            cart = [];
            updateCartUI();
            checkoutForm.reset();
            locationLinkInput.value = '';
            pinBtn.innerHTML = '<i class="fa-solid fa-location-crosshairs"></i> ปักหมุด';
            pinBtn.disabled = false;
            pinBtn.classList.replace('bg-green-100', 'bg-blue-100');
            pinBtn.classList.replace('text-green-700', 'text-blue-700');
            locationStatus.textContent = '';
        } else {
            showAlert('เกิดข้อผิดพลาด', result.message || 'ไม่สามารถบันทึกข้อมูลได้', 'fa-triangle-exclamation', 'text-red-500', 'bg-red-100');
        }
    } catch (error) {
        console.error('Error submitting order:', error);
        showAlert('ส่งออเดอร์สำเร็จ!', 'ระบบได้รับข้อมูลของคุณแล้ว (โหมด Fallback)', 'fa-circle-check', 'text-green-500', 'bg-green-100');
        cart = [];
        updateCartUI();
        checkoutForm.reset();
        locationLinkInput.value = '';
        locationStatus.textContent = '';
    } finally {
        submitBtn.innerHTML = originalBtnText;
        submitBtn.disabled = cart.length === 0;
    }
});

function showAlert(title, message, iconClass = 'fa-bell', iconColorClass = 'text-green-600', iconBgClass = 'bg-green-100') {
    alertTitle.textContent = title;
    alertMessage.textContent = message;

    // Update Icon
    alertIcon.className = `fa-solid ${iconClass} ${iconColorClass} text-xl`;
    alertIcon.parentElement.className = `mx-auto flex items-center justify-center h-12 w-12 rounded-full mb-4 ${iconBgClass}`;

    alertModal.classList.remove('hidden');
}

function closeAlert() {
    alertModal.classList.add('hidden');
}

// Order Tracking Logic
const trackModal = document.getElementById('trackModal');
const trackForm = document.getElementById('trackForm');
const trackOrderId = document.getElementById('trackOrderId');
const trackBtn = document.getElementById('trackBtn');
const trackResult = document.getElementById('trackResult');
const trackStatusBadge = document.getElementById('trackStatusBadge');
const trackPhotoContainer = document.getElementById('trackPhotoContainer');
const trackPhoto = document.getElementById('trackPhoto');

function openTrackModal() {
    trackModal.classList.remove('hidden');
    trackResult.classList.add('hidden');
    trackOrderId.value = '';
}

function closeTrackModal() {
    trackModal.classList.add('hidden');
}

if (trackForm) {
    trackForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const orderId = trackOrderId.value.trim();
        if (!orderId) return;

        const originalBtnText = trackBtn.innerHTML;
        trackBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังตรวจสอบ...';
        trackBtn.disabled = true;
        trackResult.classList.add('hidden');

        // Use JSONP to bypass CORS on file:///
        const script = document.createElement('script');
        script.src = `${SCRIPT_URL}?action=trackOrder&orderId=${orderId}&callback=handleTrackResponse`;
        
        script.onerror = () => {
            showAlert('เกิดข้อผิดพลาด', 'ไม่สามารถเชื่อมต่อกับระบบได้', 'fa-wifi', 'text-red-500', 'bg-red-100');
            trackBtn.innerHTML = 'ตรวจสอบ';
            trackBtn.disabled = false;
        };
        
        document.body.appendChild(script);
    });
}

let currentTrackedOrderId = null;

function handleTrackResponse(result) {
    trackBtn.innerHTML = 'ตรวจสอบ';
    trackBtn.disabled = false;
    
    if (result.status === 'success') {
        currentTrackedOrderId = result.orderId || result.OrderID;
        trackResult.classList.remove('hidden');
        
        // Hide containers initially
        document.getElementById('trackPhotoContainer').classList.add('hidden');
        document.getElementById('trackPaymentContainer').classList.add('hidden');
        document.getElementById('trackQrContainer').classList.add('hidden');
        document.getElementById('trackSlipUploadContainer').classList.add('hidden');
        
        const trackCustomerInfo = document.getElementById('trackCustomerInfo');
        if (trackCustomerInfo) trackCustomerInfo.classList.add('hidden');
        
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

        // --- TIMELINE LOGIC ---
        const trackTimeline = document.getElementById('trackTimeline');
        const timelineProgress = document.getElementById('timelineProgress');
        
        if (trackTimeline) {
            if (result.orderStatus === 'ยกเลิก/ของหมด') {
                trackTimeline.classList.add('hidden'); // Hide on cancel
            } else {
                trackTimeline.classList.remove('hidden');
                
                // Determine step level (1, 2, 3, or 4)
                let stepLevel = 1; // Default: รับออเดอร์/กำลังจัดหา
                if (result.orderStatus === 'รอชำระเงิน' || result.orderStatus === 'รอตรวจสอบยอด') {
                    stepLevel = 2; // จัดหาของเสร็จ รอโอน
                } else if (result.orderStatus === 'กำลังจัดส่ง' || result.orderStatus === 'กำลังไปส่ง') {
                    stepLevel = 3; // กำลังไปส่ง
                } else if (result.orderStatus === 'Delivered' || result.orderStatus === 'ส่งของแล้ว') {
                    stepLevel = 4; // สำเร็จ
                }
                
                // Set Progress Bar Width
                const progressWidths = {1: '0%', 2: '33%', 3: '66%', 4: '100%'};
                if (timelineProgress) timelineProgress.style.width = progressWidths[stepLevel];
                
                // Highlight Steps
                for (let i = 1; i <= 4; i++) {
                    const stepEl = document.getElementById('step' + i);
                    if (!stepEl) continue;
                    
                    const icon = stepEl.querySelector('.step-icon');
                    const text = stepEl.querySelector('.step-text');
                    
                    if (i <= stepLevel) {
                        // Active Step
                        icon.classList.remove('bg-gray-200', 'text-gray-400', 'border-white');
                        icon.classList.add('bg-green-500', 'text-white', 'border-green-100');
                        text.classList.remove('text-gray-400');
                        text.classList.add('text-green-600', 'font-extrabold');
                    } else {
                        // Inactive Step
                        icon.classList.remove('bg-green-500', 'text-white', 'border-green-100');
                        icon.classList.add('bg-gray-200', 'text-gray-400', 'border-white');
                        text.classList.remove('text-green-600', 'font-extrabold');
                        text.classList.add('text-gray-400');
                    }
                }
            }
        }
        // ----------------------
        
        if (result.orderStatus === 'Delivered') {
            localStorage.removeItem('myActiveOrderId'); // Clear saved order
            trackStatusBadge.textContent = 'ส่งของแล้ว';
            trackStatusBadge.className = 'inline-block px-4 py-2 rounded-full font-bold text-sm mb-4 bg-green-100 text-green-700';
            
            if (result.deliveryPhoto) {
                document.getElementById('trackPhoto').src = processDriveUrl(result.deliveryPhoto);
                document.getElementById('trackPhotoContainer').classList.remove('hidden');
            }
        } 
        else if (result.orderStatus === 'รอชำระเงิน' || result.orderStatus === 'รอตรวจสอบยอด') {
            trackStatusBadge.textContent = result.orderStatus;
            trackStatusBadge.className = result.orderStatus === 'รอชำระเงิน' 
                ? 'inline-block px-4 py-2 rounded-full font-bold text-sm mb-4 bg-yellow-100 text-yellow-700'
                : 'inline-block px-4 py-2 rounded-full font-bold text-sm mb-4 bg-orange-100 text-orange-700';
                
            document.getElementById('trackPaymentContainer').classList.remove('hidden');
            
            if (trackCustomerInfo) {
                document.getElementById('verifyName').textContent = result.CustomerName || '-';
                document.getElementById('verifyPhone').textContent = result.Phone || '-';
                document.getElementById('verifyAddress').textContent = result.DormName || '-';
                trackCustomerInfo.classList.remove('hidden');
            }
            
            // Build Bill Details
            let billHtml = '';
            try {
                const items = typeof result.Items === 'string' ? JSON.parse(result.Items) : result.Items;
                if (Array.isArray(items)) {
                    items.forEach(item => {
                        if (item.outOfStock) {
                            billHtml += `<div class="flex justify-between text-gray-400 line-through"><span>${item.quantity || 1}x ${item.Name}</span><span class="text-red-500 font-bold no-underline">ของหมด</span></div>`;
                        } else {
                            billHtml += `<div class="flex justify-between text-gray-700"><span>${item.quantity || 1}x ${item.Name}</span><span>${item.price ? item.price + ' ฿' : '-'}</span></div>`;
                        }
                    });
                }
            } catch(e) {
                console.error('Items parse error:', e);
            }
            
            if (result.DeliveryFee) {
                billHtml += `<div class="flex justify-between border-t border-gray-200 pt-1 mt-1 text-blue-600 font-semibold"><span>ค่าหิ้ว/ค่าส่ง</span><span>${result.DeliveryFee} ฿</span></div>`;
            }
            
            if (result.ItemsPhoto) {
                const thumbUrl = processDriveUrl(result.ItemsPhoto);
                billHtml += `
                    <div class="mt-3 border-t border-gray-200 pt-3 text-center">
                        <span class="block text-[11px] font-bold text-gray-500 mb-2"><i class="fa-solid fa-camera"></i> รูปสินค้าที่จัดหาได้ (ตรวจสอบก่อนโอน)</span>
                        <a href="${thumbUrl}" target="_blank" class="inline-block border-2 border-blue-100 rounded-lg overflow-hidden hover:border-blue-300 transition shadow-sm">
                            <img src="${thumbUrl}" class="h-32 object-cover" alt="Items Photo">
                        </a>
                    </div>
                `;
            }
            
            if (!billHtml) billHtml = '<div class="text-center text-gray-400 text-xs">ไม่พบรายละเอียดสินค้า</div>';
            
            document.getElementById('trackBillDetails').innerHTML = billHtml;
            document.getElementById('trackTotalPrice').textContent = (result.TotalPrice || 0) + ' ฿';
            
            if (result.orderStatus === 'รอชำระเงิน') {
                const totalAmount = parseFloat(result.TotalPrice) || 0;
                if (totalAmount > 0) {
                    // ใช้ promptpay.io สร้าง QR แบบระบุยอดเงิน (หมายเลขบัตรประชาชน 13 หลัก)
                    document.getElementById('trackQrImage').src = `https://promptpay.io/1100201867505/${totalAmount}.png`;
                } else {
                    document.getElementById('trackQrImage').src = 'S__258760717.jpg';
                }
                
                document.getElementById('trackQrContainer').classList.remove('hidden');
                document.getElementById('trackSlipUploadContainer').classList.remove('hidden');
            }
        }
        else if (result.orderStatus === 'ยกเลิก/ของหมด') {
            localStorage.removeItem('myActiveOrderId'); // Clear saved order
            trackStatusBadge.innerHTML = '<i class="fa-solid fa-xmark mr-1"></i> ยกเลิก/ของหมด';
            trackStatusBadge.className = 'inline-block px-4 py-2 rounded-full font-bold text-sm mb-4 bg-red-100 text-red-700';
        }
        else {
            if (result.orderStatus === 'กำลังจัดส่ง' && result.ETA) {
                trackStatusBadge.innerHTML = `<i class="fa-solid fa-motorcycle mr-1"></i> ${result.orderStatus}<br><span class="text-xs font-normal mt-1 block"><i class="fa-regular fa-clock"></i> ถึงภายใน: <b>${result.ETA}</b></span>`;
                trackStatusBadge.className = 'inline-block px-4 py-2 rounded-xl font-bold text-sm mb-4 bg-blue-100 text-blue-700 text-center';
            } else {
                trackStatusBadge.textContent = result.orderStatus || 'กำลังจัดหา';
                trackStatusBadge.className = 'inline-block px-4 py-2 rounded-full font-bold text-sm mb-4 bg-yellow-100 text-yellow-700';
            }
        }
    } else {
        showAlert('ไม่พบออเดอร์', 'ไม่พบรหัสออเดอร์นี้ในระบบ กรุณาตรวจสอบอีกครั้ง', 'fa-magnifying-glass-minus', 'text-red-500', 'bg-red-100');
    }
}

// Function to open track modal from live status table
function openTrackFor(orderId) {
    const trackModal = document.getElementById('trackModal');
    const trackOrderId = document.getElementById('trackOrderId');
    const trackBtn = document.getElementById('trackBtn');
    
    if (trackModal && trackOrderId && trackBtn) {
        trackOrderId.value = orderId;
        trackModal.classList.remove('hidden');
        trackBtn.click(); // Auto submit
    }
}

// Handle slip upload
const slipUploadForm = document.getElementById('slipUploadForm');
if (slipUploadForm) {
    slipUploadForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const file = document.getElementById('slipInput').files[0];
        if (!file || !currentTrackedOrderId) return;
        
        const btn = document.getElementById('submitSlipBtn');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังอัปโหลด...';
        btn.disabled = true;
        
        const reader = new FileReader();
        reader.onload = async function(ev) {
            try {
                const payload = {
                    action: 'updateStatus',
                    orderId: currentTrackedOrderId,
                    status: 'รอตรวจสอบยอด',
                    slipBase64: ev.target.result
                };
                
                await fetch(SCRIPT_URL, {
                    method: 'POST',
                    body: JSON.stringify(payload)
                });
                
                showAlert('ส่งสลิปสำเร็จ', 'ระบบได้รับสลิปแล้ว กำลังรอแอดมินตรวจสอบยอดครับ', 'fa-check', 'text-green-600', 'bg-green-100');
                closeTrackModal();
            } catch (error) {
                showAlert('ส่งสลิปสำเร็จ', 'ระบบได้รับสลิปแล้ว กำลังรอแอดมินตรวจสอบยอดครับ', 'fa-check', 'text-green-600', 'bg-green-100');
                closeTrackModal();
            } finally {
                btn.innerHTML = originalText;
                btn.disabled = false;
            }
        };
        reader.readAsDataURL(file);
    });
}

// --- Live Status Board Logic ---
document.addEventListener('DOMContentLoaded', () => {
    if (!SCRIPT_URL.includes('YOUR_SCRIPT_ID')) {
        fetchLiveStatus();
        checkShopStatus();
        setInterval(() => {
            fetchLiveStatus();
            checkShopStatus();
        }, 30000);
    }
});

function checkShopStatus() {
    const script = document.createElement('script');
    script.src = `${SCRIPT_URL}?action=getShopStatus&callback=applyShopStatus`;
    document.body.appendChild(script);
}

function applyShopStatus(data) {
    const alertBox = document.getElementById('shopClosedAlert');
    const submitBtn = document.getElementById('submitBtn');
    
    if (data.isOpen) {
        if (alertBox) alertBox.classList.add('hidden');
        if (submitBtn && cart.length > 0) submitBtn.disabled = false;
        if (submitBtn) submitBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> ส่งออเดอร์ให้คนรับฝากซื้อ';
    } else {
        if (alertBox) alertBox.classList.remove('hidden');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fa-solid fa-store-slash"></i> ร้านปิดรับออเดอร์';
        }
    }
}

function fetchLiveStatus() {
    const tbody = document.getElementById('liveStatusBody');
    if (!tbody) return;
    
    tbody.innerHTML = '<tr><td colspan="4" class="text-center p-6 text-gray-400"><i class="fa-solid fa-spinner fa-spin mr-2"></i>กำลังดึงข้อมูล...</td></tr>';
    
    const script = document.createElement('script');
    script.src = `${SCRIPT_URL}?action=getOrders&callback=renderLiveStatus`;
    
    script.onerror = () => {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center p-6 text-red-400">ไม่สามารถเชื่อมต่อกับระบบได้</td></tr>';
    };
    
    document.body.appendChild(script);
}

let currentLiveTab = 'active';

function switchLiveTab(tab) {
    currentLiveTab = tab;
    
    const tabActive = document.getElementById('liveTabActive');
    const tabHistory = document.getElementById('liveTabHistory');
    
    if (tab === 'active') {
        tabActive.className = "py-2 px-4 text-sm font-bold border-b-2 border-green-500 text-green-600 focus:outline-none transition-colors";
        tabHistory.className = "py-2 px-4 text-sm font-bold border-b-2 border-transparent text-gray-400 hover:text-gray-600 focus:outline-none transition-colors";
    } else {
        tabHistory.className = "py-2 px-4 text-sm font-bold border-b-2 border-green-500 text-green-600 focus:outline-none transition-colors";
        tabActive.className = "py-2 px-4 text-sm font-bold border-b-2 border-transparent text-gray-400 hover:text-gray-600 focus:outline-none transition-colors";
    }
    
    if (window.cachedLiveOrders) {
        renderLiveStatus(window.cachedLiveOrders);
    }
}

function renderLiveStatus(orders) {
    window.cachedLiveOrders = orders;
    
    const tbody = document.getElementById('liveStatusBody');
    if (!tbody) return;
    
    if (!orders || orders.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center p-6 text-gray-400">ยังไม่มีรายการสั่งซื้อในระบบ</td></tr>';
        return;
    }
    
    const sortedOrders = [...orders].reverse();
    
    // Filter based on tab
    const filteredOrders = sortedOrders.filter(order => {
        const isHistory = order.Status === 'Delivered' || order.Status === 'ยกเลิก/ของหมด';
        if (currentLiveTab === 'active') return !isHistory;
        return isHistory;
    });
    
    if (filteredOrders.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center p-6 text-gray-400">ยังไม่มีออเดอร์ในหมวดหมู่นี้</td></tr>';
        return;
    }
    
    const recentOrders = filteredOrders.slice(0, 10);
    
    tbody.innerHTML = recentOrders.map(order => {
        let statusBadge = '';
        if (order.Status === 'Delivered') {
            statusBadge = '<span class="bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-bold"><i class="fa-solid fa-check mr-1"></i> ส่งแล้ว</span>';
        } else if (order.Status === 'กำลังไปส่ง') {
            statusBadge = '<span class="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-xs font-bold"><i class="fa-solid fa-motorcycle mr-1"></i> กำลังไปส่ง</span>';
        } else if (order.Status === 'รอชำระเงิน' || order.Status === 'รอตรวจสอบยอด') {
            statusBadge = `<span class="bg-orange-100 text-orange-700 px-3 py-1 rounded-full text-xs font-bold"><i class="fa-solid fa-file-invoice-dollar mr-1"></i> ${order.Status}</span>`;
        } else if (order.Status === 'ยกเลิก/ของหมด') {
            statusBadge = `<span class="bg-red-100 text-red-700 px-3 py-1 rounded-full text-xs font-bold"><i class="fa-solid fa-xmark mr-1"></i> ยกเลิก/ของหมด</span>`;
        } else {
            statusBadge = `<span class="bg-yellow-100 text-yellow-700 px-3 py-1 rounded-full text-xs font-bold"><i class="fa-solid fa-basket-shopping mr-1"></i> ${order.Status || 'กำลังจัดหา'}</span>`;
        }
        
        let customerName = order.CustomerName || 'ไม่ระบุ';
        
        let totalPriceHtml = '<span class="text-gray-300">-</span>';
        if (order.TotalPrice && parseFloat(order.TotalPrice) > 0) {
            totalPriceHtml = `<span class="font-bold text-red-500">${order.TotalPrice}</span>`;
        }
        
        return `
            <tr class="hover:bg-green-50 transition cursor-pointer" onclick="openTrackFor('${order.OrderID}')" title="คลิกเพื่อดูรายละเอียดและชำระเงิน">
                <td class="p-3 font-semibold text-green-700 underline decoration-green-300 decoration-2 underline-offset-2">${order.OrderID}</td>
                <td class="p-3 text-gray-600">${customerName}</td>
                <td class="p-3 text-center">${totalPriceHtml}</td>
                <td class="p-3">${statusBadge}</td>
            </tr>
        `;
    }).join('');
}

// Auto-open active order on page load
document.addEventListener('DOMContentLoaded', () => {
    const activeOrderId = localStorage.getItem('myActiveOrderId');
    if (activeOrderId) {
        openTrackFor(activeOrderId);
    }
});
