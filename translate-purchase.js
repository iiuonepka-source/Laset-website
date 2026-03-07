document.addEventListener('DOMContentLoaded', () => {
    translatePurchasePage();
    updatePrices();
});

function translatePurchasePage() {
    const currency = getCurrencySymbol();
    
    // Navigation
    document.querySelectorAll('.nav-links a')[0].textContent = translate('nav.features');
    document.querySelectorAll('.nav-links a')[1].textContent = translate('nav.bypasses');
    document.querySelectorAll('.nav-links a')[2].textContent = translate('nav.purchase');
    
    // Purchase Header
    document.querySelector('.purchase-header h1').textContent = translate('purchase.title');
    document.querySelector('.purchase-header .subtitle').textContent = translate('purchase.subtitle');
    
    // Promo Banner
    document.querySelector('.promo-banner span').innerHTML = translate('purchase.promo');
    
    // Pricing Cards
    const pricingCards = document.querySelectorAll('.pricing-card');
    
    // 15 Days
    pricingCards[0].querySelector('h3').textContent = translate('purchase.plans.days15');
    pricingCards[0].querySelector('.amount').textContent = currency + getPrice('days15');
    updateFeaturesList(pricingCards[0], ['fullAccess', 'allBypasses', 'discordSupport', 'regularUpdates']);
    pricingCards[0].querySelector('.buy-btn').textContent = translate('purchase.purchaseNow');
    pricingCards[0].querySelector('.buy-btn').setAttribute('onclick', `checkAuthBeforePurchase('${translate('purchase.plans.days15')}', ${getPrice('days15')})`);
    
    // 30 Days
    pricingCards[1].querySelector('.badge').textContent = translate('purchase.badges.popular');
    pricingCards[1].querySelector('h3').textContent = translate('purchase.plans.days30');
    pricingCards[1].querySelector('.amount').textContent = currency + getPrice('days30');
    updateFeaturesList(pricingCards[1], ['fullAccess', 'allBypasses', 'discordSupport', 'regularUpdates', 'prioritySupport']);
    pricingCards[1].querySelector('.buy-btn').textContent = translate('purchase.purchaseNow');
    pricingCards[1].querySelector('.buy-btn').setAttribute('onclick', `checkAuthBeforePurchase('${translate('purchase.plans.days30')}', ${getPrice('days30')})`);
    
    // 90 Days
    pricingCards[2].querySelector('h3').textContent = translate('purchase.plans.days90');
    pricingCards[2].querySelector('.amount').textContent = currency + getPrice('days90');
    updateFeaturesList(pricingCards[2], ['fullAccess', 'allBypasses', 'discordSupport', 'regularUpdates', 'prioritySupport']);
    pricingCards[2].querySelector('.buy-btn').textContent = translate('purchase.purchaseNow');
    pricingCards[2].querySelector('.buy-btn').setAttribute('onclick', `checkAuthBeforePurchase('${translate('purchase.plans.days90')}', ${getPrice('days90')})`);
    
    // Lifetime
    pricingCards[3].querySelector('.badge').textContent = translate('purchase.badges.bestValue');
    pricingCards[3].querySelector('h3').textContent = translate('purchase.plans.lifetime');
    pricingCards[3].querySelector('.amount').textContent = currency + getPrice('lifetime');
    updateFeaturesList(pricingCards[3], ['fullAccess', 'allBypasses', 'discordSupport', 'regularUpdates', 'prioritySupport', 'lifetimeUpdates']);
    pricingCards[3].querySelector('.buy-btn').textContent = translate('purchase.purchaseNow');
    pricingCards[3].querySelector('.buy-btn').setAttribute('onclick', `checkAuthBeforePurchase('${translate('purchase.plans.lifetime')}', ${getPrice('lifetime')})`);
    
    // Modal
    document.querySelector('.modal-header h2').textContent = translate('modal.title');
    document.querySelector('.promo-input-section label').textContent = translate('modal.promoLabel');
    document.querySelector('#promoCode').placeholder = translate('modal.promoPlaceholder');
    document.querySelector('.apply-btn').textContent = translate('modal.apply');
    document.querySelectorAll('.price-row span')[0].textContent = translate('modal.originalPrice');
    document.querySelectorAll('.price-row.discount span')[0].textContent = translate('modal.discount');
    document.querySelectorAll('.price-row.total span')[0].textContent = translate('modal.total');
    document.querySelector('.modal-buy-btn').innerHTML = '<i data-lucide="shopping-cart"></i> ' + translate('modal.buyNow');
    
    // Footer
    document.querySelector('.footer .brand').textContent = translate('footer.brand');
    document.querySelector('.footer .rights').textContent = translate('footer.rights');
    
    lucide.createIcons();
}

function updateFeaturesList(card, features) {
    const featuresList = card.querySelector('.features-list');
    featuresList.innerHTML = '';
    
    features.forEach(feature => {
        const li = document.createElement('li');
        li.innerHTML = `<i data-lucide="check"></i> ${translate('purchase.features.' + feature)}`;
        featuresList.appendChild(li);
    });
}

function updatePrices() {
    // This function is called when modal opens to update prices
}
