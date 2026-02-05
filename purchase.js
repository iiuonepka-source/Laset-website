let currentPlan = '';
let currentPrice = 0;
let discountApplied = false;

async function checkAuthBeforePurchase(plan, price) {
    const token = localStorage.getItem('token');
    
    if (!token) {
        // Redirect to auth page if not logged in
        sessionStorage.setItem('redirectAfterLogin', 'purchase.html');
        window.location.href = 'auth.html';
        return;
    }

    try {
        const response = await fetch(`${window.location.origin}/api/auth/verify`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            openPurchaseModal(plan, price);
        } else {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            sessionStorage.setItem('redirectAfterLogin', 'purchase.html');
            window.location.href = 'auth.html';
        }
    } catch (error) {
        sessionStorage.setItem('redirectAfterLogin', 'purchase.html');
        window.location.href = 'auth.html';
    }
}

function openPurchaseModal(plan, price) {
    currentPlan = plan;
    currentPrice = price;
    discountApplied = false;
    
    const currency = getCurrencySymbol();
    
    document.getElementById('purchaseModal').style.display = 'flex';
    document.getElementById('selectedPlan').textContent = `${plan} - ${currency}${price}`;
    document.getElementById('originalPrice').textContent = `${currency}${price}`;
    document.getElementById('finalPrice').textContent = `${currency}${price}`;
    document.getElementById('discountRow').style.display = 'none';
    document.getElementById('promoCode').value = '';
    document.getElementById('promoMessage').textContent = '';
    document.getElementById('promoMessage').className = 'promo-message';
    
    // Reinitialize icons
    setTimeout(() => lucide.createIcons(), 100);
}

function closePurchaseModal() {
    document.getElementById('purchaseModal').style.display = 'none';
}

function applyPromo() {
    const promoCode = document.getElementById('promoCode').value.trim().toUpperCase();
    const promoMessage = document.getElementById('promoMessage');
    const currency = getCurrencySymbol();
    
    if (promoCode === 'DEV') {
        if (discountApplied) {
            promoMessage.textContent = translate('modal.promoAlready');
            promoMessage.className = 'promo-message info';
            return;
        }
        
        const discount = currentPrice * 0.12;
        const finalPrice = currentPrice - discount;
        
        document.getElementById('discountAmount').textContent = `-${currency}${discount.toFixed(2)}`;
        document.getElementById('finalPrice').textContent = `${currency}${finalPrice.toFixed(2)}`;
        document.getElementById('discountRow').style.display = 'flex';
        
        promoMessage.textContent = translate('modal.promoApplied');
        promoMessage.className = 'promo-message success';
        discountApplied = true;
    } else if (promoCode === '') {
        promoMessage.textContent = translate('modal.promoEmpty');
        promoMessage.className = 'promo-message error';
    } else {
        promoMessage.textContent = translate('modal.promoInvalid');
        promoMessage.className = 'promo-message error';
    }
}

function completePurchase() {
    window.location.href = 'soon.html';
}

// Close modal when clicking outside
window.onclick = function(event) {
    const modal = document.getElementById('purchaseModal');
    if (event.target === modal) {
        closePurchaseModal();
    }
}

// Close modal with Escape key
document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        closePurchaseModal();
    }
});
