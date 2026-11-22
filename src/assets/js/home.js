// Homepage behaviour: booking calendar popup and the contact form.
(function () {
    var cfg = window.VIKO || {};

    // ----- Calendar popup -----
    var modal = document.getElementById('calendlyModal');
    var frame = document.getElementById('calendlyFrame');
    var lastFocus = null;

    function openCalendar() {
        lastFocus = document.activeElement;
        frame.innerHTML = '<iframe title="Book a strategy call" src="' + cfg.calendly +
            '?embed_domain=' + encodeURIComponent(location.hostname) + '&embed_type=Inline" ' +
            'allow="clipboard-write; encrypted-media; fullscreen"></iframe>';
        modal.classList.add('active');
        document.getElementById('close-calendar').focus();
    }
    function closeCalendar() {
        modal.classList.remove('active');
        frame.innerHTML = '';
        if (lastFocus) lastFocus.focus();
    }
    document.getElementById('open-calendar').addEventListener('click', openCalendar);
    document.getElementById('close-calendar').addEventListener('click', closeCalendar);
    modal.addEventListener('click', function (e) { if (e.target === modal) closeCalendar(); });
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && modal.classList.contains('active')) closeCalendar();
    });

    // ----- Contact form -----
    var form = document.getElementById('contact-form');
    var status = document.getElementById('form-status');

    function whatsappLink(text) {
        return 'https://wa.me/' + cfg.whatsapp + '?text=' + encodeURIComponent(text);
    }
    function showStatus(html, isError) {
        status.innerHTML = html;
        status.classList.toggle('is-error', !!isError);
        status.hidden = false;
    }

    form.addEventListener('submit', function (event) {
        event.preventDefault();
        var button = form.querySelector('button[type="submit"]');
        var original = button.innerHTML;
        var name = form.elements.name.value.trim();
        var email = form.elements.email.value.trim();
        var message = form.elements.message.value.trim();

        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
        button.disabled = true;
        status.hidden = true;

        fetch('https://api.web3forms.com/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({
                access_key: cfg.formKey,
                name: name,
                email: email,
                message: message,
                from_name: 'Viko Contact Form',
                subject: 'New enquiry from ' + name
            })
        })
            .then(function (response) { return response.json(); })
            .then(function (data) {
                if (!data.success) throw new Error(data.message || 'Form submission failed');
                location.href = cfg.thankYou;
            })
            .catch(function () {
                // Tell the visitor the truth and give them another way to reach us.
                button.innerHTML = original;
                button.disabled = false;
                showStatus('Sorry, your message could not be sent. Please try again, ' +
                    '<a href="' + whatsappLink("Hi Viko, I'm " + name + '. ' + message) + '" target="_blank" rel="noopener">send it on WhatsApp</a>' +
                    ' or email <a href="mailto:' + cfg.email + '">' + cfg.email + '</a>.', true);
            });
    });

    document.getElementById('form-wa-btn').addEventListener('click', function () {
        var consent = document.getElementById('consent');
        if (!consent.reportValidity()) return;
        var name = form.elements.name.value.trim();
        var message = form.elements.message.value.trim();
        var text = name && message ? "Hi Viko, I'm " + name + '. ' + message : (message || cfg.whatsappText);
        window.open(whatsappLink(text), '_blank', 'noopener');
    });

    // ----- "Book this package": pre-fill the form and the WhatsApp message -----
    function choosePackage(id) {
        var label = (cfg.packages || {})[id];
        if (!label) return;
        var msg = form.elements.message;
        var line = "I'm interested in the " + label + ". ";
        if (!msg.value || /^I'm interested in the /.test(msg.value)) msg.value = line + 'About my brand: ';
        var wa = document.querySelector('#booking .btn-wa');
        if (wa) wa.href = whatsappLink('Hi Viko, ' + line.trim());
        var note = document.getElementById('package-note');
        if (!note) {
            note = document.createElement('p');
            note.id = 'package-note';
            note.className = 'package-note';
            form.parentNode.insertBefore(note, form.parentNode.querySelector('.booking-btn-group'));
        }
        note.textContent = 'You picked the ' + label + '. Book a call, message on WhatsApp, or send the form below: it already mentions the package.';
    }
    document.addEventListener('click', function (e) {
        var link = e.target.closest && e.target.closest('[data-package]');
        if (!link) return;
        choosePackage(link.getAttribute('data-package'));
    });
    var picked = new URLSearchParams(location.search).get('package');
    if (picked) choosePackage(picked);
})();
