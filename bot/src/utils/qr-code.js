import qr from 'qr-image'
import { PNG } from 'pngjs'
import fs from 'fs'

function generateQrPngBuffer(text, ecLevel = 'H', scale = 8, margin = 4) {
    return new Promise((resolve, reject) => {
        const opts = { type: 'png', ec_level: ecLevel, size: scale, margin: margin };
        const stream = qr.image(text, opts);
        const chunks = [];
        stream.on('data', c => chunks.push(c));
        stream.on('end', () => resolve(Buffer.concat(chunks)));
        stream.on('error', reject);
    });
}

function readImageFileSync(buffer, filename = '') {
    const ext = (filename.split('.').pop() || '').toLowerCase();
    if (ext === 'png' || buffer.slice(1,4).toString() === 'PNG') {
        const img = PNG.sync.read(buffer);
        return { width: img.width, height: img.height, data: img.data };
    } else {
        throw "Use PNG"
        /*const decoded = jpeg.decode(buffer, { useTArray: true });
         *        const { width, height, data } = decoded;
         *        const rgba = Buffer.alloc(width * height * 4);
         *        for (let i = 0, j = 0; i < data.length; i += 3, j += 4) {
         *        rgba[j] = data[i];
         *        rgba[j+1] = data[i+1];
         *        rgba[j+2] = data[i+2];
         *        rgba[j+3] = 255;
    }
    return { width, height, data: rgba };*/
    }
}

// Билинейный ресайз для RGBA buffers
function resizeBilinear(src, srcW, srcH, dstW, dstH) {
    const dst = Buffer.alloc(dstW * dstH * 4);
    const xRatio = (srcW - 1) / (dstW - 1 || 1);
    const yRatio = (srcH - 1) / (dstH - 1 || 1);

    for (let j = 0; j < dstH; j++) {
        const y = yRatio * j;
        const y0 = Math.floor(y);
        const y1 = Math.min(srcH - 1, y0 + 1);
        const yLerp = y - y0;
        for (let i = 0; i < dstW; i++) {
            const x = xRatio * i;
            const x0 = Math.floor(x);
            const x1 = Math.min(srcW - 1, x0 + 1);
            const xLerp = x - x0;
            for (let c = 0; c < 4; c++) {
                const i00 = (y0 * srcW + x0) * 4 + c;
                const i10 = (y0 * srcW + x1) * 4 + c;
                const i01 = (y1 * srcW + x0) * 4 + c;
                const i11 = (y1 * srcW + x1) * 4 + c;

                const v00 = src[i00];
                const v10 = src[i10];
                const v01 = src[i01];
                const v11 = src[i11];

                const v0 = v00 + (v10 - v00) * xLerp;
                const v1 = v01 + (v11 - v01) * xLerp;
                const v = v0 + (v1 - v0) * yLerp;

                dst[(j * dstW + i) * 4 + c] = Math.round(v);
            }
        }

    }
    return dst;
}

// Альфа-блендинг: src (RGBA) наложить на dst (RGBA)
function overlayOnto(dst, dstW, dstH, src, srcW, srcH, ox, oy) {
    for (let y = 0; y < srcH; y++) {
        const dy = y + oy;
        if (dy < 0 || dy >= dstH) continue;
        for (let x = 0; x < srcW; x++) {
            const dx = x + ox;
            if (dx < 0 || dx >= dstW) continue;
            const sIdx = (y * srcW + x) * 4;
            const dIdx = (dy * dstW + dx) * 4;
            const sa = src[sIdx+3] / 255;
            if (sa === 0) continue;
            const da = dst[dIdx+3] / 255;
            const outA = sa + da * (1 - sa);
            function blendChannel(sc, dc) {
                return Math.round((sc * sa + dc * da * (1 - sa)) / (outA || 1));
            }
            dst[dIdx]   = blendChannel(src[sIdx], dst[dIdx]);
            dst[dIdx+1] = blendChannel(src[sIdx+1], dst[dIdx+1]);
            dst[dIdx+2] = blendChannel(src[sIdx+2], dst[dIdx+2]);
            dst[dIdx+3] = Math.round(outA * 255);
        }

    }
}

function drawFilledRoundedRect(dst, dstW, dstH, ox, oy, w, h, r, color) {
    // color = [r,g,b,a] 0..255
    const rSq = r * r;
    for (let y = 0; y < h; y++) {
        const py = oy + y;
        if (py < 0 || py >= dstH) continue;
        for (let x = 0; x < w; x++) {
            const px = ox + x;
            if (px < 0 || px >= dstW) continue;

            // determine if pixel is inside rounded rect
            let inside = true;
            // top-left corner
            if (x < r && y < r) {
                const dx = r - x - 1;
                const dy = r - y - 1;
                inside = (dx*dx + dy*dy) <= rSq;
            }
            // top-right
            else if (x >= w - r && y < r) {
                const dx = x - (w - r);
                const dy = r - y - 1;
                inside = (dx*dx + dy*dy) <= rSq;
            }
            // bottom-left
            else if (x < r && y >= h - r) {
                const dx = r - x - 1;
                const dy = y - (h - r);
                inside = (dx*dx + dy*dy) <= rSq;
            }
            // bottom-right
            else if (x >= w - r && y >= h - r) {
                const dx = x - (w - r);
                const dy = y - (h - r);
                inside = (dx*dx + dy*dy) <= rSq;
            }
            // else inside center/edges => remain true

            if (inside) {
                const idx = (py * dstW + px) * 4;
                dst[idx] = color[0];
                dst[idx+1] = color[1];
                dst[idx+2] = color[2];
                dst[idx+3] = color[3];
            }
        }
    }
}

export async function generate(text, imageFilePath, opts = {}) {
    const scale = opts.scale || 8;
    const margin = opts.margin || 4;
    const ecLevel = opts.ecLevel || 'H';
    const centerRatio = opts.centerRatio || 0.27;
    const framePadding = opts.framePadding || Math.max(8, Math.round(scale));
    const frameRadius = opts.frameRadius || Math.round((centerRatio * 0.5) * 100) / 100 * 12;
    const frameColor = opts.frameColor || [255,255,255,255];

    const qrBuf = await generateQrPngBuffer(text, ecLevel, scale, margin);
    const qrPng = PNG.sync.read(qrBuf);
    const qrW = qrPng.width, qrH = qrPng.height;

    const centerBuff = fs.readFileSync(imageFilePath);
    const centerImg = readImageFileSync(centerBuff, imageFilePath);

    const targetLogoSize = Math.floor(qrW * centerRatio);
    const innerLogoSize = Math.max(1, targetLogoSize - framePadding * 2);

    const resizedLogo = resizeBilinear(centerImg.data, centerImg.width, centerImg.height, innerLogoSize, innerLogoSize);

    const totalFrameW = innerLogoSize + framePadding * 2;
    const totalFrameH = innerLogoSize + framePadding * 2;
    const ox = Math.floor((qrW - totalFrameW) / 2);
    const oy = Math.floor((qrH - totalFrameH) / 2);

    let r = opts.frameRadius;
    if (!r) {
        r = Math.round(Math.min(totalFrameW, totalFrameH) * 0.12);
    }
    r = Math.max(1, Math.min(Math.floor(Math.min(totalFrameW, totalFrameH) / 2), r));

    drawFilledRoundedRect(qrPng.data, qrW, qrH, ox, oy, totalFrameW, totalFrameH, r, frameColor);

    const logoOx = ox + framePadding;
    const logoOy = oy + framePadding;
    overlayOnto(qrPng.data, qrW, qrH, resizedLogo, innerLogoSize, innerLogoSize, logoOx, logoOy);

    const outBuf = PNG.sync.write(qrPng);
    return { width: qrW, height: qrH, buf: outBuf };
}
