// Free PDF sign-up: sends the details to Viko (Web3Forms), then starts the download.
(function () {
    var forms = document.querySelectorAll('form[data-leadmagnet]');
    if (!forms.length) return;
    var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

    function download(url) {
        var a = document.createElement('a');
        a.href = url; a.download = '';
        document.body.appendChild(a); a.click(); a.remove();
    }

    Array.prototype.forEach.call(forms, function (form) {
        var error = form.querySelector('.lm-error');
        var done = form.querySelector('.lm-done');
        form.addEventListener('submit', function (e) {
            e.preventDefault();
            error.hidden = true;
            var email = form.elements.email.value.trim();
            if (!EMAIL.test(email)) {
                error.textContent = 'Please enter a valid email address.';
                error.hidden = false;
                form.elements.email.focus();
                return;
            }
            if (form.elements.botcheck && form.elements.botcheck.checked) return;
            var button = form.querySelector('button[type="submit"]');
            var original = button.innerHTML;
            button.disabled = true;
            button.innerHTML = '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i> One moment…';
            var name = form.elements.name ? form.elements.name.value.trim() : '';
            var website = form.elements.website ? form.elements.website.value.trim() : '';
            var updates = form.elements.updates && form.elements.updates.checked ? 'Yes' : 'No';
            var pdf = form.getAttribute('data-pdf');

            var finish = function (ok) {
                form.classList.add('is-done');
                done.hidden = false;
                Array.prototype.forEach.call(form.querySelectorAll('.lm-fields, .lm-consent, button[type="submit"], .lm-note'), function (el) { el.hidden = true; });
                download(pdf);
                if (window.gtag) gtag('event', 'sign_up', { method: 'pdf_' + (form.getAttribute('data-id') || 'download'), location: form.classList.contains('lm-form--compact') ? 'article' : 'landing_page', saved: ok ? 'yes' : 'no' });
            };

            fetch('https://api.web3forms.com/submit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                body: JSON.stringify({
                    access_key: form.getAttribute('data-key'),
                    subject: 'New PDF download: ' + (form.getAttribute('data-title') || 'free PDF'),
                    from_name: 'Viko website',
                    email: email,
                    name: name || '(not given)',
                    website: website || '(not given)',
                    wants_tips: updates,
                    pdf: form.getAttribute('data-title') || '',
                    signed_up_from: form.getAttribute('data-source') || location.pathname
                })
            })
                .then(function (r) { return r.json(); })
                .then(function (d) { finish(!!(d && d.success)); })
                .catch(function () { finish(false); }) // never block the reader from their download
                .then(function () { button.disabled = false; button.innerHTML = original; });
        });
    });
})();
