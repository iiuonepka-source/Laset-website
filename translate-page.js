document.addEventListener('DOMContentLoaded', () => {
    translatePage();
});

function translatePage() {
    // Navigation
    document.querySelector('.nav-links a[href="#features"]').textContent = translate('nav.features');
    document.querySelector('.nav-links a[href="#bypass"]').textContent = translate('nav.bypasses');
    document.querySelector('.nav-links a[href="purchase.html"]').textContent = translate('nav.purchase');
    
    // Hero Section
    const heroTitle = document.querySelector('.hero h1');
    if (heroTitle) {
        heroTitle.textContent = translate('hero.title');
        heroTitle.setAttribute('data-text', translate('hero.title'));
    }
    
    document.querySelector('.subtitle').textContent = translate('hero.subtitle');
    document.querySelector('.description').innerHTML = translate('hero.description');
    document.querySelector('.btn-primary').innerHTML = translate('hero.getStarted') + ' <i data-lucide="arrow-right"></i>';
    document.querySelector('.btn-secondary').textContent = translate('hero.learnMore');
    
    // Features Section
    document.querySelector('#features .section-header h2').innerHTML = translate('features.title');
    
    const featureCards = document.querySelectorAll('.feature-card');
    featureCards[0].querySelector('h3').textContent = translate('features.ssVerified.title');
    featureCards[0].querySelector('p').textContent = translate('features.ssVerified.desc');
    
    featureCards[1].querySelector('h3').textContent = translate('features.fpsDrop.title');
    featureCards[1].querySelector('p').textContent = translate('features.fpsDrop.desc');
    
    featureCards[2].querySelector('h3').textContent = translate('features.multiVersion.title');
    featureCards[2].querySelector('p').textContent = translate('features.multiVersion.desc');
    
    featureCards[3].querySelector('h3').textContent = translate('features.gui.title');
    featureCards[3].querySelector('p').textContent = translate('features.gui.desc');
    
    // Bypass Section
    document.querySelector('#bypass .bypass-content h2').textContent = translate('bypass.title');
    
    // FAQ Section
    document.querySelector('#faq .section-header h2').innerHTML = translate('faq.title');
    
    const faqItems = document.querySelectorAll('.faq-item');
    faqItems[0].querySelector('.faq-question span').textContent = translate('faq.q1.question');
    faqItems[0].querySelector('.faq-answer').textContent = translate('faq.q1.answer');
    
    faqItems[1].querySelector('.faq-question span').textContent = translate('faq.q2.question');
    faqItems[1].querySelector('.faq-answer').textContent = translate('faq.q2.answer');
    
    faqItems[2].querySelector('.faq-question span').textContent = translate('faq.q3.question');
    faqItems[2].querySelector('.faq-answer').textContent = translate('faq.q3.answer');
    
    faqItems[3].querySelector('.faq-question span').textContent = translate('faq.q4.question');
    faqItems[3].querySelector('.faq-answer').textContent = translate('faq.q4.answer');
    
    faqItems[4].querySelector('.faq-question span').textContent = translate('faq.q5.question');
    faqItems[4].querySelector('.faq-answer').textContent = translate('faq.q5.answer');
    
    // Discord Section
    document.querySelector('#discord .discord-info h2').innerHTML = translate('discord.title');
    document.querySelector('#discord .discord-info > p').textContent = translate('discord.subtitle');
    document.querySelector('.beta-badge span').innerHTML = translate('discord.betaBadge');
    
    // Footer
    document.querySelector('.footer .brand').textContent = translate('footer.brand');
    document.querySelector('.footer .rights').textContent = translate('footer.rights');
    
    // Reinitialize icons
    lucide.createIcons();
}
