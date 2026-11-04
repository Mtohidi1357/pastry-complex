import type { NextRequest } from "next/server";
import { AppError } from "@/errors/AppError";
import { ApiErrorCode } from "@/types/api";
const limit = 2 * 1024 * 1024;
function invalid(message = "Choose a valid JPEG, PNG or WebP product photo.", status = 400): never { throw new AppError(ApiErrorCode.VALIDATION_ERROR, message, status); }
function text(bytes: Uint8Array, offset: number, length: number) { return String.fromCharCode(...bytes.subarray(offset, offset + length)); }
export function inspectProductImage(bytes: Uint8Array): "image/jpeg" | "image/png" | "image/webp" {
    if (bytes.byteLength > limit) invalid("Product photos must be at most 2 MB after resizing.", 413);
    if (bytes.byteLength < 24) invalid();
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let width = 0, height = 0, mime: "image/jpeg" | "image/png" | "image/webp";
    if ([137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)) {
        if (bytes.length < 45 || view.getUint32(8) !== 13 || text(bytes, 12, 4) !== "IHDR" || text(bytes, bytes.length - 8, 4) !== "IEND") invalid();
        width = view.getUint32(16); height = view.getUint32(20); mime = "image/png";
    } else if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
        if (bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) invalid();
        let offset = 2;
        while (offset + 4 <= bytes.length) {
            if (bytes[offset++] !== 0xff) invalid();
            while (bytes[offset] === 0xff) offset++;
            const marker = bytes[offset++];
            if (marker === 0xda || marker === 0xd9) break;
            if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;
            if (offset + 2 > bytes.length) invalid();
            const size = view.getUint16(offset);
            if (size < 2 || offset + size > bytes.length) invalid();
            if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
                if (size < 8) invalid(); height = view.getUint16(offset + 3); width = view.getUint16(offset + 5); break;
            }
            offset += size;
        }
        mime = "image/jpeg";
    } else if (text(bytes, 0, 4) === "RIFF" && text(bytes, 8, 4) === "WEBP") {
        if (view.getUint32(4, true) + 8 !== bytes.length || bytes.length < 30) invalid();
        const chunk = text(bytes, 12, 4);
        if (chunk === "VP8X") {
            if (bytes[20] & 2) invalid("Use a still product photo rather than an animated image.");
            width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16); height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16);
        } else if (chunk === "VP8 " && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
            width = view.getUint16(26, true) & 0x3fff; height = view.getUint16(28, true) & 0x3fff;
        } else if (chunk === "VP8L" && bytes[20] === 0x2f) {
            const bits = view.getUint32(21, true); width = (bits & 0x3fff) + 1; height = ((bits >>> 14) & 0x3fff) + 1;
        } else invalid();
        mime = "image/webp";
    } else invalid();
    if (!width || !height || width > 4096 || height > 4096 || width * height > 16_777_216) invalid("Product photos must be no larger than 4096 × 4096 pixels.");
    return mime;
}
export async function productImageForm(req: NextRequest): Promise<FormData> {
    const type = req.headers.get("content-type") ?? "";
    if (!type.startsWith("multipart/form-data;")) invalid("Send the photo as multipart form data.");
    if (!req.body) invalid("Choose a product photo.");
    const reader = req.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
    try {
        while (true) {
            const part = await reader.read(); if (part.done) break;
            size += part.value.byteLength;
            if (size > limit + 256 * 1024) { await reader.cancel(); invalid("Photo upload is too large.", 413); }
            chunks.push(part.value);
        }
    } finally { reader.releaseLock(); }
    const buffer = new ArrayBuffer(size), body = new Uint8Array(buffer); let offset = 0;
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length; }
    const form = await new Response(buffer, { headers: { "Content-Type": type } }).formData();
    if ([...form.keys()].some(key => !["file", "version"].includes(key)) || form.getAll("file").length !== 1 || form.getAll("version").length !== 1) invalid("Upload one photo and the current product version.");
    return form;
}
