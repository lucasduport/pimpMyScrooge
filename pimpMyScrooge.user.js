// ==UserScript==
// @name         PimpMyScrooge
// @namespace    https://scrooge.assistants.epita.fr/*
// @version      1.2
// @description  Quick search bar + QR code scanner + Check user
// @match        https://scrooge.assistants.epita.fr/*
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

    // Load jsQR with @require first, fallback to fetch if not available
    async function ensureJsQR() {
        // Check if @require worked
        if (typeof jsQR !== 'undefined') {
            console.log('jsQR loaded via @require');
            return true;
        }
        
        console.log('jsQR not found via @require, trying fetch fallback...');
        
        // Fallback: load via fetch
        try {
            const response = await fetch('https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js');
            const code = await response.text();
            eval(code);
            
            // Wait a bit for jsQR to be available
            await new Promise(resolve => setTimeout(resolve, 100));
            
            if (typeof jsQR !== 'undefined') {
                console.log('jsQR loaded via fetch fallback');
                return true;
            }
        } catch (e) {
            console.error('Failed to load jsQR via fetch:', e);
        }
        
        return false;
    }

    // Initialize
    ensureJsQR().then(success => {
        if (success) {
            createBar();
        } else {
            console.error('Failed to load jsQR');
            createBar(); // Create bar anyway, will show error when scanning
        }
    });

    function createBar() {
        if (window.location.href.includes("basket")) return;

        const container = document.createElement('div');
        container.id = 'epita-quick-login-container';
        Object.assign(container.style, {
            position: 'fixed', top: '0', left: '0', width: '100%', zIndex: 99999,
            background: 'rgba(255,255,255,0.95)', borderBottom: '1px solid rgba(0,0,0,0.12)',
            padding: '12px 16px', boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
            fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial',
            display: 'flex', flexDirection: 'column', alignItems: 'stretch', boxSizing: 'border-box', gap: '8px'
        });

        // Search bar
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
        Object.assign(input.style, { padding: '8px 12px', borderRadius: '6px', border: '1px solid rgba(0,0,0,0.12)', fontSize: '14px', outline: 'none', flex: '1' });
        searchBar.appendChild(input);

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = 'Go';
        Object.assign(btn.style, { padding: '8px 14px', borderRadius: '6px', border: 'none', background: '#0b5fff', color: 'white', cursor: 'pointer', fontSize: '14px' });
        searchBar.appendChild(btn);

        container.appendChild(searchBar);

        // Big QR scan button
        const scanBtn = document.createElement('button');
        scanBtn.type = 'button';
        scanBtn.textContent = '📷 Scan QR Code';
        Object.assign(scanBtn.style, { padding: '14px', borderRadius: '8px', border: 'none', background: '#00b300', color: 'white', cursor: 'pointer', fontSize: '16px', fontWeight: 'bold', width: '100%' });
        container.appendChild(scanBtn);

        // Message area
        const msg = document.createElement('div');
        Object.assign(msg.style, { fontSize: '12px', color: '#d00', textAlign: 'center' });
        container.appendChild(msg);

        document.body.appendChild(container);
        document.body.style.paddingTop = container.offsetHeight + 'px';

        document.addEventListener('keydown', e => { if (e.key === 'Escape' && container.parentNode) container.parentNode.removeChild(container); });

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
                    msg.textContent = 'Impossible de vérifier l\'utilisateur.';
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

            try { form.submit(); } catch (err) { const submitBtn = form.querySelector('button[type="submit"], input[type="submit"]'); if (submitBtn) submitBtn.click(); }
        }

        btn.addEventListener('click', () => checkAndSubmit(input.value));
        input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); checkAndSubmit(input.value); } });

        // QR scanner (max compatibility)
        scanBtn.addEventListener('click', () => openCameraScanner(checkAndSubmit, msg));

        setTimeout(() => input.focus(), 200);
    }

    // Maximally compatible QR scanner function
    async function openCameraScanner(checkAndSubmit, msg) {
        msg.textContent = '';
        
        // Check if jsQR is available (should be loaded by now)
        if (typeof jsQR === 'undefined') {
            msg.textContent = 'Chargement de jsQR...';
            console.log('jsQR not available yet, attempting to load...');
            
            // Try one more time with fetch
            try {
                const response = await fetch('https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js');
                const code = await response.text();
                eval(code);
                await new Promise(resolve => setTimeout(resolve, 200));
            } catch (e) {
                console.error('Failed to load jsQR:', e);
            }
            
            if (typeof jsQR === 'undefined') {
                msg.textContent = 'ERREUR: jsQR impossible à charger. Vérifiez votre connexion.';
                console.error('jsQR still undefined after fetch attempt');
                return;
            }
        }
        
        msg.textContent = '';
        console.log('jsQR is available, starting camera...');
        
        // Check if camera API is available
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            msg.textContent = 'Caméra non supportée par ce navigateur.';
            return;
        }

        const overlay = document.createElement('div');
        Object.assign(overlay.style, { 
            position:'fixed', top:0, left:0, width:'100%', height:'100%', 
            background:'rgba(0,0,0,0.9)', zIndex:99998, 
            display:'flex', justifyContent:'center', alignItems:'center', flexDirection:'column' 
        });
        document.body.appendChild(overlay);

        const video = document.createElement('video');
        video.setAttribute('playsinline', '');
        video.setAttribute('autoplay', '');
        video.setAttribute('muted', '');
        video.muted = true;
        Object.assign(video.style, { 
            width:'90%', maxWidth:'500px', 
            borderRadius:'12px', boxShadow:'0 4px 12px rgba(0,0,0,0.5)' 
        });
        overlay.appendChild(video);

        const statusMsg = document.createElement('div');
        statusMsg.textContent = 'Initialisation de la caméra...';
        Object.assign(statusMsg.style, { 
            marginTop:'12px', color:'white', fontSize:'14px', textAlign:'center',
            padding:'8px', background:'rgba(0,0,0,0.5)', borderRadius:'6px',
            minHeight:'40px', width:'90%', maxWidth:'500px'
        });
        overlay.appendChild(statusMsg);

        const closeBtn = document.createElement('button');
        closeBtn.textContent = '✖ Fermer';
        Object.assign(closeBtn.style, { 
            marginTop:'12px', padding:'10px 16px', fontSize:'14px', 
            borderRadius:'8px', border:'none', background:'#d00', 
            color:'white', cursor:'pointer' 
        });
        overlay.appendChild(closeBtn);

        let stream;
        let scanning = true;

        async function startCamera() {
            const constraints = [
                // Mobile (iOS/Android) - rear camera high quality
                { video: { facingMode: { exact: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } } },
                // Mobile - rear camera medium quality
                { video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } } },
                // Desktop (Windows/Linux/Mac) - high quality
                { video: { width: { ideal: 1920 }, height: { ideal: 1080 } } },
                // Desktop/Mobile - medium quality
                { video: { width: { ideal: 1280 }, height: { ideal: 720 } } },
                // Mobile - front camera
                { video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } } },
                // Fallback - lower quality
                { video: { width: { ideal: 640 }, height: { ideal: 480 } } },
                // Fallback - basic video (any available camera)
                { video: true }
            ];

            for (const constraint of constraints) {
                try {
                    stream = await navigator.mediaDevices.getUserMedia(constraint);
                    video.srcObject = stream;
                    
                    // Wait for video to be ready (critical for iOS/Android)
                    await new Promise((resolve, reject) => {
                        video.onloadedmetadata = () => {
                            video.play().then(resolve).catch(reject);
                        };
                        video.onerror = reject;
                        setTimeout(() => reject(new Error('Timeout')), 5000);
                    });
                    
                    const track = stream.getVideoTracks()[0];
                    const settings = track.getSettings();
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
        }

        const success = await startCamera();
        if (!success) {
            msg.textContent = 'Impossible d\'accéder à la caméra. Vérifiez les permissions.';
            statusMsg.textContent = 'Erreur d\'accès à la caméra';
            setTimeout(() => overlay.remove(), 2000);
            return;
        }

        function cleanup() {
            scanning = false;
            if (stream) {
                stream.getTracks().forEach(t => t.stop());
                stream = null;
            }
            if (overlay.parentNode) {
                overlay.remove();
            }
        }

        closeBtn.addEventListener('click', cleanup);

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        let lastScanTime = 0;
        const scanInterval = 150; // Scan every 150ms (better for iOS)
        let scanCount = 0;

        function tick() {
            if (!scanning) return;
            
            const now = Date.now();
            if (video.readyState === video.HAVE_ENOUGH_DATA && now - lastScanTime >= scanInterval) {
                lastScanTime = now;
                scanCount++;
                
                try {
                    const width = video.videoWidth;
                    const height = video.videoHeight;
                    
                    if (width > 0 && height > 0) {
                        canvas.width = width;
                        canvas.height = height;
                        ctx.drawImage(video, 0, 0, width, height);
                        const imageData = ctx.getImageData(0, 0, width, height);
                        
                        // Show scan status on screen every 10 scans
                        if (scanCount % 10 === 0) {
                            statusMsg.textContent = `Scan en cours... (${scanCount}) - ${width}x${height}`;
                            statusMsg.style.color = '#fff';
                        }
                        
                        // Try scanning with jsQR
                        if (typeof jsQR !== 'undefined') {
                            const code = jsQR(imageData.data, width, height, {
                                inversionAttempts: "attemptBoth"
                            });
                            
                            if (code && code.data) {
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
                    } else {
                        if (scanCount % 10 === 0) {
                            statusMsg.textContent = `Attente vidéo... (${width}x${height})`;
                            statusMsg.style.color = '#ff0';
                        }
                    }
                } catch (err) {
                    console.error('Erreur scan:', err);
                    statusMsg.textContent = 'Erreur: ' + err.message;
                    statusMsg.style.color = '#f00';
                }
            }
            requestAnimationFrame(tick);
        }
        
        // Start scanning after a small delay to ensure everything is ready
        setTimeout(() => tick(), 300);
    }

})();
