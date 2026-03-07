document.addEventListener('DOMContentLoaded', () => {
    translateSoonPage();
});

function translateSoonPage() {
    // Navigation
    document.querySelectorAll('.nav-links a')[0].textContent = translate('nav.features');
    document.querySelectorAll('.nav-links a')[1].textContent = translate('nav.bypasses');
    document.querySelectorAll('.nav-links a')[2].textContent = translate('nav.purchase');
    
    // Soon Content
    document.querySelector('.soon-title').textContent = translate('soon.title');
    document.querySelector('.soon-description').textContent = translate('soon.description');
    
    const soonFeatures = document.querySelectorAll('.soon-feature span');
    soonFeatures[0].textContent = translate('soon.features.secure');
    soonFeatures[1].textContent = translate('soon.features.multiple');
    soonFeatures[2].textContent = translate('soon.features.instant');
    
    document.querySelector('.back-btn').innerHTML = '<i data-lucide="arrow-left"></i> ' + translate('soon.back');
    
    // Footer
    document.querySelector('.footer .brand').textContent = translate('footer.brand');
    document.querySelector('.footer .rights').textContent = translate('footer.rights');
    
    lucide.createIcons();
}
