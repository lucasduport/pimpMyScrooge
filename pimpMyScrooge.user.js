// ==UserScript==
// @name         PimpMyScrooge
// @namespace    https://scrooge.assistants.epita.fr/*
// @version      2.0
// @description  Quick search bar + QR code scanner + Check user + Highlight my login + Autocomplete + Hardcore Mode + Better Basket
// @match        https://scrooge.assistants.epita.fr/kiosk/group/*
// @match        https://scrooge.assistants.epita.fr/kiosk/basket/*
// @grant        GM_xmlhttpRequest
// @connect      cri.epita.fr
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/lucasduport/pimpMyScrooge/main/pimpMyScrooge.user.js
// @downloadURL  https://raw.githubusercontent.com/lucasduport/pimpMyScrooge/main/pimpMyScrooge.user.js
// ==/UserScript==

(() => {
    'use strict';

    // Core utilities
    const $ = (s, c = document) => c.querySelector(s);
    const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
    const css = (el, styles) => Object.assign(el.style, styles);
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const shuffleArray = arr => {
        const s = [...arr];
        for (let i = s.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [s[i], s[j]] = [s[j], s[i]];
        }
        return s;
    };

    // Global state
    const state = {
        domain: '@epita.fr',
        hardcore: false,
        hardcoreTimer: null,
        jsQRLoaded: false,
        isBasket: location.pathname.includes('/basket/')
    };

    // Lazy load jsQR only when needed
    const loadJsQR = async () => {
        if (state.jsQRLoaded || typeof jsQR !== 'undefined') return state.jsQRLoaded = true;
        try {
            eval(await (await fetch('https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js')).text());
            await wait(100);
            return state.jsQRLoaded = typeof jsQR !== 'undefined';
        } catch (e) {
            console.error('jsQR load failed:', e);
            return false;
        }
    };

    // Style injection
    const injectStyles = () => {
        const style = document.createElement('style');
        style.textContent = `
            @keyframes fadeIn{from{opacity:0;transform:translate(-50%,-50%)scale(.9)}to{opacity:1;transform:translate(-50%,-50%)scale(1)}}
            .message{position:relative!important;z-index:100000!important}
            .member-list form.form-wrapper{transform:scale(.95);margin:4px}
            .member-list form.form-wrapper:hover{transform:scale(1.05)}
            .member-list .group-avatar{transform:scale(1.2)!important;margin:12px!important}
            .member-list .group-avatar:hover{transform:scale(1.3)!important}
            .member-list .member-avatar{border-radius:12px}
            .article-tile-group{border:1px solid rgba(0,0,0,.08)!important;border-radius:12px!important;padding:12px!important;margin-bottom:20px!important;gap:8px!important}
            .article-tile-item{margin:8px!important;transform:scale(1)!important;width:clamp(100px,140px,30vw)!important;height:clamp(100px,140px,30vw)!important;display:inline-block!important;position:relative!important;border-radius:12px!important;overflow:hidden!important}
            .article-tile-item>a{border-radius:12px!important;overflow:hidden!important;display:block!important;width:100%!important;height:100%!important}
            .article-tile-item img{transform:scale(1)!important;width:100%!important;height:100%!important;object-fit:cover!important;display:block!important;border-radius:12px!important}
            @media(max-width:768px){
                #epita-quick-login-container{padding:12px!important;max-width:100%!important}
                .article-tile-item{width:clamp(80px,120px,40vw)!important;height:clamp(80px,120px,40vw)!important}
            }
        `;
        document.head.appendChild(style);
    };

    // Hardcore mode toggle
    const toggleHardcore = () => {
        state.hardcore = !state.hardcore;
        const btn = $('#hardcore-mode-btn');
        
        if (state.hardcore) {
            state.hardcoreTimer = setInterval(() => {
                const ml = $('.member-list');
                if (ml) shuffleArray($$('form.form-wrapper', ml)).forEach(el => ml.appendChild(el));
                $$('.article-tile-group').forEach(g => shuffleArray($$('.article-tile-item', g)).forEach(el => g.appendChild(el)));
            }, 500);
        } else {
            clearInterval(state.hardcoreTimer);
            state.hardcoreTimer = null;
        }
        
        if (btn) css(btn, state.hardcore ? {
            background: 'linear-gradient(135deg,#ff3b30 0%,#ff9500 100%)',
            color: 'white',
            boxShadow: '0 4px 20px rgba(255,59,48,.4)'
        } : {
            background: 'rgba(255,255,255,.95)',
            color: '#8e8e93',
            boxShadow: '0 2px 12px rgba(0,0,0,.08)'
        });
    };

    // Button factory
    const createBtn = (content, baseStyles, hoverStyles) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        if (content.includes('<')) btn.innerHTML = content;
        else btn.textContent = content;
        css(btn, baseStyles);
        if (hoverStyles) {
            btn.addEventListener('mouseenter', () => css(btn, hoverStyles));
            btn.addEventListener('mouseleave', () => css(btn, baseStyles));
        }
        return btn;
    };

    // User validation
    const validateUser = (val, callback) => {
        if (!val) return;
        val = val.split('@')[0];
        
        GM_xmlhttpRequest({
            method: 'GET',
            url: `https://cri.epita.fr/users/${val}`,
            onload: res => callback(res.status !== 404, val),
            onerror: () => callback(false, val)
        });
    };

    // Form submission
    const submitForm = email => {
        let form = $('form') || $('input[name="client"]')?.form;
        if (!form) {
            form = document.createElement('form');
            css(form, {display: 'none'});
            form.method = 'post';
            form.action = location.href;
            document.body.appendChild(form);
        }

        let field = form.querySelector('input[name="client"]');
        if (!field) {
            field = document.createElement('input');
            field.type = 'hidden';
            field.name = 'client';
            form.appendChild(field);
        }
        field.value = email;

        const visible = $('input[type="email"], input[type="text"].login');
        if (visible) visible.value = email;

        try { form.submit(); } catch { $('button[type="submit"]', form)?.click(); }
    };


    // Group UI creation
    const createGroupUI = async () => {
        const container = document.createElement('div');
        container.id = 'epita-quick-login-container';
        css(container, {
            position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)',
            width: '100%', maxWidth: '800px', zIndex: 99999,
            padding: '20px 24px 0 24px', display: 'flex', flexDirection: 'column',
            gap: '16px', fontFamily: '-apple-system,BlinkMacSystemFont,"SF Pro Display",Roboto,sans-serif'
        });

        let myLogin, avatarUrl;
        try {
            const url = (await fetch('/me')).url;
            const match = url.match(/\/profile\/([^\/]+)/);
            if (match) {
                myLogin = match[1];
                const form = $(`form[data-login="${myLogin}"]`);
                const avatar = form?.querySelector('.member-avatar');
                const urlMatch = avatar?.style.backgroundImage.match(/url\(['"]?([^'"]+)['"]?\)/);
                if (urlMatch) avatarUrl = urlMatch[1];
            }
        } catch (e) {}

        const row = document.createElement('div');
        css(row, {display: 'flex', alignItems: 'center', gap: '16px', width: '100%', flexWrap: 'wrap'});

        const searchBar = document.createElement('div');
        css(searchBar, {display: 'flex', alignItems: 'center', gap: '12px', flex: '1', minWidth: '200px'});

        const input = document.createElement('input');
        input.id = 'epita-login-input';
        input.type = 'text';
        input.placeholder = 'xavier.login';
        input.setAttribute('list', 'login-datalist');
        css(input, {
            padding: '14px 18px', borderRadius: '10px', border: '1.5px solid rgba(0,0,0,.08)',
            fontSize: '16px', outline: 'none', flex: '1', background: 'white',
            transition: 'all .2s ease', fontWeight: '400', color: '#1d1d1f'
        });

        const datalist = document.createElement('datalist');
        datalist.id = 'login-datalist';
        $$('form.form-wrapper').map(f => f.getAttribute('data-login')).filter(Boolean).sort()
            .forEach(login => {
                const opt = document.createElement('option');
                opt.value = login;
                datalist.appendChild(opt);
            });
        document.body.appendChild(datalist);

        input.addEventListener('focus', () => css(input, {borderColor: '#007aff', boxShadow: '0 0 0 4px rgba(0,122,255,.1)'}));
        input.addEventListener('blur', () => css(input, {borderColor: 'rgba(0,0,0,.08)', boxShadow: 'none'}));
        searchBar.appendChild(input);

        const goBtn = createBtn('Go', {
            padding: '14px 32px', borderRadius: '10px', border: 'none', background: '#007aff',
            color: 'white', cursor: 'pointer', fontSize: '16px', fontWeight: '600',
            transition: 'all .2s ease', boxShadow: '0 2px 8px rgba(0,122,255,.3)', flexShrink: '0'
        }, {
            background: '#0051d5', transform: 'translateY(-1px)', boxShadow: '0 4px 12px rgba(0,122,255,.4)'
        });
        searchBar.appendChild(goBtn);
        row.appendChild(searchBar);

        const scanBtn = createBtn(`<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>`, {
            padding: '14px 24px', borderRadius: '10px', border: 'none',
            background: 'linear-gradient(135deg,#34c759 0%,#30d158 100%)', color: 'white',
            cursor: 'pointer', transition: 'all .2s ease', boxShadow: '0 2px 8px rgba(52,199,89,.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: '0'
        }, {
            transform: 'translateY(-1px)', boxShadow: '0 4px 12px rgba(52,199,89,.4)'
        });
        scanBtn.title = 'Scan QR Code';
        row.appendChild(scanBtn);

        const hardcoreBtn = createBtn(`<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C12 2 7 6 7 11C7 13.76 9.24 16 12 16C14.76 16 17 13.76 17 11C17 6 12 2 12 2Z"/><path d="M12 16C12 16 9 18 9 20.5C9 21.88 10.12 23 11.5 23C12.88 23 14 21.88 14 20.5C14 18 12 16 12 16Z"/></svg>`, {
            padding: '14px 24px', borderRadius: '10px', border: 'none', background: 'rgba(255,255,255,.95)',
            color: '#8e8e93', cursor: 'pointer', transition: 'all .2s ease',
            boxShadow: '0 2px 12px rgba(0,0,0,.08)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', flexShrink: '0'
        }, {
            transform: 'translateY(-1px)', boxShadow: '0 4px 20px rgba(0,0,0,.15)'
        });
        hardcoreBtn.id = 'hardcore-mode-btn';
        hardcoreBtn.title = 'Hardcore Mode';
        row.appendChild(hardcoreBtn);
        container.appendChild(row);
        document.body.appendChild(container);

        const checkAndSubmit = (val, msg, inp) => {
            if (!val) return;
            if (inp) {
                inp.placeholder = 'Checking...';
                inp.style.borderColor = '#007aff';
            }
            validateUser(val, (valid, login) => {
                if (inp) {
                    inp.placeholder = valid ? 'xavier.login' : `User "${login}" not found`;
                    inp.style.borderColor = valid ? 'rgba(0,0,0,.08)' : '#ff3b30';
                    if (valid) inp.value = login;
                    else { inp.value = ''; inp.focus(); }
                }
                if (valid) submitForm(login + state.domain);
            });
        };

        goBtn.addEventListener('click', () => checkAndSubmit(input.value, null, input));
        let lastVal = '';
        input.addEventListener('input', () => lastVal = input.value);
        input.addEventListener('keydown', e => {
            if (e.key === 'Enter') {
                e.preventDefault();
                setTimeout(() => checkAndSubmit(input.value, null, input), 50);
            }
        });
        scanBtn.addEventListener('click', () => openScanner(val => checkAndSubmit(val, null, input)));
        hardcoreBtn.addEventListener('click', toggleHardcore);
        setTimeout(() => input.focus(), 200);

        // Update padding & enhance avatars
        const updateUI = () => {
            const ml = $('.member-list');
            if (ml) {
                ml.style.paddingTop = (container.offsetHeight + 20) + 'px';
                $$('form.form-wrapper', ml).forEach(form => {
                    const login = form.getAttribute('data-login');
                    if (!login || form.querySelector('.pimp-login-label')) return;
                    
                    const btn = form.querySelector('.member-avatar');
                    if (btn) {
                        css(btn, {transition: 'transform .3s ease, box-shadow .3s ease', boxShadow: '0 2px 12px rgba(0,0,0,.08)', borderRadius: '12px'});
                        btn.addEventListener('mouseenter', () => css(btn, {transform: 'scale(1.08)', boxShadow: '0 8px 24px rgba(0,0,0,.2)'}));
                        btn.addEventListener('mouseleave', () => css(btn, {transform: 'scale(1)', boxShadow: '0 2px 12px rgba(0,0,0,.08)'}));
                    }
                    
                    const label = document.createElement('div');
                    label.className = 'pimp-login-label';
                    label.textContent = login;
                    css(label, {position: 'absolute', opacity: 0, fontSize: '1px', height: '1px', width: '1px', overflow: 'hidden'});
                    form.appendChild(label);
                });
            }
        };

        // Highlight user profile
        if (avatarUrl && myLogin) {
            const highlightProfile = () => {
                const ml = $('.member-list');
                if (!ml || $('#highlighted-profile-row')) return;
                
                const myForm = $(`form[data-login="${myLogin}"]`);
                if (myForm) css(myForm, {display: 'none'});
                
                const row = document.createElement('div');
                row.id = 'highlighted-profile-row';
                css(row, {
                    display: 'flex', 
                    justifyContent: 'center', 
                    alignItems: 'center',
                    padding: '20px 0 40px', 
                    marginBottom: '20px',
                    width: '100%'
                });
                
                const avatar = document.createElement('div');
                css(avatar, {
                    width: 'clamp(120px,180px,40vw)', 
                    height: 'clamp(120px,180px,40vw)',
                    borderRadius: '20px', 
                    backgroundImage: `url('${avatarUrl}')`,
                    backgroundSize: 'cover', 
                    backgroundPosition: 'center',
                    boxShadow: '0 8px 32px rgba(0,122,255,.25)',
                    border: '4px solid rgba(0,122,255,.3)', 
                    cursor: 'pointer',
                    transition: 'all .3s ease', 
                    position: 'relative'
                });
                
                const label = document.createElement('div');
                label.textContent = myLogin;
                css(label, {
                    position: 'absolute', 
                    bottom: '-28px', 
                    left: '50%', 
                    transform: 'translateX(-50%)',
                    fontSize: '14px', 
                    fontWeight: '600', 
                    color: '#007aff', 
                    whiteSpace: 'nowrap'
                });
                avatar.appendChild(label);
                
                if (myForm) {
                    avatar.addEventListener('click', () => myForm.querySelector('button').click());
                    avatar.addEventListener('mouseenter', () => css(avatar, {transform: 'scale(1.08) translateY(-4px)', boxShadow: '0 12px 48px rgba(0,122,255,.4)', borderColor: 'rgba(0,122,255,.5)'}));
                    avatar.addEventListener('mouseleave', () => css(avatar, {transform: 'scale(1) translateY(0)', boxShadow: '0 8px 32px rgba(0,122,255,.25)', borderColor: 'rgba(0,122,255,.3)'}));
                }
                
                row.appendChild(avatar);
                ml.insertBefore(row, ml.firstChild);
            };
            
            setTimeout(highlightProfile, 100);
            setTimeout(highlightProfile, 500);
            new MutationObserver(() => $('.member-list') && !$('#highlighted-profile-row') && highlightProfile())
                .observe(document.body, {childList: true, subtree: true});
        }

        new MutationObserver(updateUI).observe(document.body, {childList: true, subtree: true});
        setTimeout(updateUI, 50);
        setTimeout(updateUI, 300);
        window.addEventListener('resize', updateUI);
    };


    // QR Scanner (optimized for mobile)
    const openScanner = async callback => {
        if (!await loadJsQR()) return console.error('jsQR unavailable');
        
        const overlay = document.createElement('div');
        css(overlay, {
            position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
            background: 'rgba(0,0,0,.9)', zIndex: 99998, display: 'flex',
            justifyContent: 'center', alignItems: 'center', flexDirection: 'column'
        });

        const video = document.createElement('video');
        video.setAttribute('playsinline', '');
        video.setAttribute('autoplay', '');
        video.setAttribute('muted', '');
        video.muted = true;
        css(video, {width: '90%', maxWidth: '500px', borderRadius: '12px'});
        overlay.appendChild(video);

        const status = document.createElement('div');
        status.textContent = 'Initializing...';
        css(status, {marginTop: '12px', color: 'white', fontSize: '14px', padding: '8px', background: 'rgba(0,0,0,.5)', borderRadius: '6px'});
        overlay.appendChild(status);

        const closeBtn = createBtn('✖ Close', {marginTop: '12px', padding: '10px 16px', fontSize: '14px', borderRadius: '8px', border: 'none', background: '#d00', color: 'white', cursor: 'pointer'});
        overlay.appendChild(closeBtn);
        document.body.appendChild(overlay);

        let stream, scanning = true;
        const constraints = [
            {video: {facingMode: {exact: 'environment'}, width: {ideal: 1280}, height: {ideal: 720}}},
            {video: {facingMode: 'environment'}},
            {video: {width: {ideal: 640}, height: {ideal: 480}}},
            {video: true}
        ];

        for (const constraint of constraints) {
            try {
                stream = await navigator.mediaDevices.getUserMedia(constraint);
                video.srcObject = stream;
                await new Promise((res, rej) => {
                    video.onloadedmetadata = () => video.play().then(res).catch(rej);
                    setTimeout(() => rej(new Error('Timeout')), 5000);
                });
                status.textContent = 'Point camera at QR code';
                break;
            } catch (e) {
                if (stream) stream.getTracks().forEach(t => t.stop());
                stream = null;
            }
        }

        if (!stream) {
            status.textContent = 'Camera access denied';
            setTimeout(() => overlay.remove(), 2000);
            return;
        }

        const cleanup = () => {
            scanning = false;
            if (stream) stream.getTracks().forEach(t => t.stop());
            overlay.remove();
        };
        closeBtn.addEventListener('click', cleanup);

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', {willReadFrequently: true});
        let lastScan = 0;
        const scanDelay = 200; // Faster on mobile

        const tick = () => {
            if (!scanning) return;
            const now = Date.now();
            
            if (video.readyState === video.HAVE_ENOUGH_DATA && now - lastScan >= scanDelay) {
                lastScan = now;
                const w = video.videoWidth, h = video.videoHeight;
                
                if (w > 0 && h > 0) {
                    canvas.width = w;
                    canvas.height = h;
                    ctx.drawImage(video, 0, 0, w, h);
                    const data = ctx.getImageData(0, 0, w, h);
                    const code = jsQR(data.data, w, h, {inversionAttempts: 'dontInvert'}); // Faster
                    
                    if (code?.data) {
                        status.textContent = '✓ Scanned!';
                        cleanup();
                        callback(code.data);
                        return;
                    }
                }
            }
            requestAnimationFrame(tick);
        };
        
        setTimeout(tick, 300);
    };

    // Basket UI
    const createBasketUI = () => {
        const basketData = {items: {}, total: 0, balance: null};

        // Floating total
        const floatingTotal = document.createElement('div');
        css(floatingTotal, {
            position: 'fixed', top: '20px', left: '50%', transform: 'translateX(-50%)',
            background: 'linear-gradient(135deg,#007aff 0%,#0051d5 100%)',
            color: 'white', padding: '16px 32px', borderRadius: '16px',
            fontSize: 'clamp(16px,20px,5vw)', fontWeight: '700',
            boxShadow: '0 8px 32px rgba(0,122,255,.4)', zIndex: 100000, display: 'none',
            flexDirection: 'column', gap: '4px', animation: 'fadeIn .3s ease', alignItems: 'center',
            fontFamily: '-apple-system,BlinkMacSystemFont,"SF Pro Display",Roboto,sans-serif'
        });
        floatingTotal.innerHTML = '<div style="display:flex;align-items:center;gap:12px"><span>Total:</span><span id="floating-basket-total">0,00 €</span></div><div id="floating-basket-remaining" style="font-size:.7em;opacity:.9"></div>';
        document.body.appendChild(floatingTotal);

        // Fetch balance
        const fetchBalance = async () => {
            try {
                const link = $('a.btn[href*="/credit-student/"]');
                if (link) {
                    const match = (link.textContent || link.innerText).match(/Solde\s*:\s*([-]?\d+(?:[,\.]\d+)?)\s*€/i);
                    if (match) {
                        basketData.balance = parseFloat(match[1].replace(',', '.'));
                        updateBasket();
                    }
                }
            } catch (e) {}
        };
        
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fetchBalance);
        else fetchBalance();
        setTimeout(fetchBalance, 100);
        setTimeout(fetchBalance, 500);

        // Panel
        const panel = document.createElement('div');
        css(panel, {
            position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
            width: '100%', maxWidth: '800px', padding: '20px 24px 0',
            fontFamily: '-apple-system,BlinkMacSystemFont,"SF Pro Display",Roboto,sans-serif',
            zIndex: 99998, display: 'none', flexDirection: 'column', gap: '16px',
            borderTop: '1px solid rgba(0,0,0,.08)'
        });

        const totalRow = document.createElement('div');
        css(totalRow, {display: 'flex', justifyContent: 'space-between', fontSize: 'clamp(18px,24px,6vw)', fontWeight: '700', color: '#1d1d1f'});
        totalRow.innerHTML = '<span>Total</span><span id="basket-total">0,00 €</span>';
        panel.appendChild(totalRow);

        const payRow = document.createElement('div');
        css(payRow, {display: 'flex', gap: '12px', flexWrap: 'wrap'});

        const cashBtn = createBtn('CA$H', {
            flex: '1', minWidth: '140px', padding: '16px', borderRadius: '12px', border: 'none',
            background: 'linear-gradient(135deg,#34c759 0%,#30d158 100%)', color: 'white',
            fontSize: '18px', fontWeight: '700', cursor: 'pointer',
            boxShadow: '0 4px 16px rgba(52,199,89,.3)', transition: 'all .2s ease'
        }, {
            transform: 'translateY(-2px)', boxShadow: '0 6px 24px rgba(52,199,89,.4)'
        });

        const creditBtn = createBtn('CREDIT', {
            flex: '1', minWidth: '140px', padding: '16px', borderRadius: '12px', border: 'none',
            background: 'linear-gradient(135deg,#007aff 0%,#0051d5 100%)', color: 'white',
            fontSize: '18px', fontWeight: '700', cursor: 'pointer',
            boxShadow: '0 4px 16px rgba(0,122,255,.3)', transition: 'all .2s ease'
        }, {
            transform: 'translateY(-2px)', boxShadow: '0 6px 24px rgba(0,122,255,.4)'
        });

        payRow.appendChild(cashBtn);
        payRow.appendChild(creditBtn);
        panel.appendChild(payRow);
        document.body.appendChild(panel);

        const updateBasket = () => {
            let total = 0, hasItems = false;
            Object.values(basketData.items).forEach(item => {
                if (item.quantity > 0) {
                    hasItems = true;
                    total += item.price * item.quantity;
                }
            });
            basketData.total = total;
            const formatted = total.toFixed(2).replace('.', ',') + ' €';
            
            $('#basket-total').textContent = formatted;
            $('#floating-basket-total').textContent = formatted;
            
            if (basketData.balance !== null && total > 0) {
                const remaining = basketData.balance - total;
                const affordable = total <= basketData.balance;
                const gradient = affordable ? 'linear-gradient(135deg,#34c759 0%,#30d158 100%)' : 'linear-gradient(135deg,#ff3b30 0%,#ff9500 100%)';
                
                css(floatingTotal, {
                    background: gradient,
                    boxShadow: affordable ? '0 8px 32px rgba(52,199,89,.4)' : '0 8px 32px rgba(255,59,48,.4)'
                });
                
                $('#floating-basket-remaining').textContent = affordable 
                    ? `Remaining: ${remaining.toFixed(2).replace('.', ',')} €`
                    : `Insufficient (${Math.abs(remaining).toFixed(2).replace('.', ',')} € short)`;
            }
            
            panel.style.display = hasItems ? 'flex' : 'none';
            floatingTotal.style.display = hasItems ? 'flex' : 'none';
        };

        // Enhance products
        const enhanceProduct = product => {
            if (product.dataset.enhanced) return;
            product.dataset.enhanced = 'true';
            
            const id = product.id.replace('article-item-', '');
            const priceStr = product.getAttribute('data-price');
            if (!priceStr) return;

            const price = parseFloat(priceStr.replace(',', '.'));
            basketData.items[id] = {quantity: 0, price, href: product.getAttribute('href')};
            product.addEventListener('click', e => e.preventDefault());

            // Price tag
            const tag = document.createElement('div');
            tag.textContent = price + ' €';
            css(tag, {
                position: 'absolute', bottom: '8px', right: '8px',
                background: 'rgba(0,0,0,.75)', backdropFilter: 'blur(10px)',
                color: 'white', padding: '6px 12px', borderRadius: '10px',
                fontSize: 'clamp(12px,14px,3.5vw)', fontWeight: '600',
                boxShadow: '0 2px 8px rgba(0,0,0,.3)', pointerEvents: 'none', zIndex: 10
            });
            product.appendChild(tag);

            // Controls
            const controls = document.createElement('div');
            css(controls, {position: 'absolute', bottom: '8px', left: '8px', display: 'flex', gap: '6px', alignItems: 'center', zIndex: 20});

            const createCtrlBtn = (text, bg) => {
                const btn = document.createElement('button');
                btn.textContent = text;
                css(btn, {
                    width: '28px', height: '28px', borderRadius: '8px', border: 'none',
                    background: bg, color: 'white', fontSize: '18px', fontWeight: '700',
                    cursor: 'pointer', display: text === '−' ? 'none' : 'flex',
                    alignItems: 'center', justifyContent: 'center', transition: 'all .2s ease'
                });
                return btn;
            };

            const minusBtn = createCtrlBtn('−', 'rgba(255,59,48,.9)');
            const qtyDisplay = document.createElement('div');
            css(qtyDisplay, {
                minWidth: '28px', padding: '4px 8px', borderRadius: '8px',
                background: 'rgba(0,0,0,.85)', color: 'white',
                fontSize: '14px', fontWeight: '700', textAlign: 'center', display: 'none'
            });
            qtyDisplay.textContent = '0';
            const plusBtn = createCtrlBtn('+', 'rgba(52,199,89,.9)');

            const updateControls = () => {
                const qty = basketData.items[id].quantity;
                qtyDisplay.textContent = qty;
                
                if (qty > 0) {
                    minusBtn.style.display = 'flex';
                    qtyDisplay.style.display = 'block';
                    tag.style.display = 'none';
                } else {
                    minusBtn.style.display = 'none';
                    qtyDisplay.style.display = 'none';
                    tag.style.display = 'block';
                }
            };

            plusBtn.addEventListener('click', e => {
                e.preventDefault();
                e.stopPropagation();
                basketData.items[id].quantity++;
                updateControls();
                updateBasket();
            });

            minusBtn.addEventListener('click', e => {
                e.preventDefault();
                e.stopPropagation();
                if (basketData.items[id].quantity > 0) {
                    basketData.items[id].quantity--;
                    updateControls();
                    updateBasket();
                }
            });

            controls.appendChild(minusBtn);
            controls.appendChild(qtyDisplay);
            controls.appendChild(plusBtn);
            product.appendChild(controls);

            // Hover effect
            css(product, {position: 'relative', transition: 'transform .2s ease, box-shadow .2s ease'});
            product.addEventListener('mouseenter', () => {
                css(product, {transform: 'translateY(-4px) scale(1.02)', boxShadow: '0 8px 24px rgba(0,0,0,.15)'});
                tag.style.background = 'rgba(0,122,255,.9)';
            });
            product.addEventListener('mouseleave', () => {
                css(product, {transform: 'translateY(0) scale(1)', boxShadow: ''});
                tag.style.background = 'rgba(0,0,0,.75)';
            });
        };

        new MutationObserver(() => $$('.article-tile-item').forEach(enhanceProduct))
            .observe(document.body, {childList: true, subtree: true});
        setTimeout(() => $$('.article-tile-item').forEach(enhanceProduct), 100);

        // Submit
        const submit = method => {
            const basketId = location.pathname.match(/\/basket\/(\d+)/)?.[1];
            if (!basketId) return;

            const form = document.createElement('form');
            form.method = 'POST';
            form.action = `/kiosk/basket/${basketId}/checkout/${method}/`;
            css(form, {display: 'none'});

            const csrf = $('input[name="csrfmiddlewaretoken"]')?.value;
            if (csrf) {
                const input = document.createElement('input');
                input.type = 'hidden';
                input.name = 'csrfmiddlewaretoken';
                input.value = csrf;
                form.appendChild(input);
            }

            Object.keys(basketData.items).forEach(id => {
                const qty = basketData.items[id].quantity;
                if (qty > 0) {
                    ['article', 'quantity'].forEach((name, i) => {
                        const input = document.createElement('input');
                        input.type = 'hidden';
                        input.name = name;
                        input.value = i === 0 ? id : qty;
                        form.appendChild(input);
                    });
                }
            });

            form.addEventListener('submit', () => {
                const msg = document.createElement('div');
                css(msg, {
                    position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
                    background: 'linear-gradient(135deg,#34c759 0%,#30d158 100%)',
                    color: 'white', padding: '32px 48px', borderRadius: '16px',
                    fontSize: '18px', fontWeight: '600', textAlign: 'center',
                    boxShadow: '0 8px 32px rgba(52,199,89,.4)', zIndex: 100001,
                    animation: 'fadeIn .3s ease'
                });
                msg.innerHTML = `<div style="font-size:48px;margin-bottom:16px">✓</div><div style="font-size:20px;font-weight:700;margin-bottom:8px">Transaction successful</div><div style="font-size:16px;opacity:.95">Amount: ${basketData.total.toFixed(2).replace('.', ',')} €</div>`;
                document.body.appendChild(msg);
            });

            document.body.appendChild(form);
            form.submit();
        };

        cashBtn.addEventListener('click', () => submit('cash'));
        creditBtn.addEventListener('click', () => submit('credit'));
    };

    // Initialize
    injectStyles();
    
    if (state.isBasket) {
        createBasketUI();
        const hardcoreBtn = createBtn(`<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C12 2 7 6 7 11C7 13.76 9.24 16 12 16C14.76 16 17 13.76 17 11C17 6 12 2 12 2Z"/><path d="M12 16C12 16 9 18 9 20.5C9 21.88 10.12 23 11.5 23C12.88 23 14 21.88 14 20.5C14 18 12 16 12 16Z"/></svg>`, {
            position: 'fixed', top: '20px', right: '20px', padding: '12px', borderRadius: '12px',
            border: 'none', background: 'rgba(255,255,255,.95)', color: '#8e8e93',
            cursor: 'pointer', transition: 'all .2s ease', boxShadow: '0 2px 12px rgba(0,0,0,.08)',
            zIndex: 100000, display: 'flex', alignItems: 'center', justifyContent: 'center'
        }, {
            transform: 'scale(1.1)', boxShadow: '0 4px 20px rgba(0,0,0,.15)'
        });
        hardcoreBtn.id = 'hardcore-mode-btn';
        hardcoreBtn.title = 'Hardcore Mode';
        hardcoreBtn.addEventListener('click', toggleHardcore);
        document.body.appendChild(hardcoreBtn);
    } else {
        createGroupUI();
    }

})();
