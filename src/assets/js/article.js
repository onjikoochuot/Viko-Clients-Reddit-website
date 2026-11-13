// Article page: reading progress, table-of-contents highlighting,
// click-to-enlarge images and the "copy link" button.
(function () {
    // ----- Reading progress -----
    var bar = document.querySelector('.read-progress span');
    var body = document.querySelector('.post-content');
    function updateProgress() {
        if (!bar || !body) return;
        var rect = body.getBoundingClientRect();
        var total = rect.height - window.innerHeight * 0.6;
        var done = Math.min(1, Math.max(0, -rect.top / Math.max(1, total)));
        bar.style.transform = 'scaleX(' + done + ')';
    }
    window.addEventListener('scroll', updateProgress, { passive: true });
    window.addEventListener('resize', updateProgress);
    updateProgress();

    // ----- Table of contents: highlight the section being read -----
    var tocLinks = Array.prototype.slice.call(document.querySelectorAll('.article-toc nav a'));
    if (tocLinks.length && 'IntersectionObserver' in window) {
        var byId = {};
        tocLinks.forEach(function (a) { byId[decodeURIComponent(a.hash.slice(1))] = a; });
        var observer = new IntersectionObserver(function (entries) {
            entries.forEach(function (e) {
                if (e.isIntersecting && byId[e.target.id]) {
                    tocLinks.forEach(function (a) { a.classList.remove('is-active'); });
                    byId[e.target.id].classList.add('is-active');
                }
            });
        }, { rootMargin: '-90px 0px -70% 0px' });
        Object.keys(byId).forEach(function (id) {
            var h = document.getElementById(id);
            if (h) observer.observe(h);
        });
    }
    // Collapse the contents box on small screens.
    var tocDetails = document.querySelector('.article-toc details');
    if (tocDetails && window.matchMedia('(max-width: 1100px)').matches) tocDetails.open = false;

    // ----- Click an image to see it larger -----
    var dialog = document.getElementById('lightbox');
    if (dialog && dialog.showModal) {
        var big = dialog.querySelector('img');
        var cap = dialog.querySelector('.lightbox-caption');
        document.querySelectorAll('.post-content img, .article-cover img').forEach(function (img) {
            if (img.closest('a')) return;
            img.classList.add('zoomable');
            img.addEventListener('click', function () {
                big.src = img.currentSrc || img.src;
                big.alt = img.alt;
                var fc = img.closest('figure') && img.closest('figure').querySelector('figcaption');
                cap.textContent = fc ? fc.textContent : (img.alt || '');
                dialog.showModal();
            });
        });
        dialog.addEventListener('click', function (e) {
            if (e.target === dialog || e.target.classList.contains('lightbox-close')) dialog.close();
        });
    }

    // ----- Copy link -----
    var copy = document.querySelector('.share-copy');
    if (copy) {
        copy.addEventListener('click', function () {
            var label = copy.querySelector('span');
            var done = function () { label.textContent = 'Copied'; setTimeout(function () { label.textContent = 'Copy link'; }, 1800); };
            if (navigator.clipboard) navigator.clipboard.writeText(copy.dataset.url).then(done);
            else { window.prompt('Copy this link:', copy.dataset.url); }
        });
    }
})();
