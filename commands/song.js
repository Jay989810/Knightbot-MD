/*Créditos A Quien Correspondan 
Play Traido y Editado 
Por Cuervo-Team-Supreme*/
const axios = require('axios');
const yts = require('yt-search');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

async function songCommand(sock, chatId, message) {
    try {
        const text = message.message?.conversation || message.message?.extendedTextMessage?.text;
        const searchQuery = text.split(' ').slice(1).join(' ').trim();
        
        if (!searchQuery) {
            return await sock.sendMessage(chatId, { 
                text: "What song do you want to download?"
            });
        }

        // Search for the song
        const { videos } = await yts(searchQuery);
        if (!videos || videos.length === 0) {
            return await sock.sendMessage(chatId, { 
                text: "No songs found!"
            });
        }

        // Get the first video result
        const video = videos[0];
        const urlYt = video.url;

        // Prepare temp files
        const tempDir = path.join(__dirname, '../temp');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir);
        }
        const tempFile = path.join(tempDir, `${Date.now()}.mp3`);
        const tempM4a = path.join(tempDir, `${Date.now()}.m4a`);

        try {
            // Send the thumbnail and info immediately after getting video info
            if (video.thumbnail) {
                try {
                    await sock.sendMessage(chatId, {
                        image: { url: video.thumbnail },
                        caption: `*${video.title}*\n\n*Duration:* ${formatDuration(video.duration.seconds)}\n*Views:* ${formatNumber(video.views)}\n\n> *_Downloaded by Knight Bot MD_*`
                    }, { quoted: message });
                } catch (thumbErr) {
                }
            }

            // Use new siputzx endpoint and include thumbnail
            const apiUrl = `https://api.siputzx.my.id/api/dl/youtube/mp3?url=${encodeURIComponent(urlYt)}`;
            const siputzxRes = await fetch(apiUrl, { headers: { 'accept': '*/*' } });
            const siputzxData = await siputzxRes.json();
            let downloadLink = null;
            if (siputzxData && siputzxData.status && siputzxData.data) {
                downloadLink = siputzxData.data;
            }
            if (downloadLink) {
                const response = await fetch(downloadLink);
                if (!response.ok) {
                    await sock.sendMessage(chatId, { text: 'Failed to download the song file from the server.' }, { quoted: message });
                    return;
                }
                const buffer = await response.buffer();
                if (!buffer || buffer.length < 1024) {
                    await sock.sendMessage(chatId, { text: 'Downloaded file is empty or too small.' }, { quoted: message });
                    return;
                }
                fs.writeFileSync(tempM4a, buffer);
                await execPromise(`ffmpeg -i "${tempM4a}" -vn -acodec libmp3lame -ac 2 -ab 128k -ar 44100 "${tempFile}"`);
                const stats = fs.statSync(tempFile);
                if (stats.size < 1024) {
                    throw new Error('Conversion failed');
                }
                await sock.sendMessage(chatId, {
                    audio: { url: tempFile },
                    mimetype: "audio/mpeg",
                    fileName: `${video.title}.mp3`,
                    ptt: false
                }, { quoted: message });
                setTimeout(() => {
                    try {
                        if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
                        if (fs.existsSync(tempM4a)) fs.unlinkSync(tempM4a);
                    } catch {}
                }, 5000);
                return;
            } else {
                // Fallback to vreden API
                try {
                    const vredenUrl = `https://api.vreden.my.id/api/dl/ytmp3?url=${encodeURIComponent(urlYt)}`;
                    const vredenRes = await fetch(vredenUrl, {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                            'Accept': 'application/json'
                        }
                    });
                    let vredenData;
                    if (!vredenRes.ok) {
                        await sock.sendMessage(chatId, {
                            text: 'Sorry, this song could not be downloaded (fallback API error). Please try another song or try again later.'
                        }, { quoted: message });
                        return;
                    }
                    const contentType = vredenRes.headers.get('content-type');
                    if (!contentType || !contentType.includes('application/json')) {
                        const errText = await vredenRes.text();
                        await sock.sendMessage(chatId, {
                            text: 'Sorry, this song could not be downloaded (fallback API returned invalid content). Please try another song or try again later.'
                        }, { quoted: message });
                        return;
                    }
                    try {
                        vredenData = await vredenRes.json();
                    } catch (jsonErr) {
                        await sock.sendMessage(chatId, {
                            text: 'Sorry, this song could not be downloaded (fallback API invalid response). Please try another song or try again later.'
                        }, { quoted: message });
                        return;
                    }
                    if (
                        vredenData &&
                        vredenData.status === 200 &&
                        vredenData.result &&
                        vredenData.result.status === true &&
                        vredenData.result.download &&
                        vredenData.result.download.status === true &&
                        vredenData.result.download.url
                    ) {
                        const vredenDownloadUrl = vredenData.result.download.url;
                        const vredenFilename = vredenData.result.download.filename || `${video.title}.mp3`;
                        const response = await fetch(vredenDownloadUrl);
                        if (!response.ok) {
                            await sock.sendMessage(chatId, { text: 'Failed to download the song file from the fallback server.' }, { quoted: message });
                            return;
                        }
                        const buffer = await response.buffer();
                        if (!buffer || buffer.length < 1024) {
                            await sock.sendMessage(chatId, { text: 'Downloaded file is empty or too small (fallback).' }, { quoted: message });
                            return;
                        }
                        fs.writeFileSync(tempM4a, buffer);
                        await execPromise(`ffmpeg -i "${tempM4a}" -vn -acodec libmp3lame -ac 2 -ab 128k -ar 44100 "${tempFile}"`);
                        const stats = fs.statSync(tempFile);
                        if (stats.size < 1024) {
                            throw new Error('Conversion failed (fallback)');
                        }
                        await sock.sendMessage(chatId, {
                            audio: { url: tempFile },
                            mimetype: "audio/mpeg",
                            fileName: vredenFilename,
                            ptt: false
                        }, { quoted: message });
                        setTimeout(() => {
                            try {
                                if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
                                if (fs.existsSync(tempM4a)) fs.unlinkSync(tempM4a);
                            } catch {}
                        }, 5000);
                        return;
                    } else {
                        await sock.sendMessage(chatId, {
                            text: 'Sorry, this song could not be downloaded. Please try another song or try again later.'
                        }, { quoted: message });
                        return;
                    }
                } catch (vredenErr) {
                    await sock.sendMessage(chatId, {
                        text: 'Sorry, this song could not be downloaded. Please try another song or try again later.'
                    }, { quoted: message });
                    return;
                }
            }
        } catch (e1) {
            try {
                // Try zenkey API as fallback
                const zenkeyRes = await fetch(`https://api.zenkey.my.id/api/download/ytmp3?apikey=zenkey&url=${encodeURIComponent(urlYt)}`);
                const zenkeyData = await zenkeyRes.json();
                
                if (zenkeyData && zenkeyData.result && zenkeyData.result.downloadUrl) {
                    // Download the file first
                    const response = await fetch(zenkeyData.result.downloadUrl);
                    const buffer = await response.buffer();
                    
                    // Write to temp file
                    fs.writeFileSync(tempM4a, buffer);
                    
                    // Convert to MP3 with proper WhatsApp-compatible settings
                    await execPromise(`ffmpeg -i "${tempM4a}" -vn -acodec libmp3lame -ac 2 -ab 128k -ar 44100 "${tempFile}"`);
                    
                    // Check file size
                    const stats = fs.statSync(tempFile);
                    if (stats.size < 1024) {
                        throw new Error('Conversion failed');
                    }

                    await sock.sendMessage(chatId, {
                        audio: { url: tempFile },
                        mimetype: "audio/mpeg",
                        fileName: `${video.title}.mp3`,
                        ptt: false
                    }, { quoted: message });

                    // Clean up temp files after a delay to ensure WhatsApp has read the file
                    setTimeout(() => {
                        try {
                            if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
                            if (fs.existsSync(tempM4a)) fs.unlinkSync(tempM4a);
                        } catch (cleanupErr) {
                        }
                    }, 5000);
                    return;
                }
            } catch (e2) {
                try {
                    // Try axeel API as last resort
                    const axeelRes = await fetch(`https://api.axeel.my.id/api/download/ytmp3?apikey=axeel&url=${encodeURIComponent(urlYt)}`);
                    const axeelData = await axeelRes.json();
                    
                    if (axeelData && axeelData.result && axeelData.result.downloadUrl) {
                        // Download the file first
                        const response = await fetch(axeelData.result.downloadUrl);
                        const buffer = await response.buffer();
                        
                        // Write to temp file
                        fs.writeFileSync(tempM4a, buffer);
                        
                        // Convert to MP3 with proper WhatsApp-compatible settings
                        await execPromise(`ffmpeg -i "${tempM4a}" -vn -acodec libmp3lame -ac 2 -ab 128k -ar 44100 "${tempFile}"`);
                        
                        // Check file size
                        const stats = fs.statSync(tempFile);
                        if (stats.size < 1024) {
                            throw new Error('Conversion failed');
                        }

                        await sock.sendMessage(chatId, {
                            audio: { url: tempFile },
                            mimetype: "audio/mpeg",
                            fileName: `${video.title}.mp3`,
                            ptt: false
                        }, { quoted: message });

                        // Clean up temp files after a delay to ensure WhatsApp has read the file
                        setTimeout(() => {
                            try {
                                if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
                                if (fs.existsSync(tempM4a)) fs.unlinkSync(tempM4a);
                            } catch (cleanupErr) {
                            }
                        }, 5000);
                        return;
                    }
                } catch (e3) {
                    throw new Error("All download methods failed");
                }
            }
        }
    } catch (error) {
        await sock.sendMessage(chatId, { 
            text: "Download failed. Please try again later."
        });
    }
}

function formatDuration(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;
    
    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
    } else {
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
}

function formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

module.exports = songCommand; 