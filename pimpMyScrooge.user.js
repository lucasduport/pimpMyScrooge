// ==UserScript==
// @name         PimpMyScrooge
// @namespace    https://scrooge.assistants.epita.fr/*
// @version      1.1
// @description  Quick search bar + QR code scanner + Check user
// @match        https://scrooge.assistants.epita.fr/*
// @grant        GM_xmlhttpRequest
// @connect      cri.epita.fr
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/lucasduport/pimpMyScrooge/main/pimpMyScrooge.user.js
// @downloadURL  https://raw.githubusercontent.com/lucasduport/pimpMyScrooge/main/pimpMyScrooge.user.js
// ==/UserScript==

(() => {
    'use strict';

    const domain = '@epita.fr';

    // Load jsQR library dynamically
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js';
    script.onload = createBar;
    document.head.appendChild(script);

    function createBar() {
        if (window.location.href.includes("basket")) return;

        const container = document.createElement('div');
        container.id = 'epita-quick-login-container';
        Object.assign(container.style, {
            position: 'fixed',
            top: '0',
            left: '0',
            width: '100%',
            zIndex: 99999,
            background: 'rgba(255,255,255,0.95)',
            borderBottom: '1px solid rgba(0,0,0,0.12)',
            padding: '12px 16px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
            fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'stretch',
            boxSizing: 'border-box',
            gap: '8px'
        });

        // --- Search bar ---
        const searchBar = document.createElement('div');
        Object.assign(searchBar.style, { display: 'flex', alignItems: 'center', gap: '12px' });

        const label = document.createElement('label');
        label.textContent = 'Login:';
        label.style.fontSize = '14px';
        label.style.color = '#111';
        label.htmlFor = 'epita-login-input';
        searchBar.appendChild(label);

        const input = document.createElement('input');
        input.id = 'epita-login-input';
        input.type = 'text';
        input.placeholder = 'studentlogin (no @epita.fr)';
        Object.assign(input.style, {
            padding: '8px 12px',
            borderRadius: '6px',
            border: '1px solid rgba(0,0,0,0.12)',
            fontSize: '14px',
            outline: 'none',
            flex: '1'
        });
        searchBar.appendChild(input);

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = 'Go';
        Object.assign(btn.style, {
            padding: '8px 14px',
            borderRadius: '6px',
            border: 'none',
            background: '#0b5fff',
            color: 'white',
            cursor: 'pointer',
            fontSize: '14px'
        });
        searchBar.appendChild(btn);

        container.appendChild(searchBar);

        // --- Big QR scan button ---
        const scanBtn = document.createElement('button');
        scanBtn.type = 'button';
        scanBtn.textContent = '📷 Scan QR Code';
        Object.assign(scanBtn.style, {
            padding: '14px',
            borderRadius: '8px',
            border: 'none',
            background: '#00b300',
            color: 'white',
            cursor: 'pointer',
            fontSize: '16px',
            fontWeight: 'bold',
            width: '100%'
        });
        container.appendChild(scanBtn);

        // --- Message area ---
        const msg = document.createElement('div');
        Object.assign(msg.style, {
            fontSize: '12px',
            color: '#d00',
            textAlign: 'center'
        });
        container.appendChild(msg);

        document.body.appendChild(container);
        document.body.style.paddingTop = container.offsetHeight + 'px';

        document.addEventListener('keydown', e => {
            if (e.key === 'Escape' && container.parentNode) container.parentNode.removeChild(container);
        });

        async function checkAndSubmit(val) {
            if (!val) return;
            if (val.includes('@')) val = val.split('@')[0];
            const email = val + domain;

            msg.textContent = 'Vérification en cours…';

            GM_xmlhttpRequest({
                method: 'GET',
                url: `https://cri.epita.fr/users/${val}`,
                onload: function(response) {
                    if (response.status === 404) {
                        msg.textContent = `Utilisateur "${val}" n'existe pas.`;
                        input.focus();
                        return;
                    }
                    msg.textContent = '';
                    input.value = val;
                    submitForm(email);
                },
                onerror: function() {
                    msg.textContent = 'Impossible de vérifier l’utilisateur.';
                }
            });
        }

        function submitForm(email) {
            let form = document.querySelector('form');
            if (!form) {
                const clientInput = document.querySelector('input[name="client"], input#client');
                if (clientInput?.form) form = clientInput.form;
            }
            if (!form) {
                form = document.createElement('form');
                form.style.display = 'none';
                form.method = 'post';
                form.action = window.location.href;
                document.body.appendChild(form);
            }

            try { form.setAttribute('data-login', email); } catch {}

            let clientField = form.querySelector('input[name="client"]');
            if (!clientField) {
                clientField = document.createElement('input');
                clientField.type = 'hidden';
                clientField.name = 'client';
                form.appendChild(clientField);
            }
            clientField.value = email;

            const visibleLogin = document.querySelector('input[type="email"], input[type="text"].login, input.login, input[name="login"], input[name="email"]');
            if (visibleLogin) visibleLogin.value = email;

            try { form.submit(); }
            catch (err) {
                const submitBtn = form.querySelector('button[type="submit"], input[type="submit"]');
                if (submitBtn) submitBtn.click();
            }
        }

        btn.addEventListener('click', () => checkAndSubmit(input.value));
        input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); checkAndSubmit(input.value); } });

        // QR scanner
        scanBtn.addEventListener('click', async () => {
            msg.textContent = '';
            const video = document.createElement('video');
            video.setAttribute('playsinline', true);
            Object.assign(video.style, { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', zIndex: 99998, background: '#000' });
            document.body.appendChild(video);

            try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
                video.srcObject = stream;
                await video.play();

                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');

                const tick = () => {
                    if (video.readyState === video.HAVE_ENOUGH_DATA) {
                        canvas.width = video.videoWidth;
                        canvas.height = video.videoHeight;
                        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                        const code = jsQR(imageData.data, canvas.width, canvas.height);
                        if (code) {
                            checkAndSubmit(code.data);
                            stream.getTracks().forEach(track => track.stop());
                            video.remove();
                            return;
                        }
                    }
                    requestAnimationFrame(tick);
                };
                tick();
            } catch (err) {
                msg.textContent = 'Erreur accès caméra';
                video.remove();
            }
        });

        setTimeout(() => input.focus(), 200);
    }

})();
