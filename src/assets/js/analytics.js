// Viko analytics: cookie choice for UK/EU visitors, and the clicks that lead to enquiries.
(function () {
    if (!window.gtag) return;
    var KEY = 'viko-consent';
    var box = document.getElementById('cookie-bar');

    function stored() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
    function save(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }
    // The banner is only needed where the law asks for consent first (UK, EU, EEA, Switzerland).
    function inEurope() {
        try { return /^Europe\//.test(Intl.DateTimeFormat().resolvedOptions().timeZone || ''); } catch (e) { return false; }
    }
    function show() { if (box) { box.hidden = false; document.body.classList.add('has-cookie-bar'); } }
    function hide() { if (box) { box.hidden = true; document.body.classList.remove('has-cookie-bar'); } }

    if (box) {
        if (!stored() && inEurope()) show();
        box.addEventListener('click', function (e) {
            var b = e.target.closest('[data-consent]');
            if (!b) return;
            var yes = b.getAttribute('data-consent') === 'yes';
            save(yes ? 'yes' : 'no');
            gtag('consent', 'update', { analytics_storage: yes ? 'granted' : 'denied' });
            hide();
        });
    }
    document.addEventListener('click', function (e) {
        if (e.target.closest('[data-consent-open]')) show();
    });

    // Clicks that matter for enquiries.
    function track(name, params) { gtag('event', name, params || {}); }
    document.addEventListener('click', function (e) {
        var el = e.target.closest('a, button');
        if (!el) return;
        var href = el.getAttribute('href') || '';
        var where = el.closest('header') ? 'header' : el.closest('.mcta') ? 'mobile_bar' : el.closest('footer') ? 'footer' : el.closest('article') ? 'article' : 'page';
        if (el.hasAttribute('data-package')) track('select_package', { package_id: el.getAttribute('data-package'), location: where });
        if (/wa\.me|whatsapp\.com/.test(href)) track('whatsapp_click', { location: where });
        else if (el.id === 'open-calendar' || /calendly\.com/.test(href) || /#booking$/.test(href)) track('book_call_click', { location: where });
        else if (/upwork\.com/.test(href)) track('upwork_click', { location: where });
        else if (/^mailto:/.test(href)) track('email_click', { location: where });
    });

    // A call actually booked in the Calendly window.
    window.addEventListener('message', function (e) {
        if (/calendly\.com$/.test((function () { try { return new URL(e.origin).hostname; } catch (x) { return ''; } })()) &&
            e.data && e.data.event === 'calendly.event_scheduled') {
            track('generate_lead', { method: 'calendly' });
        }
    });
})();
