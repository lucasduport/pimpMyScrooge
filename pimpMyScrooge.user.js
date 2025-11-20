// ==UserScript==
// @name         PimpMyScrooge
// @namespace    https://scrooge.assistants.epita.fr/*
// @version      2.3
// @description  Quick search bar + QR code scanner + Check user + Highlight my login + Autocomplete + Hardcore Mode
// @match        https://scrooge.assistants.epita.fr/kiosk/group/*
// @match        https://scrooge.assistants.epita.fr/kiosk/basket/*
// @grant        GM_xmlhttpRequest
// @connect      cri.epita.fr
// @require      https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/lucasduport/pimpMyScrooge/main/pimpMyScrooge.user.js
// @downloadURL  https://raw.githubusercontent.com/lucasduport/pimpMyScrooge/main/pimpMyScrooge.user.js
// ==/UserScript==

(() => {
    'use strict';

    const domain = '@epita.fr';
    let hardcoreMode = false;
    let hardcoreInterval = null;

    // Inject animation styles
    const style = document.createElement('style');
    style.textContent = `
        @keyframes fadeIn {
            from {
                opacity: 0;
                transform: translate(-50%, -50%) scale(0.9);
            }
            to {
                opacity: 1;
                transform: translate(-50%, -50%) scale(1);
            }
        }
        .member-list form.form-wrapper {
            transform: scale(0.75);
            margin: -8px;
        }
        .member-list form.form-wrapper:hover {
            transform: scale(0.82);
        }
        .article-tile-group {
            border: 1px solid rgba(0,0,0,0.08) !important;
            border-radius: 16px !important;
            padding: 20px !important;
            margin-bottom: 20px !important;
        }
        .article-tile-item {
            border-radius: 12px !important;
            overflow: hidden !important;
            margin: 8px !important;
            transform: scale(1.15) !important;
        }
        .article-tile-item img {
            transform: scale(1.2) !important;
        }
    `;
    document.head.appendChild(style);

    // Utility functions
    const $ = (sel, ctx = document) => ctx.querySelector(sel);
    const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
    const css = (el, styles) => Object.assign(el.style, styles);
    const shuffleArray = arr => {
        const s = [...arr];
        for (let i = s.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [s[i], s[j]] = [s[j], s[i]];
        }
        return s;
    };
    const shuffleElements = (parent, selector) => {
        const els = $$(selector, parent);
        if (els.length) shuffleArray(els).forEach(el => parent.appendChild(el));
    };

    async function ensureJsQR() {
        if (typeof jsQR !== 'undefined') return console.log('jsQR loaded via @require'), true;
        console.log('jsQR not found via @require, trying fetch fallback...');
        try {
            eval(await (await fetch('https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js')).text());
            await new Promise(r => setTimeout(r, 100));
            if (typeof jsQR !== 'undefined') return console.log('jsQR loaded via fetch fallback'), true;
        } catch (e) {
            console.error('Failed to load jsQR via fetch:', e);
        }
        return false;
    }

    function toggleHardcoreMode() {
        hardcoreMode = !hardcoreMode;
        const btn = $('#hardcore-mode-btn');
        
        if (hardcoreMode) {
            hardcoreInterval = setInterval(() => {
                const ml = $('.member-list');
                if (ml) shuffleElements(ml, 'form.form-wrapper');
                $$('.article-tile-group').forEach(g => shuffleElements(g, '.article-tile-item'));
            }, 500);
            console.log('🔥 HARDCORE MODE ACTIVATED 🔥');
        } else {
            clearInterval(hardcoreInterval);
            hardcoreInterval = null;
            console.log('Hardcore mode deactivated');
        }
        
        if (btn) css(btn, hardcoreMode ? {
            background: 'linear-gradient(135deg, #ff3b30 0%, #ff9500 100%)',
            color: 'white',
            boxShadow: '0 4px 20px rgba(255,59,48,0.4)'
        } : {
            background: 'rgba(255,255,255,0.95)',
            color: '#8e8e93',
            boxShadow: '0 2px 12px rgba(0,0,0,0.08)'
        });
    }

    // Initialize
    const isBasketPage = location.pathname.includes('/kiosk/basket/');
    
    if (isBasketPage) {
        enhanceProductDisplay();
        createBasketControls();
        createHardcoreButton();
    } else {
        ensureJsQR().then(success => {
            if (!success) console.error('Failed to load jsQR');
            createBar();
        });
    }

    function createBar() {
        const container = document.createElement('div');
        container.id = 'epita-quick-login-container';
        css(container, {
            position: 'fixed', top: '0', left: '50%', transform: 'translateX(-50%)',
            width: '100%', maxWidth: '800px', zIndex: 99999,
            padding: '20px 24px 0 24px',
            fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, sans-serif',
            display: 'flex', flexDirection: 'column', alignItems: 'stretch', boxSizing: 'border-box', gap: '16px'
        });

        createUserInterface(container);
        document.body.appendChild(container);
        
        const updatePadding = () => {
            const ml = $('.member-list');
            if (ml) ml.style.paddingTop = (container.offsetHeight + 20) + 'px';
        };
        
        new MutationObserver(() => {
            if ($('.member-list')) {
                updatePadding();
                enhanceMemberAvatars();
            }
        }).observe(document.body, { childList: true, subtree: true });
        
        setTimeout(() => { updatePadding(); enhanceMemberAvatars(); }, 50);
        setTimeout(() => { updatePadding(); enhanceMemberAvatars(); }, 300);
        window.addEventListener('resize', updatePadding);
    }

    async function createUserInterface(container) {
        let myLogin = null, userAvatarUrl = null;
        
        try {
            const url = (await fetch('/me')).url;
            const match = url.match(/\/profile\/([^\/]+)/);
            if (match) {
                myLogin = match[1];
                const myForm = $(`form[data-login="${myLogin}"]`);
                const avatarBtn = myForm?.querySelector('.member-avatar');
                const urlMatch = avatarBtn?.style.backgroundImage.match(/url\(['"]?([^'"]+)['"]?\)/);
                if (urlMatch) userAvatarUrl = urlMatch[1];
            }
        } catch (error) {
            console.error('Error fetching user info:', error);
        }

        const mainRow = document.createElement('div');
        css(mainRow, { display: 'flex', alignItems: 'center', gap: '16px', width: '100%' });

        const searchBar = document.createElement('div');
        css(searchBar, { display: 'flex', alignItems: 'center', gap: '12px', flex: '1' });

        const input = document.createElement('input');
        input.id = 'epita-login-input';
        input.type = 'text';
        input.placeholder = 'xavier.login';
        input.setAttribute('list', 'login-datalist');
        css(input, {
            padding: '14px 18px', borderRadius: '10px', border: '1.5px solid rgba(0,0,0,0.08)',
            fontSize: '16px', outline: 'none', flex: '1', background: 'white',
            transition: 'all 0.2s ease', fontWeight: '400', color: '#1d1d1f'
        });
        
        const datalist = document.createElement('datalist');
        datalist.id = 'login-datalist';
        $$('.member-list form.form-wrapper')
            .map(f => f.getAttribute('data-login'))
            .filter(Boolean)
            .sort()
            .forEach(login => {
                const opt = document.createElement('option');
                opt.value = login;
                datalist.appendChild(opt);
            });
        document.body.appendChild(datalist);
        
        input.addEventListener('focus', () => css(input, { borderColor: '#007aff', boxShadow: '0 0 0 4px rgba(0,122,255,0.1)' }));
        input.addEventListener('blur', () => css(input, { borderColor: 'rgba(0,0,0,0.08)', boxShadow: 'none' }));
        searchBar.appendChild(input);

        const createButton = (text, styles, hoverStyles) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = text;
            css(btn, styles);
            btn.addEventListener('mouseenter', () => css(btn, hoverStyles));
            btn.addEventListener('mouseleave', () => css(btn, styles));
            return btn;
        };

        const btn = createButton('Go', {
            padding: '14px 32px', borderRadius: '10px', border: 'none', background: '#007aff',
            color: 'white', cursor: 'pointer', fontSize: '16px', fontWeight: '600',
            transition: 'all 0.2s ease', boxShadow: '0 2px 8px rgba(0,122,255,0.3)', flexShrink: '0'
        }, {
            background: '#0051d5', transform: 'translateY(-1px)', boxShadow: '0 4px 12px rgba(0,122,255,0.4)'
        });
        searchBar.appendChild(btn);
        mainRow.appendChild(searchBar);

        const scanBtn = document.createElement('button');
        scanBtn.type = 'button';
        scanBtn.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>`;
        scanBtn.title = 'Scan QR Code';
        css(scanBtn, {
            padding: '14px 24px', borderRadius: '10px', border: 'none',
            background: 'linear-gradient(135deg, #34c759 0%, #30d158 100%)', color: 'white',
            cursor: 'pointer', transition: 'all 0.2s ease', boxShadow: '0 2px 8px rgba(52,199,89,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: '0'
        });
        scanBtn.addEventListener('mouseenter', () => css(scanBtn, { transform: 'translateY(-1px)', boxShadow: '0 4px 12px rgba(52,199,89,0.4)' }));
        scanBtn.addEventListener('mouseleave', () => css(scanBtn, { transform: 'translateY(0)', boxShadow: '0 2px 8px rgba(52,199,89,0.3)' }));
        mainRow.appendChild(scanBtn);

        const hardcoreBtn = document.createElement('button');
        hardcoreBtn.id = 'hardcore-mode-btn';
        hardcoreBtn.type = 'button';
        hardcoreBtn.title = 'Hardcore Mode';
        hardcoreBtn.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C12 2 7 6 7 11C7 13.76 9.24 16 12 16C14.76 16 17 13.76 17 11C17 6 12 2 12 2Z" /><path d="M12 16C12 16 9 18 9 20.5C9 21.88 10.12 23 11.5 23C12.88 23 14 21.88 14 20.5C14 18 12 16 12 16Z" /></svg>`;
        css(hardcoreBtn, {
            padding: '14px 24px', borderRadius: '10px', border: 'none', background: 'rgba(255,255,255,0.95)',
            color: '#8e8e93', cursor: 'pointer', transition: 'all 0.2s ease',
            boxShadow: '0 2px 12px rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', flexShrink: '0'
        });
        hardcoreBtn.addEventListener('mouseenter', () => css(hardcoreBtn, { transform: 'translateY(-1px)', boxShadow: '0 4px 20px rgba(0,0,0,0.15)' }));
        hardcoreBtn.addEventListener('mouseleave', () => css(hardcoreBtn, { transform: 'translateY(0)', boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }));
        hardcoreBtn.addEventListener('click', toggleHardcoreMode);
        mainRow.appendChild(hardcoreBtn);
        container.appendChild(mainRow);

        btn.addEventListener('click', () => checkAndSubmit(input.value, null, input));
        
        let lastValue = '';
        input.addEventListener('input', () => lastValue = input.value);
        input.addEventListener('keydown', e => {
            if (e.key === 'Enter') {
                e.preventDefault();
                setTimeout(() => checkAndSubmit(input.value, null, input), 50);
            }
            if (e.key === 'Tab') {
                setTimeout(() => {
                    if (input.value !== lastValue && input.value.trim() !== '') {
                        e.preventDefault();
                        lastValue = input.value;
                    }
                }, 10);
            }
        });

        scanBtn.addEventListener('click', () => openCameraScanner(val => checkAndSubmit(val, null, input), null));
        setTimeout(() => input.focus(), 200);
        
        // Insert highlighted profile in member list
        if (userAvatarUrl && myLogin) {
            const insertHighlightedProfile = () => {
                const memberList = $('.member-list');
                if (!memberList || $('#highlighted-profile-row')) return;
                
                // Hide the original profile form
                const myForm = $(`form[data-login="${myLogin}"]`);
                if (myForm) {
                    css(myForm, { display: 'none' });
                }
                
                const highlightedRow = document.createElement('div');
                highlightedRow.id = 'highlighted-profile-row';
                css(highlightedRow, {
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    padding: '20px 0 40px 0',
                    marginBottom: '20px',
                    width: '100%'
                });
                
                const avatarContainer = document.createElement('div');
                css(avatarContainer, {
                    width: '180px',
                    height: '180px',
                    borderRadius: '24px',
                    backgroundImage: `url('${userAvatarUrl}')`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    boxShadow: '0 8px 32px rgba(0,122,255,0.25)',
                    border: '4px solid rgba(0,122,255,0.3)',
                    cursor: 'pointer',
                    transition: 'all 0.3s ease',
                    position: 'relative'
                });
                
                const loginLabel = document.createElement('div');
                loginLabel.textContent = myLogin;
                css(loginLabel, {
                    position: 'absolute',
                    bottom: '-28px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    fontSize: '14px',
                    fontWeight: '600',
                    color: '#007aff',
                    whiteSpace: 'nowrap',
                    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, sans-serif'
                });
                avatarContainer.appendChild(loginLabel);
                
                if (myForm) {
                    avatarContainer.addEventListener('click', () => myForm.querySelector('button').click());
                    avatarContainer.addEventListener('mouseenter', () => css(avatarContainer, {
                        transform: 'scale(1.08) translateY(-4px)',
                        boxShadow: '0 12px 48px rgba(0,122,255,0.4)',
                        borderColor: 'rgba(0,122,255,0.5)'
                    }));
                    avatarContainer.addEventListener('mouseleave', () => css(avatarContainer, {
                        transform: 'scale(1) translateY(0)',
                        boxShadow: '0 8px 32px rgba(0,122,255,0.25)',
                        borderColor: 'rgba(0,122,255,0.3)'
                    }));
                }
                
                highlightedRow.appendChild(avatarContainer);
                memberList.insertBefore(highlightedRow, memberList.firstChild);
            };
            
            setTimeout(insertHighlightedProfile, 100);
            setTimeout(insertHighlightedProfile, 500);
            
            new MutationObserver(() => {
                if ($('.member-list') && !$('#highlighted-profile-row')) {
                    insertHighlightedProfile();
                }
            }).observe(document.body, { childList: true, subtree: true });
        }
    }

    function enhanceMemberAvatars() {
        $$('.member-list form.form-wrapper').forEach(form => {
            const login = form.getAttribute('data-login');
            if (!login || form.querySelector('.pimp-login-label')) return;
            
            const button = form.querySelector('.member-avatar');
            if (button) {
                css(button, { transition: 'transform 0.3s ease, box-shadow 0.3s ease, filter 0.3s ease', boxShadow: '0 2px 12px rgba(0,0,0,0.08)', borderRadius: '8px' });
                button.addEventListener('mouseenter', () => css(button, { transform: 'scale(1.1)', boxShadow: '0 8px 24px rgba(0,0,0,0.2)', filter: 'brightness(1.1)' }));
                button.addEventListener('mouseleave', () => css(button, { transform: 'scale(1)', boxShadow: '0 2px 12px rgba(0,0,0,0.08)', filter: 'brightness(1)' }));
            }
            
            const label = document.createElement('div');
            label.className = 'pimp-login-label';
            label.textContent = login;
            css(label, { position: 'absolute', opacity: '0', pointerEvents: 'none', fontSize: '1px', height: '1px', width: '1px', overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap' });
            form.appendChild(label);
        });
    }

    async function checkAndSubmit(val, msg, input) {
        if (!val) return;
        if (val.includes('@')) val = val.split('@')[0];
        const email = val + domain;

        if (input) {
            input.placeholder = 'Vérification en cours…';
            input.style.borderColor = '#007aff';
        }

        GM_xmlhttpRequest({
            method: 'GET',
            url: `https://cri.epita.fr/users/${val}`,
            onload: res => {
                if (res.status === 404) {
                    if (input) {
                        input.placeholder = `Utilisateur "${val}" n'existe pas.`;
                        input.style.borderColor = '#ff3b30';
                        input.value = '';
                        input.focus();
                    }
                } else {
                    if (input) {
                        input.placeholder = 'xavier.login';
                        input.style.borderColor = 'rgba(0,0,0,0.08)';
                        input.value = val;
                    }
                    submitForm(email);
                }
            },
            onerror: () => {
                if (input) {
                    input.placeholder = 'Impossible de vérifier l\'utilisateur.';
                    input.style.borderColor = '#ff3b30';
                }
            }
        });
    }

    function submitForm(email) {
        let form = $('form') || $('input[name="client"], input#client')?.form;
        if (!form) {
            form = document.createElement('form');
            css(form, { display: 'none' });
            form.method = 'post';
            form.action = location.href;
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

        const visibleLogin = $('input[type="email"], input[type="text"].login, input.login, input[name="login"], input[name="email"]');
        if (visibleLogin) visibleLogin.value = email;

        try { 
            form.submit(); 
        } catch { 
            $('button[type="submit"], input[type="submit"]', form)?.click();
        }
    }

    async function openCameraScanner(checkAndSubmit, msg) {
        if (typeof jsQR === 'undefined') {
            try {
                eval(await (await fetch('https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js')).text());
                await new Promise(r => setTimeout(r, 200));
            } catch (e) {
                console.error('Failed to load jsQR:', e);
            }
            
            if (typeof jsQR === 'undefined') {
                console.error('ERREUR: jsQR impossible à charger.');
                return;
            }
        }
        
        if (!navigator.mediaDevices?.getUserMedia) {
            console.error('Caméra non supportée par ce navigateur.');
            return;
        }

        const overlay = document.createElement('div');
        css(overlay, {
            position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
            background: 'rgba(0,0,0,0.9)', zIndex: 99998,
            display: 'flex', justifyContent: 'center', alignItems: 'center', flexDirection: 'column'
        });
        document.body.appendChild(overlay);

        const video = document.createElement('video');
        video.setAttribute('playsinline', '');
        video.setAttribute('autoplay', '');
        video.setAttribute('muted', '');
        video.muted = true;
        css(video, { width: '90%', maxWidth: '500px', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' });
        overlay.appendChild(video);

        const statusMsg = document.createElement('div');
        statusMsg.textContent = 'Initialisation de la caméra...';
        css(statusMsg, {
            marginTop: '12px', color: 'white', fontSize: '14px', textAlign: 'center',
            padding: '8px', background: 'rgba(0,0,0,0.5)', borderRadius: '6px',
            minHeight: '40px', width: '90%', maxWidth: '500px'
        });
        overlay.appendChild(statusMsg);

        const closeBtn = document.createElement('button');
        closeBtn.textContent = '✖ Fermer';
        css(closeBtn, {
            marginTop: '12px', padding: '10px 16px', fontSize: '14px',
            borderRadius: '8px', border: 'none', background: '#d00',
            color: 'white', cursor: 'pointer'
        });
        overlay.appendChild(closeBtn);

        let stream, scanning = true;

        const startCamera = async () => {
            const constraints = [
                { video: { facingMode: { exact: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } } },
                { video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } } },
                { video: { width: { ideal: 1920 }, height: { ideal: 1080 } } },
                { video: { width: { ideal: 1280 }, height: { ideal: 720 } } },
                { video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } } },
                { video: { width: { ideal: 640 }, height: { ideal: 480 } } },
                { video: true }
            ];

            for (const constraint of constraints) {
                try {
                    stream = await navigator.mediaDevices.getUserMedia(constraint);
                    video.srcObject = stream;
                    
                    await new Promise((resolve, reject) => {
                        video.onloadedmetadata = () => video.play().then(resolve).catch(reject);
                        video.onerror = reject;
                        setTimeout(() => reject(new Error('Timeout')), 5000);
                    });
                    
                    const settings = stream.getVideoTracks()[0].getSettings();
                    console.log('Caméra initialisée:', settings.width + 'x' + settings.height, 'facingMode:', settings.facingMode || 'default');
                    statusMsg.textContent = 'Pointez la caméra vers le QR code';
                    return true;
                } catch (err) {
                    console.log('Tentative échouée:', constraint, err);
                    if (stream) {
                        stream.getTracks().forEach(t => t.stop());
                        stream = null;
                    }
                }
            }
            return false;
        };

        const success = await startCamera();
        if (!success) {
            statusMsg.textContent = 'Erreur d\'accès à la caméra. Vérifiez les permissions.';
            setTimeout(() => overlay.remove(), 2000);
            return;
        }

        const cleanup = () => {
            scanning = false;
            if (stream) {
                stream.getTracks().forEach(t => t.stop());
                stream = null;
            }
            if (overlay.parentNode) overlay.remove();
        };

        closeBtn.addEventListener('click', cleanup);

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        let lastScanTime = 0, scanCount = 0;
        const scanInterval = 150;

        function tick() {
            if (!scanning) return;
            
            const now = Date.now();
            if (video.readyState === video.HAVE_ENOUGH_DATA && now - lastScanTime >= scanInterval) {
                lastScanTime = now;
                scanCount++;
                
                try {
                    const width = video.videoWidth, height = video.videoHeight;
                    
                    if (width > 0 && height > 0) {
                        canvas.width = width;
                        canvas.height = height;
                        ctx.drawImage(video, 0, 0, width, height);
                        const imageData = ctx.getImageData(0, 0, width, height);
                        
                        if (scanCount % 10 === 0) {
                            statusMsg.textContent = `Scan en cours... (${scanCount}) - ${width}x${height}`;
                            statusMsg.style.color = '#fff';
                        }
                        
                        if (typeof jsQR !== 'undefined') {
                            const code = jsQR(imageData.data, width, height, { inversionAttempts: "attemptBoth" });
                            
                            if (code?.data) {
                                statusMsg.textContent = '✓ QR Code scanné ! Login: ' + code.data;
                                statusMsg.style.color = '#0f0';
                                cleanup();
                                setTimeout(() => checkAndSubmit(code.data), 100);
                                return;
                            }
                        } else {
                            statusMsg.textContent = 'ERREUR: jsQR non chargé ! Rafraîchir la page';
                            statusMsg.style.color = '#f00';
                        }
                    } else if (scanCount % 10 === 0) {
                        statusMsg.textContent = `Attente vidéo... (${width}x${height})`;
                        statusMsg.style.color = '#ff0';
                    }
                } catch (err) {
                    console.error('Erreur scan:', err);
                    statusMsg.textContent = 'Erreur: ' + err.message;
                    statusMsg.style.color = '#f00';
                }
            }
            requestAnimationFrame(tick);
        }
        
        setTimeout(() => tick(), 300);
    }

    function createHardcoreButton() {
        const hardcoreBtn = document.createElement('button');
        hardcoreBtn.id = 'hardcore-mode-btn';
        hardcoreBtn.type = 'button';
        hardcoreBtn.title = 'Hardcore Mode';
        hardcoreBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C12 2 7 6 7 11C7 13.76 9.24 16 12 16C14.76 16 17 13.76 17 11C17 6 12 2 12 2Z" /><path d="M12 16C12 16 9 18 9 20.5C9 21.88 10.12 23 11.5 23C12.88 23 14 21.88 14 20.5C14 18 12 16 12 16Z" /></svg>`;
        css(hardcoreBtn, {
            position: 'fixed', top: '20px', right: '20px', padding: '12px', borderRadius: '12px',
            border: 'none', background: 'rgba(255,255,255,0.95)', color: '#8e8e93',
            cursor: 'pointer', transition: 'all 0.2s ease', boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
            zIndex: 100000, display: 'flex', alignItems: 'center', justifyContent: 'center',
            backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
            fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, sans-serif'
        });
        hardcoreBtn.addEventListener('mouseenter', () => css(hardcoreBtn, { transform: 'scale(1.1)', boxShadow: '0 4px 20px rgba(0,0,0,0.15)' }));
        hardcoreBtn.addEventListener('mouseleave', () => css(hardcoreBtn, { transform: 'scale(1)', boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }));
        hardcoreBtn.addEventListener('click', toggleHardcoreMode);
        document.body.appendChild(hardcoreBtn);
    }

    function enhanceProductDisplay() {
        const enhance = product => {
            if (product.dataset.enhanced) return;
            product.dataset.enhanced = 'true';
            
            const price = product.getAttribute('data-price');
            if (!price) return;
            
            const priceTag = document.createElement('div');
            priceTag.textContent = price + ' €';
            css(priceTag, {
                position: 'absolute', bottom: '8px', right: '8px', background: 'rgba(0,0,0,0.75)',
                backdropFilter: 'blur(10px)', color: 'white', padding: '6px 12px', borderRadius: '8px',
                fontSize: '14px', fontWeight: '600',
                fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, sans-serif',
                boxShadow: '0 2px 8px rgba(0,0,0,0.3)', pointerEvents: 'none', zIndex: '10'
            });
            
            css(product, { position: 'relative', borderRadius: '12px', overflow: 'hidden', transition: 'transform 0.2s ease, box-shadow 0.2s ease' });
            product.appendChild(priceTag);
            
            product.addEventListener('mouseenter', () => {
                css(product, { transform: 'translateY(-4px) scale(1.02)', boxShadow: '0 8px 24px rgba(0,0,0,0.15)' });
                priceTag.style.background = 'rgba(0,122,255,0.9)';
            });
            product.addEventListener('mouseleave', () => {
                css(product, { transform: 'translateY(0) scale(1)', boxShadow: '' });
                priceTag.style.background = 'rgba(0,0,0,0.75)';
            });
        };

        new MutationObserver(() => {
            const products = $$('.article-tile-item');
            if (products.length) {
                products.forEach(enhance);
            }
        }).observe(document.body, { childList: true, subtree: true });
        
        setTimeout(() => $$('.article-tile-item').forEach(enhance), 100);
    }

    function createBasketControls() {
        const basketData = { items: {}, total: 0 };

        const basketPanel = document.createElement('div');
        basketPanel.id = 'pimp-basket-panel';
        css(basketPanel, {
            position: 'fixed', bottom: '0', left: '50%', transform: 'translateX(-50%)',
            width: '100%', maxWidth: '800px',
            padding: '20px 24px 0 24px',
            fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, sans-serif',
            zIndex: 99998, display: 'none', flexDirection: 'column', gap: '16px',
            borderTop: '1px solid rgba(0,0,0,0.08)'
        });

        const totalRow = document.createElement('div');
        css(totalRow, { display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '24px', fontWeight: '700', color: '#1d1d1f' });
        totalRow.innerHTML = '<span>Total</span><span id="basket-total">0,00 €</span>';
        basketPanel.appendChild(totalRow);

        const paymentRow = document.createElement('div');
        css(paymentRow, { display: 'flex', gap: '12px' });

        const createPayBtn = (text, gradient) => {
            const btn = document.createElement('button');
            btn.textContent = text;
            css(btn, {
                flex: '1', padding: '16px', borderRadius: '12px', border: 'none',
                background: gradient, color: 'white', fontSize: '18px', fontWeight: '700',
                cursor: 'pointer', boxShadow: `0 4px 16px ${text === 'CA$H' ? 'rgba(52,199,89,0.3)' : 'rgba(0,122,255,0.3)'}`,
                transition: 'all 0.2s ease'
            });
            const shadowHover = text === 'CA$H' ? 'rgba(52,199,89,0.4)' : 'rgba(0,122,255,0.4)';
            btn.addEventListener('mouseenter', () => css(btn, { transform: 'translateY(-2px)', boxShadow: `0 6px 24px ${shadowHover}` }));
            btn.addEventListener('mouseleave', () => css(btn, { transform: 'translateY(0)', boxShadow: `0 4px 16px ${text === 'CA$H' ? 'rgba(52,199,89,0.3)' : 'rgba(0,122,255,0.3)'}` }));
            return btn;
        };

        const cashBtn = createPayBtn('CA$H', 'linear-gradient(135deg, #34c759 0%, #30d158 100%)');
        const creditBtn = createPayBtn('CREDIT', 'linear-gradient(135deg, #007aff 0%, #0051d5 100%)');
        paymentRow.appendChild(cashBtn);
        paymentRow.appendChild(creditBtn);
        basketPanel.appendChild(paymentRow);
        document.body.appendChild(basketPanel);

        const updateBasket = () => {
            let total = 0, hasItems = false;
            Object.keys(basketData.items).forEach(itemId => {
                const qty = basketData.items[itemId].quantity;
                if (qty > 0) {
                    hasItems = true;
                    total += basketData.items[itemId].price * qty;
                }
            });
            basketData.total = total;
            $('#basket-total').textContent = total.toFixed(2).replace('.', ',') + ' €';
            basketPanel.style.display = hasItems ? 'flex' : 'none';
        };

        const enhanceProductWithControls = product => {
            if (product.dataset.controlsAdded) return;
            product.dataset.controlsAdded = 'true';

            const productId = product.id.replace('article-item-', '');
            const priceStr = product.getAttribute('data-price');
            if (!priceStr) return;

            const price = parseFloat(priceStr.replace(',', '.'));
            basketData.items[productId] = { quantity: 0, price, href: product.getAttribute('href') };
            product.addEventListener('click', e => e.preventDefault());

            const controls = document.createElement('div');
            css(controls, { position: 'absolute', bottom: '8px', left: '8px', display: 'flex', gap: '8px', alignItems: 'center', pointerEvents: 'auto', zIndex: '20' });

            const createBtn = (text, bg) => {
                const btn = document.createElement('button');
                btn.textContent = text;
                css(btn, {
                    width: '36px', height: '36px', borderRadius: '8px', border: 'none',
                    background: bg, color: 'white', fontSize: '20px', fontWeight: '700',
                    cursor: 'pointer', display: text === '−' ? 'none' : 'flex',
                    alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s ease'
                });
                return btn;
            };

            const minusBtn = createBtn('−', 'rgba(255,59,48,0.9)');
            const quantityDisplay = document.createElement('div');
            css(quantityDisplay, {
                minWidth: '40px', padding: '8px 12px', borderRadius: '8px',
                background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(10px)', color: 'white',
                fontSize: '16px', fontWeight: '700', textAlign: 'center', display: 'none'
            });
            quantityDisplay.textContent = '0';
            const plusBtn = createBtn('+', 'rgba(52,199,89,0.9)');

            const updateControls = () => {
                const qty = basketData.items[productId].quantity;
                quantityDisplay.textContent = qty;
                const priceTag = product.querySelector('div[style*="position: absolute"][style*="bottom: 8px"][style*="right: 8px"]');
                
                if (qty > 0) {
                    minusBtn.style.display = 'flex';
                    quantityDisplay.style.display = 'block';
                    if (priceTag) priceTag.style.display = 'none';
                } else {
                    minusBtn.style.display = 'none';
                    quantityDisplay.style.display = 'none';
                    if (priceTag) priceTag.style.display = 'block';
                }
            };

            plusBtn.addEventListener('click', e => {
                e.preventDefault();
                e.stopPropagation();
                basketData.items[productId].quantity++;
                updateControls();
                updateBasket();
            });

            minusBtn.addEventListener('click', e => {
                e.preventDefault();
                e.stopPropagation();
                if (basketData.items[productId].quantity > 0) {
                    basketData.items[productId].quantity--;
                    updateControls();
                    updateBasket();
                }
            });

            controls.appendChild(minusBtn);
            controls.appendChild(quantityDisplay);
            controls.appendChild(plusBtn);
            product.appendChild(controls);
        };

        new MutationObserver(() => $$('.article-tile-item').forEach(enhanceProductWithControls))
            .observe(document.body, { childList: true, subtree: true });
        setTimeout(() => $$('.article-tile-item').forEach(enhanceProductWithControls), 100);

        const submitBasket = method => {
            const basketId = location.pathname.match(/\/basket\/(\d+)/)?.[1];
            if (!basketId) return;

            const transactionAmount = basketData.total;
            
            const form = document.createElement('form');
            form.method = 'POST';
            form.action = `/kiosk/basket/${basketId}/checkout/${method}/`;
            css(form, { display: 'none' });

            const csrfInput = document.createElement('input');
            csrfInput.type = 'hidden';
            csrfInput.name = 'csrfmiddlewaretoken';
            const csrfToken = $('input[name="csrfmiddlewaretoken"]')?.value;
            if (csrfToken) csrfInput.value = csrfToken;
            form.appendChild(csrfInput);

            Object.keys(basketData.items).forEach(itemId => {
                const qty = basketData.items[itemId].quantity;
                if (qty > 0) {
                    ['article', 'quantity'].forEach((name, i) => {
                        const input = document.createElement('input');
                        input.type = 'hidden';
                        input.name = name;
                        input.value = i === 0 ? itemId : qty;
                        form.appendChild(input);
                    });
                }
            });

            form.addEventListener('submit', async () => {
                try {
                    const response = await fetch('/me');
                    const url = response.url;
                    const match = url.match(/\/profile\/([^\/]+)/);
                    if (match) {
                        const login = match[1];
                        setTimeout(async () => {
                            try {
                                const balanceResponse = await fetch(`https://scrooge.assistants.epita.fr/api/users/${login}/balance/`);
                                const balanceData = await balanceResponse.json();
                                const remainingBalance = balanceData.balance || 0;
                                
                                const successMsg = document.createElement('div');
                                css(successMsg, {
                                    position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                                    background: 'linear-gradient(135deg, #34c759 0%, #30d158 100%)',
                                    color: 'white', padding: '32px 48px', borderRadius: '16px',
                                    fontSize: '18px', fontWeight: '600', textAlign: 'center',
                                    boxShadow: '0 8px 32px rgba(52,199,89,0.4)', zIndex: 100001,
                                    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, sans-serif',
                                    backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
                                    animation: 'fadeIn 0.3s ease'
                                });
                                successMsg.innerHTML = `
                                    <div style="font-size: 48px; margin-bottom: 16px;">✓</div>
                                    <div style="font-size: 20px; font-weight: 700; margin-bottom: 8px;">Transaction réussie</div>
                                    <div style="font-size: 16px; opacity: 0.95;">Montant: ${transactionAmount.toFixed(2).replace('.', ',')} €</div>
                                    <div style="font-size: 16px; opacity: 0.95;">Solde restant: ${remainingBalance.toFixed(2).replace('.', ',')} €</div>
                                `;
                                document.body.appendChild(successMsg);
                                
                                setTimeout(() => {
                                    successMsg.style.opacity = '0';
                                    successMsg.style.transform = 'translate(-50%, -50%) scale(0.9)';
                                    setTimeout(() => successMsg.remove(), 300);
                                }, 3000);
                            } catch (err) {
                                console.error('Erreur lors de la récupération du solde:', err);
                            }
                        }, 1000);
                    }
                } catch (err) {
                    console.error('Erreur lors de la récupération des informations utilisateur:', err);
                }
            });

            document.body.appendChild(form);
            form.submit();
        };

        cashBtn.addEventListener('click', () => submitBasket('cash'));
        creditBtn.addEventListener('click', () => submitBasket('credit'));
    }

})();
