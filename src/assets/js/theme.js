// Light/dark mode switch in the header. The choice is remembered on this device.
(function () {
    var root = document.documentElement;
    var meta = document.querySelector('meta[name="theme-color"]');
    function label() {
        var dark = root.getAttribute('data-theme') === 'dark';
        document.querySelectorAll('[data-theme-toggle]').forEach(function (b) {
            var t = dark ? 'Switch to light mode' : 'Switch to dark mode';
            b.setAttribute('aria-label', t); b.removeAttribute('title'); b.setAttribute('aria-pressed', dark ? 'true' : 'false');
        });
    }
    function set(t, save) {
        root.setAttribute('data-theme', t);
        if (meta) meta.content = t === 'dark' ? '#161412' : '#f6f4ef';
        if (save) { try { localStorage.setItem('viko-theme', t); } catch (e) {} }
        label();
    }
    document.addEventListener('click', function (e) {
        var b = e.target.closest('[data-theme-toggle]');
        if (!b) return;
        var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        root.classList.add('theme-anim');
        set(next, true);
        setTimeout(function () { root.classList.remove('theme-anim'); }, 350);
        if (window.gtag) gtag('event', 'theme_switch', { theme: next });
    });
    // Follow the device setting until the reader picks one.
    try {
        var mq = matchMedia('(prefers-color-scheme: dark)');
        mq.addEventListener('change', function (e) { if (!localStorage.getItem('viko-theme')) set(e.matches ? 'dark' : 'light', false); });
    } catch (e) {}
    label();
})();
